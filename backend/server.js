'use strict';
require('dotenv').config();
const express=require('express');
const cors=require('cors');
const helmet=require('helmet');
const multer=require('multer');
const {rateLimit}=require('express-rate-limit');
const {randomUUID}=require('node:crypto');
const {v2:cloudinary}=require('cloudinary');
const {connectDatabase,disconnectDatabase,isDatabaseReady,isDatabaseError,getDeliveryCharge}=require('./db');
const app=express();
const PORT=Number(process.env.PORT || 5000);
const MAX_PRESCRIPTION_BYTES=2*1024*1024;
for(const key of ['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','ADMIN_PASSWORD','MONGODB_URI']) {
  if(!process.env[key]?.trim())throw new Error(`Missing backend environment variable: ${key}`);
}
if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw new Error('PORT must be a valid port number.');
if(process.env.NODE_ENV==='production'&&!process.env.FRONTEND_ORIGINS?.trim())throw new Error('Set FRONTEND_ORIGINS in production.');
const origins=(process.env.FRONTEND_ORIGINS || 'http://localhost:3000').split(',').map(s=>s.trim().replace(/\/+$/,''));
if(process.env.TRUST_PROXY_HOPS){const hops=Number(process.env.TRUST_PROXY_HOPS);if(!Number.isInteger(hops)||hops<1)throw new Error('TRUST_PROXY_HOPS must be a positive integer.');app.set('trust proxy',hops);}
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin(origin,cb){if(!origin||origins.includes(origin))return cb(null,true);cb(Object.assign(new Error('This website is not allowed to access the service.'),{status:403}));},methods:['GET','POST','PUT','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization','X-Customer-Token'],maxAge:600}));
cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true});
// Routers below install their own JSON parsers (admin bills need a larger limit), so they mount before the global one.
require('./admin-api')(app,cloudinary);
require('./customer-api')(app);
app.use(express.json({limit:'16kb'}));
app.get('/',(_req,res)=>res.json({service:'Goregaonmeds API',status:'ok',health:'/api/health'}));
app.get('/api/health',(_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const database=isDatabaseReady();
  res.status(database?200:503).json({status:database?'ok':'degraded',database:database?'connected':'unavailable',message:database?'Goregaonmeds backend is running.':'Database connection is unavailable.'});
});
// Public, read-only. The storefront displays this; admin bills resolve the charge again on the server.
const settingsLimiter=rateLimit({windowMs:15*60*1000,limit:150,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many requests. Please retry in a few minutes.'}});
app.get('/api/settings',settingsLimiter,(_req,res,next)=>{
  getDeliveryCharge().then(deliveryCharge=>{res.setHeader('Cache-Control','no-cache');res.json({deliveryCharge});}).catch(next);
});
// Frontend compresses prescriptions to ~800 KB, so 2 MB leaves headroom while capping RAM at 8 × 2 MB.
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_PRESCRIPTION_BYTES,files:1,fields:0,parts:2},fileFilter(_req,file,cb){if(!new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']).has(file.mimetype))return cb(Object.assign(new Error('Choose a JPG, PNG, WEBP, HEIC or HEIF image.'),{status:415}));cb(null,true);}});
const limiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many uploads. Retry in 15 minutes or contact the pharmacy on WhatsApp.'}});
function supported(b){
  if(!Buffer.isBuffer(b)||b.length<12)return false;
  if(b[0]===255&&b[1]===216&&b[2]===255)return true;
  if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return true;
  if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return true;
  return b.toString('ascii',4,8)==='ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(b.toString('ascii',8,Math.min(b.length,64)));
}
let active=0;
app.post('/api/upload',limiter,(req,res,next)=>{
  if(active>=8){res.setHeader('Retry-After','10');return res.status(503).json({error:'Upload service is busy. Please retry shortly.'});}
  active++;let released=false;req.releaseUpload=()=>{if(!released){released=true;active--;}};req.once('aborted',req.releaseUpload);next();
},upload.single('image'),(req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  if(!req.file||!supported(req.file.buffer)){req.releaseUpload();return res.status(415).json({error:'Please attach one supported prescription image.'});}
  let stream,complete=false;
  const finish=()=>{if(complete)return false;complete=true;clearTimeout(timer);res.off('close',closed);req.releaseUpload();return true;};
  const closed=()=>{if(finish())stream?.destroy();};
  const timer=setTimeout(()=>{if(!finish())return;stream?.destroy();if(!res.destroyed&&!res.headersSent)res.status(504).json({error:'Upload timed out. Please retry.'});},65000);
  res.once('close',closed);
  try{
    stream=cloudinary.uploader.upload_stream({folder:'goregaonmeds/prescriptions',public_id:randomUUID(),resource_type:'image',allowed_formats:['jpg','jpeg','png','webp','heic','heif'],overwrite:false,timeout:60000},(error,result)=>{
      if(!finish()||res.destroyed||res.headersSent)return;
      if(error||!result?.secure_url)return res.status(502).json({error:'Image upload failed. Retry or send it directly on WhatsApp.'});
      res.status(201).json({url:result.secure_url});
    });
    stream.on('error',()=>{if(finish()&&!res.headersSent&&!res.destroyed)res.status(502).json({error:'Upload interrupted. Please retry.'});});
    stream.end(req.file.buffer);
  }catch(error){finish();next(error);}
});
app.use((_req,res)=>res.status(404).json({error:'Route not found.'}));
app.use((error,req,res,next)=>{
  req.releaseUpload?.();
  if(res.headersSent)return next(error);
  if(res.destroyed)return;
  if(error instanceof multer.MulterError)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:error.code==='LIMIT_FILE_SIZE'?'Image is too large. Maximum size is 2 MB. Send it directly on WhatsApp instead.':'Attach one image using the image field.'});
  if(error.type==='entity.parse.failed')return res.status(400).json({error:'The request body is not valid JSON.'});
  if(isDatabaseError(error)){console.error('[server] Database error:',error.name);return res.status(503).json({error:'Service is temporarily unavailable. Please retry shortly.'});}
  const status=[400,403,413,415].includes(error.status)?error.status:500;
  if(status===500)console.error('[server] Unexpected error:',error.name || 'Error');
  res.status(status).json({error:status===500?'Something went wrong. Please retry.':error.message});
});
if(require.main===module){
  connectDatabase(process.env.MONGODB_URI).then(()=>{
    const server=app.listen(PORT,()=>console.log(`[server] Goregaonmeds API listening on port ${PORT}`));
    server.requestTimeout=90000;
    server.on('error',e=>{console.error('[server] Could not start:',e.message);process.exit(1);});
    let stopping=false;
    const shutdown=()=>{if(stopping)return;stopping=true;server.close(()=>{disconnectDatabase().finally(()=>process.exit(0));});setTimeout(()=>process.exit(1),10000).unref();};
    process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
  }).catch(error=>{console.error('[server] Could not connect to MongoDB:',error.message);process.exit(1);});
}
module.exports=app;