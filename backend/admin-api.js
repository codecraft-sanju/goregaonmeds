'use strict';
// Mount BEFORE the existing /api/admin/login route, or remove that old route.
// This module owns /api/admin/*, including an authenticated receipt upload.
const express = require('express');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const { randomBytes, createHash, timingSafeEqual, randomUUID } = require('node:crypto');
const { AdminSession, Bill, isDatabaseError, getDeliveryCharge, getStoreSettings, setDeliveryCharge } = require('./db');
const { parseBill, priceBill, parseDeliveryCharge, normalizeIndianMobile, escapeRegex } = require('./validation');
const { firstOrderOfferPublic, firstOrderStatus, resolveFreeGift, releaseClaim, markBillDeleted } = require('./offers');

const BRANCH_NAMES = ['Apple Pharmacy', 'Lotus Pharmacy', 'Healthzone & Cosmetic'];
const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([a-f0-9]{24})$/;
const EXISTING_FIELDS = 'fulfilment shipping phone freeGift';

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function toClientBill(doc) {
  return {
    id: doc.billId, reference: doc.reference, createdAt: doc.billedAt.toISOString(), branch: doc.branch,
    customer: doc.customer, phone: doc.phone, method: doc.method,
    fulfilment: doc.fulfilment ?? 'pickup', shipping: doc.shipping ?? 0, items: doc.items,
    freeGift: doc.freeGift
      ? { offerId: doc.freeGift.offerId, name: doc.freeGift.name, qty: doc.freeGift.qty ?? 1, price: 0, redeemedAt: new Date(doc.freeGift.redeemedAt).toISOString() }
      : null,
    discount: doc.discount, received: doc.received, note: doc.note, savedAt: doc.savedAt.toISOString(),
  };
}

function historyFilter(query) {
  const q = typeof query === 'string' ? query.trim().slice(0, 60) : '';
  if (!q) return {};
  const pattern = new RegExp(escapeRegex(q), 'i');
  const branches = BRANCH_NAMES.flatMap((name, index) => (name.toLowerCase().includes(q.toLowerCase()) ? [index] : []));
  return { $or: [{ reference: pattern }, { customer: pattern }, { phone: pattern }, ...(branches.length ? [{ branch: { $in: branches } }] : [])] };
}

const describeCharge = (paise) => (paise === 0 ? 'FREE' : `₹${(paise / 100).toFixed(2)}`);

/**
 * Resolves the delivery charge on the server: pickup is free, an existing delivery bill keeps its
 * snapshot, and a new delivery bill takes the current store setting. The client's value is only compared.
 */
async function priceForSave(body, bill, existing) {
  const shipping = bill.fulfilment !== 'delivery' ? 0
    : existing?.fulfilment === 'delivery' && Number.isInteger(existing.shipping) ? existing.shipping
    : await getDeliveryCharge();
  if (bill.fulfilment === 'delivery' && Number.isInteger(body.shipping) && body.shipping !== shipping) {
    return {
      status: 409,
      shipping,
      error: `The delivery charge is now ${describeCharge(shipping)}. The bill has been updated. Review it and save again.`,
    };
  }
  const priced = priceBill(bill, shipping);
  return priced.error ? { status: 400, error: priced.error } : priced;
}

function sendPricingError(res, priced) {
  return res.status(priced.status).json({ error: priced.error, ...(priced.shipping !== undefined && { shipping: priced.shipping }) });
}

/** Writes the bill with its server-decided gift; releases a fresh offer claim if the write fails. */
async function writeBill(value, gift, upsert) {
  try {
    return await Bill.findOneAndUpdate(
      { billId: value.billId },
      { $set: { ...value, freeGift: gift.freeGift, savedAt: new Date() } },
      { upsert, returnDocument: 'after', runValidators: true, lean: true },
    );
  } catch (error) {
    if (gift.claimed) await releaseClaim(value);
    throw error;
  }
}

module.exports = function installAdminApi(app, cloudinary) {
  const password = process.env.ADMIN_PASSWORD;
  if (typeof password !== 'string' || password.length < 4 || password.length > 256) {
    throw new Error('ADMIN_PASSWORD must contain 4–256 characters. Set it only in the backend environment.');
  }
  const digest = value => createHash('sha256').update(value).digest();
  const expected = digest(password);
  // Sessions live in MongoDB so they survive backend restarts and Render instance recycling.
  const TTL = 4 * 60 * 60 * 1000;
  const router = express.Router();
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  // A full 50-line bill can exceed the global 16 KB JSON limit, so admin routes get their own parser.
  router.use(express.json({ limit: '64kb' }));

  const loginLimit = rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many sign-in attempts. Try again in 15 minutes.'}});
  router.post('/login', loginLimit, asyncRoute(async (req,res)=> {
    const supplied=req.body?.password;
    if(typeof supplied!=='string' || supplied.length>256 || !timingSafeEqual(digest(supplied),expected)) return res.status(401).json({error:'Incorrect administrator password.'});
    const active = await AdminSession.countDocuments({ expiresAt: { $gt: new Date() } });
    if(active >= 100) return res.status(503).json({error:'Session capacity reached. Please try again later.'});
    const token=randomBytes(32).toString('hex');
    const expiresAt=Date.now()+TTL;
    await AdminSession.create({ tokenHash: digest(token).toString('hex'), expiresAt: new Date(expiresAt) });
    return res.json({token,expiresAt});
  }));

  router.use(asyncRoute(async (req,res,next)=>{
    const match=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
    if(!match) return res.status(401).json({error:'Sign in to continue.'});
    const key=digest(match[1]).toString('hex');
    // The TTL monitor runs about once a minute, so expiry is also enforced in the query.
    const session = await AdminSession.findOne({ tokenHash: key, expiresAt: { $gt: new Date() } }).lean();
    if(!session) return res.status(401).json({error:'Your session expired. Please sign in again.'});
    req.adminSessionKey=key; req.adminSessionExpiresAt=session.expiresAt.getTime(); next();
  }));
  router.get('/session',(req,res)=>res.json({authenticated:true,expiresAt:req.adminSessionExpiresAt}));
  router.post('/logout',asyncRoute(async (req,res)=>{await AdminSession.deleteOne({tokenHash:req.adminSessionKey});res.json({success:true});}));

  const billLimit = rateLimit({windowMs:15*60*1000,limit:300,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many billing requests. Please wait a few minutes.'}});

  // Store settings (delivery charge)
  router.get('/settings', billLimit, asyncRoute(async (_req, res) => res.json({ ...(await getStoreSettings()), firstOrderOffer: firstOrderOfferPublic() })));

  router.put('/settings', billLimit, asyncRoute(async (req, res) => {
    const parsed = parseDeliveryCharge(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    return res.json({ ...(await setDeliveryCharge(parsed.value)), firstOrderOffer: firstOrderOfferPublic() });
  }));

  // First Order Offer eligibility preview. Admin-only so phone numbers cannot be probed publicly.
  router.get('/offers/first-order', billLimit, asyncRoute(async (req, res) => {
    const phone = normalizeIndianMobile(typeof req.query.phone === 'string' ? req.query.phone : '');
    if (!phone) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
    const billId = typeof req.query.billId === 'string' ? req.query.billId.slice(0, 64) : '';
    const { status, redemption } = await firstOrderStatus(phone, billId);
    return res.json({
      phone,
      status,
      redeemedAt: redemption ? new Date(redemption.redeemedAt).toISOString() : null,
      reference: status === 'already_redeemed' ? redemption.reference || null : null,
      firstOrderOffer: firstOrderOfferPublic(),
    });
  }));

  // Create Bill
  router.post('/bills', billLimit, asyncRoute(async (req,res)=>{
    const parsed = parseBill(req.body);
    if(parsed.error) return res.status(400).json({error:parsed.error});
    const existing = await Bill.findOne({ billId: parsed.value.billId }).select(EXISTING_FIELDS).lean();
    const priced = await priceForSave(req.body, parsed.value, existing);
    if(priced.error) return sendPricingError(res, priced);
    const gift = await resolveFreeGift(priced.value, existing);
    if(gift.error) return res.status(gift.status).json({ error: gift.error });
    const doc = await writeBill(priced.value, gift, true);
    return res.status(existing ? 200 : 201).json({ bill: toClientBill(doc), created: !existing, giftAdded: !!gift.claimed });
  }));

  // Read Bills (Pagination)
  router.get('/bills', billLimit, asyncRoute(async (req,res)=>{
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? '25'), 10) || 25, 1), 50);
    const filter = historyFilter(req.query.q);
    const conditions = filter.$or ? [filter] : [];
    if (req.query.cursor !== undefined) {
      const cursor = typeof req.query.cursor === 'string' ? CURSOR.exec(req.query.cursor) : null;
      if (!cursor) return res.status(400).json({ error: 'Invalid history cursor.' });
      const savedAt = new Date(cursor[1]);
      conditions.push({ $or: [{ savedAt: { $lt: savedAt } }, { savedAt, _id: {$lt: cursor[2] } }] });
    }
    const pageFilter = conditions.length ? { $and: conditions } : {};
    const [docs, total] = await Promise.all([
      Bill.find(pageFilter).sort({ savedAt: -1, _id: -1 }).limit(limit + 1).lean(),
      Bill.countDocuments(filter),
    ]);
    const page = docs.slice(0, limit);
    const last = page.at(-1);
    return res.json({
      bills: page.map(toClientBill),
      total,
      nextCursor: docs.length > limit && last ? `${last.savedAt.toISOString()}_${last._id}` : null,
    });
  }));

  // Read Single Bill (For Edit Pre-fill)
  router.get('/bills/:billId', billLimit, asyncRoute(async (req, res) => {
    const bill = await Bill.findOne({ billId: req.params.billId }).lean();
    if (!bill) return res.status(404).json({ error: 'Bill not found.' });
    return res.json({ bill: toClientBill(bill) });
  }));

  // Update Bill (Edit)
  router.put('/bills/:billId', billLimit, asyncRoute(async (req, res) => {
    const parsed = parseBill(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    
    if (parsed.value.billId !== req.params.billId) {
      return res.status(400).json({ error: 'Bill ID mismatch in request.' });
    }

    const existing = await Bill.findOne({ billId: req.params.billId }).select(EXISTING_FIELDS).lean();
    if (!existing) return res.status(404).json({ error: 'Bill not found or already deleted.' });
    const priced = await priceForSave(req.body, parsed.value, existing);
    if (priced.error) return sendPricingError(res, priced);
    const gift = await resolveFreeGift(priced.value, existing);
    if (gift.error) return res.status(gift.status).json({ error: gift.error });

    const doc = await writeBill(priced.value, gift, false);
    if (!doc) {
      if (gift.claimed) await releaseClaim(priced.value);
      return res.status(404).json({ error: 'Bill not found or already deleted.' });
    }
    return res.json({ bill: toClientBill(doc), updated: true, giftAdded: !!gift.claimed });
  }));

  // Delete Bill
  router.delete('/bills/:billId', billLimit, asyncRoute(async (req, res) => {
    const result = await Bill.deleteOne({ billId: req.params.billId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Bill not found.' });
    }
    // The offer redemption stays: that number has used its First Order Offer.
    await markBillDeleted(req.params.billId);
    return res.json({ success: true, message: 'Bill deleted successfully.' });
  }));

  // Receipts are ~960px-wide PNGs; even a 50-line bill stays well under 2 MB.
  // A small in-memory limit keeps worst-case RAM at 4 concurrent uploads × 2 MB.
  const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_RECEIPT_BYTES,files:1,fields:0,parts:2},fileFilter(_req,file,cb){if(file.mimetype!=='image/png') return cb(Object.assign(new Error('Receipt uploads must be PNG images.'),{status:415}));cb(null,true);}});
  const uploadLimit=rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Receipt upload limit reached. Download or print this bill instead.'}});
  let active=0;
  router.post('/upload', uploadLimit, (req,res,next)=>{
    if(active>=4) {res.setHeader('Retry-After','10');return res.status(503).json({error:'Receipt service is busy. Retry shortly.'});}
    active++;
    let ended=false;
    req.releaseReceiptSlot=()=>{if(!ended){ended=true;active--;}};
    req.once('aborted',req.releaseReceiptSlot);
    next();
  }, upload.single('image'), (req,res,next)=>{
    const release=req.releaseReceiptSlot;
    if(!req.file || !req.file.buffer.subarray(0,8).equals(PNG_SIGNATURE)){release();return res.status(415).json({error:'Attach a valid PNG receipt.'});}
    let stream;
    let complete=false;
    const finish=()=>{if(complete)return false;complete=true;clearTimeout(timer);res.off('close',closed);release();return true;};
    const closed=()=>{if(finish()) stream?.destroy();};
    const timer=setTimeout(()=>{if(!finish())return;stream?.destroy();if(!res.destroyed&&!res.headersSent)res.status(504).json({error:'Receipt upload timed out. Please retry.'});},65000);
    res.once('close',closed);
    try {
      stream=cloudinary.uploader.upload_stream({folder:'goregaonmeds/receipts',public_id:randomUUID(),resource_type:'image',allowed_formats:['png'],overwrite:false,timeout:60000},(error,result)=>{
        if(!finish() || res.destroyed || res.headersSent)return;
        if(error || !result?.secure_url) return res.status(502).json({error:'Receipt upload failed. Download or print the bill instead.'});
        return res.status(201).json({url:result.secure_url});
      });
      stream.on('error',()=>{if(finish() && !res.destroyed && !res.headersSent)res.status(502).json({error:'Receipt upload interrupted.'});});
      stream.end(req.file.buffer);
    } catch(error){finish();next(error);}
  });

  router.use((error,req,res,_next)=>{
    req.releaseReceiptSlot?.();
    if(res.headersSent || res.destroyed)return;
    if(error instanceof multer.MulterError) return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:error.code==='LIMIT_FILE_SIZE'?'Maximum receipt size is 2 MB. Print or download the bill instead.':'Upload one receipt using the image field.'});
    if(error.type==='entity.too.large') return res.status(413).json({error:'This bill is too large to save.'});
    if(error.type==='entity.parse.failed') return res.status(400).json({error:'The request body is not valid JSON.'});
    if(error.status===415) return res.status(415).json({error:error.message});
    if(isDatabaseError(error)) { console.error('[admin] Database error:', error.name); return res.status(503).json({error:'The billing database is unavailable. Please retry shortly.'}); }
    console.error('[admin] Unexpected error:', error.name || 'Error');
    return res.status(500).json({error:'The admin service could not complete this request.'});
  });
  router.use((_req,res)=>res.status(404).json({error:'Admin route not found.'}));
  app.use('/api/admin',router);
};