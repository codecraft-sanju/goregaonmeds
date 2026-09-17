'use strict';

require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const compression = require('compression');
const morgan = require('morgan');
const QRCode = require('qrcode');
const { v2: cloudinary } = require('cloudinary');
const { z } = require('zod');

const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[config] Missing required env var: ${key}`);
    process.exit(1);
  }
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('[config] JWT_SECRET must be at least 32 characters.');
  process.exit(1);
}

const normalizePath = (value, fallback) => {
  const raw = String(value || fallback).trim();
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY || (process.env.NODE_ENV === 'production' ? '1' : 'loopback'),
  cookieSameSite: process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax'),
  allowDevSeed: process.env.ALLOW_DEV_SEED === 'true',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  // 🟢 NEW: Updated to point to your Custom Baileys Gateway
  whatsappGateway: {
    apiUrl: (process.env.WA_GATEWAY_URL || '').trim().replace(/\/$/, ''), // e.g. http://localhost:3000
    apiKey: process.env.WA_API_KEY,     // Your User API Key from Gateway
    autoAdvanceToPlaced: process.env.OPENWA_AUTO_PLACED !== 'false',
    timeoutMs: Number(process.env.WA_GATEWAY_TIMEOUT_MS) || 15000,
    connectTimeoutMs: Number(process.env.WA_GATEWAY_CONNECT_TIMEOUT_MS) || 30000,
    paths: {
      send: normalizePath(process.env.WA_GATEWAY_SEND_PATH, '/send-message'),
      status: normalizePath(process.env.WA_GATEWAY_STATUS_PATH, '/session/status'),
      connect: normalizePath(process.env.WA_GATEWAY_CONNECT_PATH, '/session/connect'),
      logout: normalizePath(process.env.WA_GATEWAY_LOGOUT_PATH, '/session/logout'),
    },
  },
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    phone: process.env.SEED_ADMIN_PHONE || '9999999999',
  },
};

const isProd = config.env === 'production';
const cloudinaryEnabled = Boolean(
  config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret,
);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
} else {
  console.warn('[config] Cloudinary credentials missing — image upload routes will return 503.');
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const waGatewayEnabled = Boolean(
  config.whatsappGateway.apiUrl &&
    config.whatsappGateway.apiKey &&
    isHttpUrl(config.whatsappGateway.apiUrl),
);

if (!waGatewayEnabled) {
  console.warn(
    '[config] Custom WA Gateway credentials missing or WA_GATEWAY_URL is invalid — order and status WhatsApp messages are disabled.',
  );
} else if (isProd && config.whatsappGateway.apiUrl.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(config.whatsappGateway.apiUrl)) {
  console.warn('[config] WA_GATEWAY_URL uses plain http in production. Use https so the API key is not sent in clear text.');
}



class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class GatewayError extends Error {
  constructor(message, { status = 0, unreachable = false } = {}) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
    this.unreachable = unreachable;
  }
}

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;
const WHATSAPP_RE = /^\d{10,15}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,128}$/;
const PRESCRIPTION_FOLDER = 'lotus-pharmacy/prescriptions';
const PRODUCT_FOLDER = 'lotus-pharmacy/products';
const BUSINESS_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60 * 1000;

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const buildSearchRegex = (value) => new RegExp(escapeRegex(value.slice(0, 60)), 'i');
const round2 = (value) => Number((Math.round(value * 100) / 100).toFixed(2));

const maskPhone = (value) => {
  const digits = digitsOnly(value);
  return digits.length > 4 ? `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}` : '****';
};

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const formatMoney = (value) =>
  currencyFormatter.format(Number.isFinite(value) ? value : 0);

// Outbound message text is user-supplied; strip control characters and cap length
// so a crafted name or landmark cannot reshape the message body.
const sanitizeForMessage = (value, maxLength = 120) =>
  String(value ?? '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const percentChange = (current, previous) => {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

function startOfISTDay(daysBack = 0) {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const utcMs =
    Date.UTC(
      nowIST.getUTCFullYear(),
      nowIST.getUTCMonth(),
      nowIST.getUTCDate() - daysBack,
      0,
      0,
      0,
      0,
    ) - IST_OFFSET_MS;
  return new Date(utcMs);
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a || ''));
  const bBuf = Buffer.from(String(b || ''));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}


const { Schema, model, Types } = mongoose;



const addressSchema = new Schema(
  {
    label: { type: String, trim: true, maxlength: 30, default: 'Home' },
    houseNo: { type: String, trim: true, maxlength: 120, default: '' },
    area: { type: String, trim: true, maxlength: 120, default: '' },
    landmark: { type: String, trim: true, maxlength: 120, default: '' },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: [true, 'Name is required.'], trim: true, maxlength: 60 },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 120,
    },
    phone: { type: String, required: [true, 'Phone is required.'], index: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer', index: true },
    isActive: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0, select: false },
    addresses: { type: [addressSchema], default: [] },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    addresses: this.addresses || [],
  };
};

const User = model('User', userSchema);

/* ---------- Branch ---------- */

const branchSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    shortName: { type: String, required: true, trim: true, maxlength: 30 },
    phone: { type: String, required: true },
    address: { type: String, required: true, trim: true, maxlength: 120 },
    fullAddress: { type: String, required: true, trim: true, maxlength: 300 },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    serviceRadiusKm: { type: Number, min: 0.5, max: 50, default: 8 },
    open24h: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

const Branch = model('Branch', branchSchema);

/* ---------- Medicine ---------- */

const inventorySchema = new Schema(
  {
    branch: { type: Types.ObjectId, ref: 'Branch', required: true },
    stockUnits: { type: Number, min: 0, default: 0 },
    lowStockAt: { type: Number, min: 0, default: 5 },
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false },
);

const medicineSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120, index: true },
    use: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, required: true, trim: true, maxlength: 60, index: true },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },
    packSize: { type: Number, required: true, min: 1, default: 1 },
    packType: { type: String, required: true, trim: true, maxlength: 30, default: 'Strip' },
    unitType: { type: String, required: true, trim: true, maxlength: 30, default: 'Tablet' },
    isDivisible: { type: Boolean, default: false },
    requiresPrescription: { type: Boolean, default: false },
    emoji: { type: String, trim: true, maxlength: 8, default: '💊' },
    imageUrl: { type: String, trim: true, default: '' },
    imagePublicId: { type: String, trim: true, default: '' },
    tag: { type: String, trim: true, maxlength: 30, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    inventory: { type: [inventorySchema], default: [] },
  },
  { timestamps: true },
);

medicineSchema.index({ isActive: 1, createdAt: -1 });
medicineSchema.index({ category: 1, isActive: 1 });
medicineSchema.index({ 'inventory.branch': 1, isActive: 1 });

medicineSchema.pre('validate', function checkPricing() {
  if (typeof this.mrp === 'number' && typeof this.price === 'number' && this.mrp < this.price) {
    this.invalidate('mrp', 'MRP cannot be lower than the selling price.');
  }
  if (!this.isDivisible) this.packSize = 1;
});

const Medicine = model('Medicine', medicineSchema);

/* ---------- Order ---------- */

const ORDER_STATUSES = [
  'pending_whatsapp',
  'placed',
  'confirmed',
  'packed',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

const ORDER_TRANSITIONS = {
  pending_whatsapp: ['placed', 'confirmed', 'cancelled'],
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const orderItemSchema = new Schema(
  {
    medicine: { type: Types.ObjectId, ref: 'Medicine', required: true },
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    buyType: { type: String, enum: ['full', 'loose'], required: true },
    qty: { type: Number, required: true, min: 1, max: 50 },
    stockUnitsPerQty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitMrp: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    requiresPrescription: { type: Boolean, default: false },
  },
  { _id: false },
);

const statusHistorySchema = new Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: Types.ObjectId, ref: 'User', default: null },
    note: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    idempotencyKey: { type: String, unique: true, sparse: true, index: true },
    user: { type: Types.ObjectId, ref: 'User', default: null, index: true },
    branch: { type: Types.ObjectId, ref: 'Branch', required: true, index: true },
    type: { type: String, enum: ['cart', 'prescription'], default: 'cart' },
    items: { type: [orderItemSchema], default: [] },
    customer: {
      name: { type: String, required: true, trim: true, maxlength: 60 },
      phone: { type: String, required: true },
      houseNo: { type: String, required: true, trim: true, maxlength: 120 },
      area: { type: String, trim: true, maxlength: 120, default: '' },
      landmark: { type: String, trim: true, maxlength: 120, default: '' },
    },
    prescriptionPublicId: { type: String, trim: true, default: '' },
    hasPrescription: { type: Boolean, default: false },
    estimatedTotal: { type: Number, required: true, min: 0 },
    estimatedSavings: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending_whatsapp', index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },
    stockCommitted: { type: Boolean, default: false },
    whatsappOpenedAt: Date,
    customerNotifiedAt: Date,
    note: { type: String, trim: true, maxlength: 300, default: '' },
  },
  // Two admins moving the same order at once must not both commit stock.
  { timestamps: true, optimisticConcurrency: true },
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'customer.phone': 1 });
orderSchema.index({ status: 1, customerNotifiedAt: 1, createdAt: 1 });

orderSchema.pre('validate', function assignOrderNumber() {
  if (!this.orderNumber) {
    const stamp = Date.now().toString(36).toUpperCase();
    const noise = crypto.randomBytes(2).toString('hex').toUpperCase();
    this.orderNumber = `LP-${stamp}${noise}`;
  }
  if (!this.statusHistory?.length) {
    this.statusHistory = [{ status: this.status || 'pending_whatsapp', at: new Date() }];
  }
});

const Order = model('Order', orderSchema);

// /* ================================================================== */
// /*  4. AUTH + CSRF                                                    */
// /* ================================================================== */

// const COOKIE_NAME = 'lp_session';
// const CSRF_COOKIE_NAME = 'lp_csrf';

// const baseCookieOptions = () => ({
//   secure: isProd,
//   sameSite: config.cookieSameSite,
//   path: '/',
// });

// const sessionCookieOptions = () => ({
//   ...baseCookieOptions(),
//   httpOnly: true,
//   maxAge: 7 * 24 * 60 * 60 * 1000,
// });

// const csrfCookieOptions = () => ({
//   ...baseCookieOptions(),
//   httpOnly: true,
//   maxAge: 24 * 60 * 60 * 1000,
// });

// function signToken(user) {
//   return jwt.sign(
//     {
//       sub: user._id.toString(),
//       role: user.role,
//       tv: user.tokenVersion || 0,
//     },
//     config.jwtSecret,
//     { expiresIn: config.jwtExpiresIn },
//   );
// }

// function sendAuthCookie(res, user) {
//   res.cookie(COOKIE_NAME, signToken(user), sessionCookieOptions());
// }

// function clearAuthCookie(res) {
//   res.clearCookie(COOKIE_NAME, sessionCookieOptions());
// }

// function issueCsrf(req, res) {
//   let token = req.cookies?.[CSRF_COOKIE_NAME];
//   if (!token || token.length < 32) {
//     token = crypto.randomBytes(32).toString('hex');
//     res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
//     // 🟢 DEBUG LOG: Pata chalega ki token generate/send ho raha hai ya nahi
//     console.log(`[CSRF DEBUG] Issued NEW token to origin: ${req.get('origin')}`);
//   } else {
//     // 🟢 DEBUG LOG: Pata chalega ki browser ne existing token bheja hai
//     console.log(`[CSRF DEBUG] Re-using EXISTING token for origin: ${req.get('origin')}`);
//   }
//   return token;
// }

// function csrfProtection(req, _res, next) {
//   if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

//   const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
//   const headerToken = req.get('x-csrf-token');

//   if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {

//     console.error(`\n=== ❌ CSRF FAILED DEBUG ===`);
//     console.error(`Failed Request : ${req.method} ${req.originalUrl}`);
//     console.error(`Frontend Origin: ${req.get('origin')}`);
//     console.error(`Cookie Token   : ${cookieToken ? 'RECEIVED (Length: ' + cookieToken.length + ')' : 'MISSING'}`);
//     console.error(`Header Token   : ${headerToken ? 'RECEIVED (Length: ' + headerToken.length + ')' : 'MISSING'}`);
    
//     if (cookieToken && headerToken) {
//       console.error(`Tokens Match?  : NO (Values differ)`);
//     } else if (!cookieToken) {
//       console.error(`Reason         : Browser ne cookie send nahi ki. (Cross-origin/SameSite ka issue ho sakta hai)`);
//     } else if (!headerToken) {
//       console.error(`Reason         : Frontend ne 'x-csrf-token' header add nahi kiya.`);
//     }
    
//     console.error(`All Cookies    :`, req.cookies);
//     console.error(`============================\n`);

//     return next(new ApiError(403, 'Security token missing or expired. Refresh and try again.'));
//   }
//   next();
// }

// function csrfProtection(req, _res, next) {
//   if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

//   const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
//   const headerToken = req.get('x-csrf-token');

//   if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
//     return next(new ApiError(403, 'Security token missing or expired. Refresh and try again.'));
//   }
//   next();
// }

// async function authUserFromRequest(req) {
//   const token = req.cookies?.[COOKIE_NAME];
//   if (!token) return null;

//   let payload;
//   try {
//     payload = jwt.verify(token, config.jwtSecret);
//   } catch {
//     return null;
//   }

//   const user = await User.findById(payload.sub).select('+tokenVersion');
//   if (!user || !user.isActive) return null;
//   if ((user.tokenVersion || 0) !== (payload.tv || 0)) return null;
//   return user;
// }

// const optionalAuth = asyncHandler(async (req, _res, next) => {
//   req.user = await authUserFromRequest(req);
//   next();
// });

// const protect = asyncHandler(async (req, _res, next) => {
//   const user = await authUserFromRequest(req);
//   if (!user) throw new ApiError(401, 'Your session expired. Sign in again.');
//   req.user = user;
//   next();
// });

// const adminOnly = (req, _res, next) => {
//   if (req.user?.role !== 'admin') return next(new ApiError(403, 'Admin access only.'));
//   next();
// };

/* ================================================================== */
/*  4. AUTH (Bearer Token Based)                                      */
/* ================================================================== */

function signToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      tv: user.tokenVersion || 0,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

async function authUserFromRequest(req) {
  // 🟢 Ab hum cookie ki jagah Authorization header padhenge
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.split(' ')[1];
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }

  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || !user.isActive) return null;
  if ((user.tokenVersion || 0) !== (payload.tv || 0)) return null;
  return user;
}

const optionalAuth = asyncHandler(async (req, _res, next) => {
  req.user = await authUserFromRequest(req);
  next();
});

const protect = asyncHandler(async (req, _res, next) => {
  const user = await authUserFromRequest(req);
  if (!user) throw new ApiError(401, 'Your session expired. Sign in again.');
  req.user = user;
  next();
});

const adminOnly = (req, _res, next) => {
  if (req.user?.role !== 'admin') return next(new ApiError(403, 'Admin access only.'));
  next();
};

/* ================================================================== */
/*  5. CLOUDINARY                                                     */
/* ================================================================== */

const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_MIME.has(file.mimetype)) {
      return cb(new ApiError(415, 'Upload a JPG, PNG, WEBP or HEIC image.'));
    }
    cb(null, true);
  },
});

const requireCloudinary = (_req, _res, next) => {
  if (!cloudinaryEnabled) return next(new ApiError(503, 'Image uploads are not configured yet.'));
  next();
};

function uploadPublicProduct(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: PRODUCT_FOLDER,
        resource_type: 'image',
        type: 'upload',
        overwrite: false,
        transformation: [
          { width: 600, height: 600, crop: 'fill', gravity: 'auto' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.end(buffer);
  });
}

function uploadPrivatePrescription(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: PRESCRIPTION_FOLDER,
        resource_type: 'image',
        type: 'authenticated',
        overwrite: false,
        transformation: [
          { width: 1600, crop: 'limit' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.end(buffer);
  });
}

async function destroyCloudinaryAsset(publicId, type = 'upload') {
  if (!cloudinaryEnabled || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type, invalidate: true });
  } catch (error) {
    console.warn('[cloudinary] Failed to delete asset', publicId, error.message);
  }
}

function productUrlIsOurs(url) {
  if (!url) return true;
  if (!cloudinaryEnabled) return false;
  return url.startsWith(`https://res.cloudinary.com/${config.cloudinary.cloudName}/`);
}

function makePrescriptionUploadToken(publicId) {
  return jwt.sign(
    { purpose: 'prescription-upload', publicId },
    config.jwtSecret,
    { expiresIn: '20m' },
  );
}

function readPrescriptionUploadToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.purpose !== 'prescription-upload') return null;
    if (!String(payload.publicId || '').startsWith(`${PRESCRIPTION_FOLDER}/`)) return null;
    return String(payload.publicId);
  } catch {
    return null;
  }
}

function signedPrescriptionUrl(publicId) {
  return cloudinary.url(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    secure: true,
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + 10 * 60,
  });
}

/* ================================================================== */
/*  6. WHATSAPP (Custom Gateway integration)                          */
/* ================================================================== */

const WA_MAX_TEXT = 4096;
const WA_THROTTLE_WINDOW_MS = 10 * 60 * 1000;
const WA_THROTTLE_MAX_PER_CHAT = 6;
const WA_RETRY_BATCH = 20;
const WA_RETRY_WINDOW_MS = 72 * 60 * 60 * 1000;
const WA_QR_MAX_RAW_LENGTH = 4096;
const QR_DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const PNG_BASE64_RE = /^iVBORw0KGgo[A-Za-z0-9+/=]+$/;
const WA_CONNECTED_STATES = new Set([
  'open', 'connected', 'authenticated', 'ready', 'online', 'working', 'inchat', 'logged_in',
]);
const WA_CONNECTING_STATES = new Set([
  'connecting', 'initializing', 'starting', 'syncing', 'pairing', 'loading', 'qr',
  'scan_qr_code', 'qrcode', 'waiting_qr', 'pending',
]);

const waSendLog = new Map();

let waLastKnown = {
  state: waGatewayEnabled ? 'unknown' : 'not_configured',
  checkedAt: null,
};

function waThrottleAllows(phoneRaw) {
  const now = Date.now();

  if (waSendLog.size > 5000) {
    for (const [key, stamps] of waSendLog) {
      const fresh = stamps.filter((at) => now - at < WA_THROTTLE_WINDOW_MS);
      if (fresh.length === 0) waSendLog.delete(key);
      else waSendLog.set(key, fresh);
    }
  }

  const recent = (waSendLog.get(phoneRaw) || []).filter(
    (at) => now - at < WA_THROTTLE_WINDOW_MS,
  );

  if (recent.length >= WA_THROTTLE_MAX_PER_CHAT) {
    waSendLog.set(phoneRaw, recent);
    return false;
  }

  recent.push(now);
  waSendLog.set(phoneRaw, recent);
  return true;
}

// The API key only ever travels server-to-server. The browser talks to our
// admin routes, never to the gateway directly.
async function gatewayRequest(path, { body = {}, timeoutMs } = {}) {
  let response;

  try {
    response = await fetch(`${config.whatsappGateway.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': config.whatsappGateway.apiKey,
      },
      body: JSON.stringify({ apiKey: config.whatsappGateway.apiKey, ...body }),
      signal: AbortSignal.timeout(timeoutMs || config.whatsappGateway.timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new GatewayError(
      timedOut
        ? 'The WhatsApp gateway did not respond in time.'
        : 'The WhatsApp gateway is unreachable.',
      { unreachable: true },
    );
  }

  const text = await response.text().catch(() => '');
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok || data?.success === false) {
    const reason = sanitizeForMessage(
      data?.message || data?.error || `Gateway responded with HTTP ${response.status}.`,
      200,
    );
    throw new GatewayError(reason, { status: response.status });
  }

  return data ?? {};
}

function pickFirst(source, keys) {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

async function toQrDataUrl(rawQr) {
  if (typeof rawQr !== 'string') return null;
  const value = rawQr.trim();
  if (!value) return null;

  // Only raster data URLs are passed through; an SVG data URL could carry script.
  if (value.startsWith('data:image/')) return QR_DATA_URL_RE.test(value) ? value : null;
  if (PNG_BASE64_RE.test(value)) return `data:image/png;base64,${value}`;
  if (value.length > WA_QR_MAX_RAW_LENGTH) return null;

  return QRCode.toDataURL(value, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 360,
    color: { dark: '#0B1220', light: '#FFFFFF' },
  });
}

function buildSession(overrides = {}) {
  return {
    configured: waGatewayEnabled,
    reachable: waGatewayEnabled,
    state: waGatewayEnabled ? 'disconnected' : 'not_configured',
    phone: '',
    name: '',
    qr: null,
    message: '',
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Gateways built on Baileys shape their session payloads differently, so read
// the common field names and collapse them into one predictable contract.
async function normalizeGatewaySession(payload) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const data = root.data && typeof root.data === 'object' ? { ...root, ...root.data } : root;
  const session =
    data.session && typeof data.session === 'object' ? { ...data, ...data.session } : data;

  const rawState = String(
    pickFirst(session, ['status', 'state', 'connection', 'sessionStatus']) ?? '',
  )
    .toLowerCase()
    .replace(/\s+/g, '_');

  const connected =
    session.connected === true ||
    session.isConnected === true ||
    WA_CONNECTED_STATES.has(rawState);

  const qr = connected
    ? null
    : await toQrDataUrl(
        pickFirst(session, ['qr', 'qrCode', 'qrcode', 'qr_code', 'base64', 'qrImage']),
      );

  const account =
    pickFirst(session, ['me', 'user', 'account', 'info']) &&
    typeof pickFirst(session, ['me', 'user', 'account', 'info']) === 'object'
      ? pickFirst(session, ['me', 'user', 'account', 'info'])
      : {};

  const phoneRaw =
    pickFirst(account, ['phone', 'number', 'id', 'wid']) ??
    pickFirst(session, ['phone', 'number', 'wid']);
  const phone = digitsOnly(String(phoneRaw ?? '').split(':')[0].split('@')[0]).slice(0, 15);

  const name = sanitizeForMessage(
    pickFirst(account, ['name', 'pushName', 'verifiedName']) ?? pickFirst(session, ['pushName']) ?? '',
    60,
  );

  let state = 'disconnected';
  if (connected) state = 'connected';
  else if (qr) state = 'qr';
  else if (WA_CONNECTING_STATES.has(rawState)) state = 'connecting';

  return buildSession({
    state,
    phone: connected ? phone : '',
    name: connected ? name : '',
    qr,
  });
}

function rememberSession(session) {
  waLastKnown = { state: session.state, checkedAt: session.checkedAt };
}

async function fetchWhatsAppSession() {
  if (!waGatewayEnabled) {
    return buildSession({
      message: 'Set WA_GATEWAY_URL and WA_API_KEY on the server to enable WhatsApp.',
    });
  }

  let session;

  try {
    session = await normalizeGatewaySession(
      await gatewayRequest(config.whatsappGateway.paths.status),
    );
  } catch (error) {
    if (error instanceof GatewayError && error.status === 404) {
      session = buildSession({ state: 'disconnected' });
    } else {
      session = buildSession({
        reachable: false,
        state: 'unreachable',
        message: error?.message || 'The WhatsApp gateway is unreachable.',
      });
    }
  }

  rememberSession(session);
  return session;
}

function countUnnotifiedOrders() {
  return Order.countDocuments({
    status: 'pending_whatsapp',
    customerNotifiedAt: null,
    createdAt: { $gte: new Date(Date.now() - WA_RETRY_WINDOW_MS) },
  });
}

/**
 * 🟢 NEW: Calls your custom Baileys gateway API using Fetch
 */
async function sendWhatsAppText(phone, text, context, mediaUrls = []) {
  if (!waGatewayEnabled || !phone || !text) return false;

  if (!waThrottleAllows(phone)) {
    console.warn('[whatsapp] Throttled', { context, phone: maskPhone(phone) });
    return false;
  }

  try {
    const payload = {
      phone,
      msg: text.slice(0, WA_MAX_TEXT),
      type: 'whatsapp',
    };

    if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
      payload.mediaUrls = mediaUrls;
    }

    const data = await gatewayRequest(config.whatsappGateway.paths.send, { body: payload });

    if (data.success) {
      return true;
    }

    console.error('[whatsapp] Gateway Error:', sanitizeForMessage(data.message || 'No success flag returned.', 200));
    return false;
  } catch (error) {
    console.error('[whatsapp] Send failed', {
      context,
      phone: maskPhone(phone),
      message: error?.message,
    });
    return false;
  }
}

/** 🟢 NEW: Your Gateway automatically handles `@s.whatsapp.net` */
function customerChatId(phone) {
  const digits = digitsOnly(phone);
  if (!INDIAN_MOBILE_RE.test(digits)) return null;
  return `91${digits}`;
}

function branchChatId(phone) {
  const digits = digitsOnly(phone);
  if (!WHATSAPP_RE.test(digits)) return null;
  return digits;
}

function formatCustomerAddress(customer) {
  return [
    sanitizeForMessage(customer.houseNo),
    sanitizeForMessage(customer.area),
    customer.landmark ? `near ${sanitizeForMessage(customer.landmark)}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function formatOrderLines(items) {
  return items.map(
    (item, index) =>
      `${index + 1}. ${sanitizeForMessage(item.displayName, 80)} × ${item.qty} — ${formatMoney(
        item.lineTotal,
      )}`,
  );
}

function customerOrderMessage(order, branch) {
  const branchName = sanitizeForMessage(branch.name, 80);
  const lines = [
    `Hello ${sanitizeForMessage(order.customer.name, 40)}, thank you for your order with ${branchName}.`,
    '',
    `Order number: ${order.orderNumber}`,
  ];

  if (order.type === 'prescription') {
    lines.push(
      '',
      'We have received your prescription photo. Our pharmacist will review it and send you the itemised bill here before dispatch.',
    );
  } else {
    lines.push('', 'Items:', ...formatOrderLines(order.items), '', `Estimated total: ${formatMoney(order.estimatedTotal)}`);
    if (order.estimatedSavings > 0) {
      lines.push(`You save ${formatMoney(order.estimatedSavings)} against MRP.`);
    }
    lines.push(
      '',
      'This is an estimate. The pharmacist confirms stock and the final bill before dispatch.',
    );
  }

  lines.push(
    '',
    `Delivery to: ${formatCustomerAddress(order.customer)}`,
    `Branch contact: +${digitsOnly(branch.phone)}`,
    '',
    'Reply here if anything needs changing.',
  );

  return lines.join('\n');
}

function branchOrderAlertMessage(order, branch) {
  const lines = [
    `🔔 New ${order.type === 'prescription' ? 'prescription request' : 'order'} — ${sanitizeForMessage(
      branch.shortName || branch.name,
      40,
    )}`,
    '',
    `Order number: ${order.orderNumber}`,
    `Customer: ${sanitizeForMessage(order.customer.name, 40)}`,
    `Phone: +91${digitsOnly(order.customer.phone)}`,
    `Address: ${formatCustomerAddress(order.customer)}`,
  ];

  if (order.items.length > 0) {
    lines.push('', 'Items:', ...formatOrderLines(order.items));
  }

  lines.push(
    '',
    `Estimated total: ${formatMoney(order.estimatedTotal)}`,
    `Prescription attached: ${order.hasPrescription ? 'yes (open it in the console)' : 'no'}`,
    '',
    'Confirm stock and the bill in the Lotus Pharmacy console.',
  );

  return lines.join('\n');
}

const STATUS_CUSTOMER_COPY = {
  pending_whatsapp: '',
  placed: 'We have received your order and it is queued for the pharmacist.',
  confirmed: 'Your order is confirmed. Stock and the final bill have been checked.',
  packed: 'Your order is packed and ready to leave the counter.',
  out_for_delivery: 'Your order is out for delivery.',
  delivered: 'Your order has been delivered. Thank you for choosing us.',
  cancelled: 'Your order has been cancelled. Call the branch if this was not expected.',
};

const STATUS_HEADLINE = {
  pending_whatsapp: 'Waiting on WhatsApp',
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function statusUpdateMessage(order, branch, note) {
  const lines = [
    `Update on order ${order.orderNumber} — ${sanitizeForMessage(branch?.name || 'Lotus Pharmacy', 80)}`,
    '',
    `Status: ${STATUS_HEADLINE[order.status] || order.status}`,
    STATUS_CUSTOMER_COPY[order.status] || '',
  ].filter(Boolean);

  if (note) {
    lines.push('', `Note from the pharmacy: ${sanitizeForMessage(note, 300)}`);
  }

  if (order.status !== 'cancelled' && order.estimatedTotal > 0) {
    lines.push('', `Order value: ${formatMoney(order.estimatedTotal)}`);
  }

  if (branch?.phone) {
    lines.push('', `Branch contact: +${digitsOnly(branch.phone)}`);
  }

  return lines.join('\n');
}

async function dispatchOrderNotifications(order, branch, { includeBranchAlert = true } = {}) {
  try {
    const customerSent = await sendWhatsAppText(
      customerChatId(order.customer.phone),
      customerOrderMessage(order, branch),
      'order-confirmation',
    );

    if (includeBranchAlert) {
      await sendWhatsAppText(
        branchChatId(branch.phone),
        branchOrderAlertMessage(order, branch),
        'branch-order-alert',
      );
    }

    if (!customerSent) return false;

    const now = new Date();
    const update = { $set: { customerNotifiedAt: now }, $inc: { __v: 1 } };

    if (config.whatsappGateway.autoAdvanceToPlaced) {
      update.$set.status = 'placed';
      update.$push = {
        statusHistory: {
          status: 'placed',
          at: now,
          note: 'Automated WhatsApp confirmation delivered.',
        },
      };
    }

    await Order.updateOne({ _id: order._id, status: 'pending_whatsapp' }, update);
    return true;
  } catch (error) {
    console.error('[whatsapp] Order notification failed', {
      orderNumber: order.orderNumber,
      message: error?.message,
    });
    return false;
  }
}

async function dispatchStatusNotification(order, branch, note) {
  try {
    if (!STATUS_CUSTOMER_COPY[order.status]) return false;

    return await sendWhatsAppText(
      customerChatId(order.customer.phone),
      statusUpdateMessage(order, branch, note),
      `status-${order.status}`,
    );
  } catch (error) {
    console.error('[whatsapp] Status notification failed', {
      orderNumber: order.orderNumber,
      message: error?.message,
    });
    return false;
  }
}

/* ================================================================== */
/*  7. VALIDATION                                                     */
/* ================================================================== */

const addressInput = z.object({
  houseNo: z.string().trim().min(3, 'Enter your house or flat number.').max(120),
  area: z.string().trim().max(120).optional().default(''),
  landmark: z.string().trim().max(120).optional().default(''),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(60),
  email: z.string().trim().email('Enter a valid email address.').max(120),
  phone: z.string().regex(INDIAN_MOBILE_RE, 'Enter a 10-digit mobile number.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(72),
});

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email.').max(120),
  password: z.string().min(1, 'Enter your password.').max(72),
});

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(60),
  phone: z.string().regex(INDIAN_MOBILE_RE, 'Enter a 10-digit mobile number.'),
  defaultAddress: addressInput.optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(72),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(72),
});

const inventoryInput = z.object({
  branchId: z.string().min(1),
  stockUnits: z.number().int().min(0).max(1000000),
  lowStockAt: z.number().int().min(0).max(1000000).default(5),
  isAvailable: z.boolean().default(true),
});

const medicineInput = z
  .object({
    name: z.string().trim().min(2, 'Enter the medicine name.').max(120),
    use: z.string().trim().min(3, 'Describe what it is used for.').max(200),
    category: z.string().trim().min(1, 'Pick a category.').max(60),
    price: z.number().min(0.01, 'Enter a valid price.'),
    mrp: z.number().min(0.01),
    packSize: z.number().int().min(1).max(1000).default(1),
    packType: z.string().trim().min(1).max(30).default('Strip'),
    unitType: z.string().trim().min(1).max(30).default('Tablet'),
    isDivisible: z.boolean().default(false),
    requiresPrescription: z.boolean().default(false),
    emoji: z.string().trim().max(8).default('💊'),
    imageUrl: z.string().trim().max(500).optional().default(''),
    imagePublicId: z.string().trim().max(250).optional().default(''),
    tag: z.string().trim().max(30).optional().default(''),
    isActive: z.boolean().default(true),
    inventory: z.array(inventoryInput).max(100).optional().default([]),
  })
  .refine((data) => data.mrp >= data.price, {
    message: 'MRP must be at least the selling price.',
    path: ['mrp'],
  });

const branchInput = z.object({
  name: z.string().trim().min(2, 'Enter the branch name.').max(80),
  shortName: z.string().trim().max(30).optional().default(''),
  phone: z.string().regex(WHATSAPP_RE, 'Enter the WhatsApp number with country code.'),
  address: z.string().trim().min(1, 'Enter a short area label.').max(120),
  fullAddress: z.string().trim().min(10, 'Enter the full address.').max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  serviceRadiusKm: z.number().min(0.5).max(50).default(8),
  open24h: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

const orderInput = z.object({
  type: z.enum(['cart', 'prescription']),
  branchId: z.string().min(1, 'Pick a branch.'),
  customer: z.object({
    name: z.string().trim().min(2, 'Enter the name for this delivery.').max(60),
    phone: z.string().regex(INDIAN_MOBILE_RE, 'Enter a 10-digit mobile number.'),
    houseNo: z.string().trim().min(3, 'Enter your house or flat number.').max(120),
    area: z.string().trim().max(120).optional().default(''),
    landmark: z.string().trim().max(120).optional().default(''),
  }),
  items: z
    .array(
      z.object({
        medicineId: z.string().min(1),
        buyType: z.enum(['full', 'loose']),
        qty: z.number().int().min(1).max(50),
      }),
    )
    .max(60)
    .optional()
    .default([]),
  prescriptionToken: z.string().max(2000).optional().default(''),
  note: z.string().trim().max(300).optional().default(''),
});

const orderStatusInput = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(300).optional().default(''),
});

const whatsappTestInput = z.object({
  phone: z.string().regex(INDIAN_MOBILE_RE, 'Enter a 10-digit mobile number.'),
});

/* ================================================================== */
/*  8. INVENTORY HELPERS                                              */
/* ================================================================== */

function inventoryEntryFor(medicine, branchId) {
  return (medicine.inventory || []).find((entry) => String(entry.branch) === String(branchId));
}

function requiredStockUnits(medicine, buyType, qty) {
  if (buyType === 'loose') return qty;
  return qty * (medicine.isDivisible ? medicine.packSize : 1);
}

async function commitInventoryForOrder(order) {
  if (order.stockCommitted || order.type !== 'cart' || order.items.length === 0) return;

  const committed = [];

  try {
    for (const item of order.items) {
      const units = item.stockUnitsPerQty * item.qty;

      const result = await Medicine.updateOne(
        {
          _id: item.medicine,
          inventory: {
            $elemMatch: {
              branch: order.branch,
              isAvailable: true,
              stockUnits: { $gte: units },
            },
          },
        },
        { $inc: { 'inventory.$.stockUnits': -units } },
      );

      if (result.modifiedCount !== 1) {
        throw new ApiError(409, `${item.name} is no longer available in the required quantity.`);
      }
      committed.push({ medicine: item.medicine, units });
    }

    order.stockCommitted = true;
  } catch (error) {
    for (const entry of committed) {
      await Medicine.updateOne(
        { _id: entry.medicine, 'inventory.branch': order.branch },
        { $inc: { 'inventory.$.stockUnits': entry.units } },
      ).catch(() => {});
    }
    throw error;
  }
}

async function releaseInventoryForOrder(order) {
  if (!order.stockCommitted || order.type !== 'cart') return;

  for (const item of order.items) {
    const units = item.stockUnitsPerQty * item.qty;
    await Medicine.updateOne(
      { _id: item.medicine, 'inventory.branch': order.branch },
      { $inc: { 'inventory.$.stockUnits': units } },
    );
  }

  order.stockCommitted = false;
}

/* ================================================================== */
/*  9. CONTROLLERS                                                    */
/* ================================================================== */

/* ---------- Auth ---------- */

// const getCsrf = (req, res) => {
//   res.json({ csrfToken: issueCsrf(req, res) });
// };

// const register = asyncHandler(async (req, res) => {
//   const parsed = registerSchema.parse(req.body);
//   const email = parsed.email.toLowerCase();

//   const existing = await User.findOne({ email });
//   if (existing) throw new ApiError(409, 'An account with this email already exists.');

//   const user = await User.create({ ...parsed, email, role: 'customer' });
//   const authUser = await User.findById(user._id).select('+tokenVersion');
//   sendAuthCookie(res, authUser);
//   res.status(201).json({ user: authUser.toPublic() });
// });

// const login = asyncHandler(async (req, res) => {
//   const parsed = loginSchema.parse(req.body);
//   const user = await User.findOne({ email: parsed.email.toLowerCase() })
//     .select('+password +tokenVersion');

//   if (!user || !user.isActive || !(await user.comparePassword(parsed.password))) {
//     throw new ApiError(401, 'Email or password is incorrect.');
//   }

//   user.lastLoginAt = new Date();
//   await user.save({ validateBeforeSave: false });

//   sendAuthCookie(res, user);
//   res.json({ user: user.toPublic() });
// });

// const logout = asyncHandler(async (req, res) => {
//   const user = await authUserFromRequest(req);
//   if (user) {
//     user.tokenVersion = (user.tokenVersion || 0) + 1;
//     await user.save({ validateBeforeSave: false });
//   }
//   clearAuthCookie(res);
//   res.json({ message: 'Signed out.' });
// });


const register = asyncHandler(async (req, res) => {
  const parsed = registerSchema.parse(req.body);
  const email = parsed.email.toLowerCase();

  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(409, 'An account with this email already exists.');

  const user = await User.create({ ...parsed, email, role: 'customer' });
  const authUser = await User.findById(user._id).select('+tokenVersion');
  
  // 🟢 Token ko JSON me bhej rahe hain
  res.status(201).json({ user: authUser.toPublic(), token: signToken(authUser) });
});

const login = asyncHandler(async (req, res) => {
  console.log('\n--- 🔵 DEBUG: LOGIN ATTEMPT START ---');
  console.log('1. Incoming Request Body:', req.body);

  const parsed = loginSchema.parse(req.body);
  const email = parsed.email.toLowerCase();
  console.log(`2. Parsed & Lowercased Email: ${email}`);

  const user = await User.findOne({ email }).select('+password +tokenVersion');

  if (!user) {
    console.log('3. ❌ Result: User DB me nahi mila is email se.');
    throw new ApiError(401, 'Email or password is incorrect.');
  }
  console.log('3. ✅ Result: User DB me mil gaya.');

  if (!user.isActive) {
    console.log('4. ❌ Result: User account inactive hai.');
    throw new ApiError(401, 'Email or password is incorrect.');
  }
  console.log('4. ✅ Result: User account active hai.');

  const isPasswordMatch = await user.comparePassword(parsed.password);
  console.log(`5. Password Match Status: ${isPasswordMatch}`);

  if (!isPasswordMatch) {
    console.log('6. ❌ Result: Password database ke hash se match NAHI hua.');
    throw new ApiError(401, 'Email or password is incorrect.');
  }

  console.log('6. 🎉 ✅ Result: Login Successful! Token generate ho raha hai.');
  console.log('--- 🔵 DEBUG: LOGIN ATTEMPT END ---\n');

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  res.json({ user: user.toPublic(), token: signToken(user) });
});

const logout = asyncHandler(async (req, res) => {
  const user = await authUserFromRequest(req);
  if (user) {
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save({ validateBeforeSave: false });
  }
  res.json({ message: 'Signed out.' });
});

const me = (req, res) => res.json({ user: req.user.toPublic() });

const updateProfile = asyncHandler(async (req, res) => {
  const parsed = profileSchema.parse(req.body);
  req.user.name = parsed.name;
  req.user.phone = parsed.phone;

  if (parsed.defaultAddress) {
    req.user.addresses = [{ label: 'Home', ...parsed.defaultAddress }];
  }

  await req.user.save();
  res.json({ user: req.user.toPublic() });
});

const changePassword = asyncHandler(async (req, res) => {
  const parsed = passwordSchema.parse(req.body);
  const user = await User.findById(req.user._id).select('+password +tokenVersion');

  if (!user || !(await user.comparePassword(parsed.currentPassword))) {
    throw new ApiError(401, 'Your current password is incorrect.');
  }

  user.password = parsed.newPassword;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  sendAuthCookie(res, user);
  res.json({ message: 'Password updated.' });
});

/* ---------- Medicines ---------- */

function normalizeMedicineInventory(rows) {
  const seen = new Set();
  return rows.map((row) => {
    if (!Types.ObjectId.isValid(row.branchId)) {
      throw new ApiError(422, 'One inventory branch id is not valid.');
    }
    if (seen.has(row.branchId)) {
      throw new ApiError(422, 'Each branch can appear only once in medicine inventory.');
    }
    seen.add(row.branchId);
    return {
      branch: row.branchId,
      stockUnits: row.stockUnits,
      lowStockAt: row.lowStockAt,
      isAvailable: row.isAvailable,
    };
  });
}

const listMedicines = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 24));
  const search = req.query.search ? String(req.query.search).trim() : '';
  const category = req.query.category ? String(req.query.category).trim() : '';
  const branchId = req.query.branchId ? String(req.query.branchId).trim() : '';
  const isAdmin = req.user?.role === 'admin';
  const includeInactive = isAdmin && req.query.all === 'true';

  const filter = includeInactive ? {} : { isActive: true };
  if (category && category !== 'All') filter.category = category;
  if (branchId && Types.ObjectId.isValid(branchId) && !isAdmin) {
    filter.inventory = {
      $elemMatch: {
        branch: branchId,
        isAvailable: true,
        stockUnits: { $gt: 0 },
      },
    };
  }

  if (search) {
    const rx = buildSearchRegex(search);
    filter.$or = [{ name: rx }, { use: rx }, { category: rx }];
  }

  const [items, total] = await Promise.all([
    Medicine.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Medicine.countDocuments(filter),
  ]);

  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

const listCategories = asyncHandler(async (_req, res) => {
  const categories = await Medicine.distinct('category', { isActive: true });
  res.json({ categories: categories.filter(Boolean).sort() });
});

const createMedicine = asyncHandler(async (req, res) => {
  const parsed = medicineInput.parse(req.body);
  if (!parsed.isDivisible) parsed.packSize = 1;
  if (parsed.imageUrl && !productUrlIsOurs(parsed.imageUrl)) {
    throw new ApiError(422, 'Use an image uploaded through this panel.', {
      imageUrl: 'Upload the image here instead of pasting a link.',
    });
  }

  const inventory = normalizeMedicineInventory(parsed.inventory);
  const medicine = await Medicine.create({ ...parsed, inventory });
  res.status(201).json({ medicine });
});

const updateMedicine = asyncHandler(async (req, res) => {
  const existing = await Medicine.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Medicine not found.');

  const parsed = medicineInput.parse(req.body);
  if (!parsed.isDivisible) parsed.packSize = 1;
  if (parsed.imageUrl && !productUrlIsOurs(parsed.imageUrl)) {
    throw new ApiError(422, 'Use an image uploaded through this panel.', {
      imageUrl: 'Upload the image here instead of pasting a link.',
    });
  }

  const inventory = normalizeMedicineInventory(parsed.inventory);
  const previousPublicId = existing.imagePublicId;
  Object.assign(existing, { ...parsed, inventory });
  await existing.save();

  if (previousPublicId && previousPublicId !== existing.imagePublicId) {
    await destroyCloudinaryAsset(previousPublicId, 'upload');
  }

  res.json({ medicine: existing });
});

const setMedicineVisibility = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) throw new ApiError(404, 'Medicine not found.');

  medicine.isActive = req.body?.isActive === true;
  await medicine.save();
  res.json({ medicine });
});

const deleteMedicine = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) throw new ApiError(404, 'Medicine not found.');

  medicine.isActive = false;
  await medicine.save();
  res.json({ medicine, message: 'Medicine hidden from the store.' });
});

/* ---------- Branches ---------- */

async function uniqueBranchSlug(name, ignoreId) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'branch';

  let slug = base;
  let suffix = 2;

  while (await Branch.exists({ slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

const listBranches = asyncHandler(async (req, res) => {
  const filter = req.user?.role === 'admin' ? {} : { isActive: true };
  const branches = await Branch.find(filter).sort({ createdAt: 1 }).lean();
  res.json({ branches });
});

const createBranch = asyncHandler(async (req, res) => {
  const parsed = branchInput.parse(req.body);
  parsed.shortName = parsed.shortName || parsed.name.split(',')[0].trim().slice(0, 30);
  const slug = await uniqueBranchSlug(parsed.name);

  const branch = await Branch.create({ ...parsed, slug });
  res.status(201).json({ branch });
});

const updateBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw new ApiError(404, 'Branch not found.');

  const parsed = branchInput.parse(req.body);
  parsed.shortName = parsed.shortName || parsed.name.split(',')[0].trim().slice(0, 30);

  if (parsed.name !== branch.name) {
    branch.slug = await uniqueBranchSlug(parsed.name, branch._id);
  }

  Object.assign(branch, parsed);
  await branch.save();
  res.json({ branch });
});

/* ---------- Orders ---------- */

async function createOrderWithRetry(payload, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await Order.create(payload);
    } catch (error) {
      const duplicateOrderNumber =
        error?.code === 11000 && Boolean(error?.keyPattern?.orderNumber);
      if (!duplicateOrderNumber || attempt === attempts) throw error;
    }
  }
  throw new ApiError(500, 'Could not generate an order number.');
}

function orderPublicSummary(order, branch) {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    estimatedTotal: order.estimatedTotal,
    estimatedSavings: order.estimatedSavings,
    status: order.status,
    type: order.type,
    items: order.items,
    branch: {
      id: branch._id.toString(),
      name: branch.name,
      shortName: branch.shortName,
      phone: branch.phone,
    },
  };
}

const createOrder = asyncHandler(async (req, res) => {
  const parsed = orderInput.parse(req.body);
  const idempotencyKey = String(req.get('idempotency-key') || '').trim();

  if (!IDEMPOTENCY_RE.test(idempotencyKey)) {
    throw new ApiError(400, 'A valid idempotency key is required.');
  }

  const existingOrder = await Order.findOne({ idempotencyKey }).populate(
    'branch',
    'name shortName phone',
  );
  if (existingOrder) {
    return res.status(200).json({
      order: orderPublicSummary(existingOrder, existingOrder.branch),
      duplicate: true,
    });
  }

  if (!Types.ObjectId.isValid(parsed.branchId)) {
    throw new ApiError(400, 'Pick an available branch.');
  }

  const branch = await Branch.findById(parsed.branchId);
  if (!branch || !branch.isActive) throw new ApiError(400, 'Pick an available branch.');

  if (parsed.type === 'cart' && parsed.customer.area.trim().length < 3) {
    throw new ApiError(422, 'Enter your area or locality.', {
      area: 'Enter your area or locality.',
    });
  }

  if (parsed.type === 'cart' && parsed.items.length === 0) {
    throw new ApiError(400, 'Your cart is empty.');
  }

  const prescriptionPublicId = readPrescriptionUploadToken(parsed.prescriptionToken);
  if (parsed.prescriptionToken && !prescriptionPublicId) {
    throw new ApiError(422, 'The prescription upload expired. Upload it again.');
  }

  if (parsed.type === 'prescription' && !prescriptionPublicId) {
    throw new ApiError(422, 'Attach the prescription photo.', {
      prescription: 'Attach the prescription photo.',
    });
  }

  let items = [];
  let estimatedTotal = 0;
  let estimatedSavings = 0;

  if (parsed.type === 'cart') {
    const ids = parsed.items.map((item) => item.medicineId);
    if (ids.some((id) => !Types.ObjectId.isValid(id))) {
      throw new ApiError(400, 'One of the cart items is invalid.');
    }

    const medicines = await Medicine.find({
      _id: { $in: uniqueStrings(ids) },
      isActive: true,
    }).lean();

    const byId = new Map(medicines.map((medicine) => [medicine._id.toString(), medicine]));

    items = parsed.items.map((raw) => {
      const medicine = byId.get(String(raw.medicineId));
      if (!medicine) throw new ApiError(409, 'One of the items is no longer available.');

      if (raw.buyType === 'loose' && !medicine.isDivisible) {
        throw new ApiError(
          409,
          `${medicine.name} can no longer be bought loose. Review your cart.`,
        );
      }

      if (medicine.requiresPrescription && !prescriptionPublicId) {
        throw new ApiError(
          422,
          `${medicine.name} requires a prescription. Attach a valid prescription before checkout.`,
          { prescription: 'A prescription is required for one or more medicines.' },
        );
      }

      const stock = inventoryEntryFor(medicine, branch._id);
      const unitsNeeded = requiredStockUnits(medicine, raw.buyType, raw.qty);

      if (!stock || !stock.isAvailable || stock.stockUnits < unitsNeeded) {
        throw new ApiError(
          409,
          `${medicine.name} does not have enough stock at ${branch.shortName || branch.name}.`,
        );
      }

      const divisor = medicine.packSize > 0 ? medicine.packSize : 1;
      const unitPrice =
        raw.buyType === 'loose' ? round2(medicine.price / divisor) : medicine.price;
      const unitMrp =
        raw.buyType === 'loose' ? round2(medicine.mrp / divisor) : medicine.mrp;
      const lineTotal = round2(unitPrice * raw.qty);

      estimatedTotal += lineTotal;
      estimatedSavings += Math.max(0, unitMrp - unitPrice) * raw.qty;

      return {
        medicine: medicine._id,
        name: medicine.name,
        displayName:
          raw.buyType === 'loose'
            ? `${medicine.name} — 1 ${medicine.unitType.toLowerCase()}`
            : `${medicine.name} — ${medicine.packType.toLowerCase()} of ${medicine.packSize}`,
        buyType: raw.buyType,
        qty: raw.qty,
        stockUnitsPerQty: raw.buyType === 'loose' ? 1 : medicine.isDivisible ? medicine.packSize : 1,
        unitPrice,
        unitMrp,
        lineTotal,
        requiresPrescription: medicine.requiresPrescription,
      };
    });
  }

  const order = await createOrderWithRetry({
    idempotencyKey,
    user: req.user?._id || null,
    branch: branch._id,
    type: parsed.type,
    items,
    customer: parsed.customer,
    prescriptionPublicId: prescriptionPublicId || '',
    hasPrescription: Boolean(prescriptionPublicId),
    estimatedTotal: round2(estimatedTotal),
    estimatedSavings: round2(estimatedSavings),
    note: parsed.note,
    status: 'pending_whatsapp',
  });

  if (req.user) {
    req.user.addresses = [
      {
        label: 'Home',
        houseNo: parsed.customer.houseNo,
        area: parsed.customer.area,
        landmark: parsed.customer.landmark,
      },
    ];
    req.user.name = parsed.customer.name;
    req.user.phone = parsed.customer.phone;
    await req.user.save({ validateBeforeSave: false }).catch(() => {});
  }

  res.status(201).json({ order: orderPublicSummary(order, branch), duplicate: false });

  dispatchOrderNotifications(order, branch).catch((error) =>
    console.error('[whatsapp] Unexpected dispatch error', error?.message),
  );
});

const markWhatsAppOpened = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).select('user');
  if (!order) throw new ApiError(404, 'Order not found.');

  const ownsOrder = req.user && String(order.user || '') === String(req.user._id);
  if (order.user && !ownsOrder && req.user?.role !== 'admin') {
    throw new ApiError(403, 'You cannot update this order.');
  }

  await Order.updateOne({ _id: order._id }, { $set: { whatsappOpenedAt: new Date() } });
  res.json({ message: 'WhatsApp handoff recorded.' });
});

const listMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('branch', 'name shortName phone address')
    .lean();

  res.json({ orders });
});

const listAllOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const status = req.query.status ? String(req.query.status).trim() : '';
  const search = req.query.search ? String(req.query.search).trim() : '';
  const range = String(req.query.range || 'all');
  const branchId = req.query.branchId ? String(req.query.branchId).trim() : '';

  const filter = {};
  if (status && ORDER_STATUSES.includes(status)) filter.status = status;
  if (branchId && Types.ObjectId.isValid(branchId)) filter.branch = branchId;

  if (range === 'today') filter.createdAt = { $gte: startOfISTDay(0) };
  else if (range === 'week') filter.createdAt = { $gte: startOfISTDay(6) };
  else if (range === 'month') filter.createdAt = { $gte: startOfISTDay(29) };

  if (search) {
    const rx = buildSearchRegex(search);
    filter.$or = [{ orderNumber: rx }, { 'customer.name': rx }, { 'customer.phone': rx }];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('branch', 'name shortName phone address')
      .populate('user', 'name email')
      .lean(),
    Order.countDocuments(filter),
  ]);

  res.json({ orders, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const parsed = orderStatusInput.parse(req.body);
  const order = await Order.findById(req.params.id);

  if (!order) throw new ApiError(404, 'Order not found.');
  if (order.status === parsed.status) {
    await order.populate('branch', 'name shortName phone address');
    await order.populate('user', 'name email');
    return res.json({ order });
  }

  const allowed = ORDER_TRANSITIONS[order.status] || [];
  if (!allowed.includes(parsed.status)) {
    throw new ApiError(
      409,
      `Order cannot move from ${order.status} to ${parsed.status}.`,
    );
  }

  let committedNow = false;
  let releasedNow = false;

  if (parsed.status === 'confirmed' && !order.stockCommitted) {
    await commitInventoryForOrder(order);
    committedNow = order.stockCommitted;
  }

  if (parsed.status === 'cancelled' && order.stockCommitted) {
    await releaseInventoryForOrder(order);
    releasedNow = true;
  }

  order.status = parsed.status;
  if (parsed.note) order.note = parsed.note;
  order.statusHistory.push({
    status: parsed.status,
    at: new Date(),
    by: req.user._id,
    note: parsed.note,
  });

  try {
    await order.save();
  } catch (error) {
    // Keep stock consistent with what is actually stored on the order.
    if (committedNow) {
      await releaseInventoryForOrder(order).catch((rollbackError) =>
        console.error('[inventory] Rollback after failed confirm failed', rollbackError?.message),
      );
    }
    if (releasedNow) {
      order.stockCommitted = false;
      await commitInventoryForOrder(order).catch((rollbackError) =>
        console.error('[inventory] Rollback after failed cancel failed', rollbackError?.message),
      );
    }
    throw error;
  }

  await order.populate('branch', 'name shortName phone address');
  await order.populate('user', 'name email');

  res.json({ order });

  dispatchStatusNotification(order, order.branch, parsed.note).catch((error) =>
    console.error('[whatsapp] Unexpected status dispatch error', error?.message),
  );
});

const resendOrderNotification = asyncHandler(async (req, res) => {
  if (!waGatewayEnabled) {
    throw new ApiError(503, 'WhatsApp is not configured on the server.');
  }

  const order = await Order.findById(req.params.id).populate('branch', 'name shortName phone address');
  if (!order) throw new ApiError(404, 'Order not found.');
  if (!order.branch) throw new ApiError(409, 'This order has no branch attached.');

  const sent =
    order.status === 'pending_whatsapp'
      ? await dispatchOrderNotifications(order, order.branch, { includeBranchAlert: false })
      : await dispatchStatusNotification(order, order.branch, '');

  if (!sent) {
    throw new ApiError(
      502,
      'The message was not delivered. Check the WhatsApp connection and try again.',
    );
  }

  const fresh = await Order.findById(order._id)
    .populate('branch', 'name shortName phone address')
    .populate('user', 'name email')
    .lean();

  res.json({ order: fresh, message: 'WhatsApp message sent.' });
});

const getPrescriptionForOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).select(
    'user prescriptionPublicId hasPrescription',
  );
  if (!order) throw new ApiError(404, 'Order not found.');
  if (!order.hasPrescription || !order.prescriptionPublicId) {
    throw new ApiError(404, 'No prescription is attached to this order.');
  }

  const isAdmin = req.user?.role === 'admin';
  const isOwner = String(order.user || '') === String(req.user?._id || '');
  if (!isAdmin && !isOwner) throw new ApiError(403, 'You cannot view this prescription.');

  res.set('Cache-Control', 'no-store');
  res.json({
    url: signedPrescriptionUrl(order.prescriptionPublicId),
    expiresInSeconds: 600,
  });
});

/* ---------- WhatsApp session (admin) ---------- */

const requireWaGateway = (_req, _res, next) => {
  if (!waGatewayEnabled) {
    return next(new ApiError(503, 'WhatsApp is not configured on the server.'));
  }
  next();
};

const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

const whatsappStatus = asyncHandler(async (_req, res) => {
  const [session, pendingCount] = await Promise.all([
    fetchWhatsAppSession(),
    countUnnotifiedOrders(),
  ]);
  res.json({ session, pendingCount });
});

const whatsappConnect = asyncHandler(async (req, res) => {
  let session;

  try {
    session = await normalizeGatewaySession(
      await gatewayRequest(config.whatsappGateway.paths.connect, {
        timeoutMs: config.whatsappGateway.connectTimeoutMs,
      }),
    );
  } catch (error) {
    throw new ApiError(502, error?.message || 'A WhatsApp session could not be started.');
  }

  // Some gateways only acknowledge the connect call; the QR arrives on status.
  if (session.state === 'disconnected') {
    session = await fetchWhatsAppSession();
    if (session.state === 'disconnected') session = { ...session, state: 'connecting' };
  }

  rememberSession(session);

  console.info('[whatsapp] Session connect requested', {
    by: req.user._id.toString(),
    state: session.state,
  });

  res.json({ session, pendingCount: await countUnnotifiedOrders() });
});

const whatsappLogout = asyncHandler(async (req, res) => {
  try {
    await gatewayRequest(config.whatsappGateway.paths.logout);
  } catch (error) {
    if (!(error instanceof GatewayError) || error.status !== 404) {
      throw new ApiError(502, error?.message || 'WhatsApp could not be disconnected.');
    }
  }

  const session = buildSession({ state: 'disconnected' });
  rememberSession(session);

  console.info('[whatsapp] Session logged out', { by: req.user._id.toString() });

  res.json({ session, pendingCount: await countUnnotifiedOrders() });
});

const whatsappTest = asyncHandler(async (req, res) => {
  const { phone } = whatsappTestInput.parse(req.body);

  const text = [
    'Test message from the Lotus Pharmacy console.',
    `Sent by ${sanitizeForMessage(req.user.name, 40)}.`,
    'Automated order confirmations and status updates are working.',
  ].join('\n');

  const sent = await sendWhatsAppText(customerChatId(phone), text, 'admin-test');
  if (!sent) {
    throw new ApiError(
      502,
      'The test message was not delivered. Make sure WhatsApp is connected, then try again in a minute.',
    );
  }

  res.json({ message: 'Test message sent.' });
});

const whatsappRetryPending = asyncHandler(async (_req, res) => {
  const orders = await Order.find({
    status: 'pending_whatsapp',
    customerNotifiedAt: null,
    createdAt: { $gte: new Date(Date.now() - WA_RETRY_WINDOW_MS) },
  })
    .sort({ createdAt: 1 })
    .limit(WA_RETRY_BATCH)
    .populate('branch', 'name shortName phone');

  let sent = 0;

  // Sequential on purpose: a burst of parallel sends is the fastest way to get
  // a linked number flagged.
  for (const order of orders) {
    if (!order.branch) continue;
    if (await dispatchOrderNotifications(order, order.branch, { includeBranchAlert: false })) {
      sent += 1;
    }
  }

  res.json({
    attempted: orders.length,
    sent,
    pendingCount: await countUnnotifiedOrders(),
  });
});

/* ---------- Stats ---------- */

const adminStats = asyncHandler(async (_req, res) => {
  const today = startOfISTDay(0);
  const yesterday = startOfISTDay(1);
  const weekStart = startOfISTDay(6);
  const monthStart = startOfISTDay(29);
  const bookedStatuses = ['confirmed', 'packed', 'out_for_delivery', 'delivered'];

  const [
    ordersToday,
    ordersYesterday,
    waitingWhatsApp,
    openOrders,
    medicineCount,
    bookedTodayAgg,
    bookedYesterdayAgg,
    dailyAgg,
    branchAgg,
  ] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: today } }),
    Order.countDocuments({ createdAt: { $gte: yesterday, $lt: today } }),
    Order.countDocuments({ status: 'pending_whatsapp' }),
    Order.countDocuments({
      status: { $in: ['pending_whatsapp', 'placed', 'confirmed', 'packed', 'out_for_delivery'] },
    }),
    Medicine.countDocuments({ isActive: true }),
    Order.aggregate([
      { $match: { createdAt: { $gte: today }, status: { $in: bookedStatuses } } },
      { $group: { _id: null, total: { $sum: '$estimatedTotal' } } },
    ]),
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: yesterday, $lt: today },
          status: { $in: bookedStatuses },
        },
      },
      { $group: { _id: null, total: { $sum: '$estimatedTotal' } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: weekStart } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: BUSINESS_TIMEZONE,
            },
          },
          orders: { $sum: 1 },
          bookedValue: {
            $sum: {
              $cond: [{ $in: ['$status', bookedStatuses] }, '$estimatedTotal', 0],
            },
          },
        },
      },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: '$branch', orders: { $sum: 1 } } },
      { $sort: { orders: -1 } },
      { $limit: 8 },
    ]),
  ]);

  const dailyByDate = new Map(dailyAgg.map((row) => [row._id, row]));
  const ordersSeries = [];
  const revenueSeries = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(startOfISTDay(offset).getTime() + IST_OFFSET_MS);
    const key = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(
      day.getUTCDate(),
    ).padStart(2, '0')}`;

    ordersSeries.push(dailyByDate.get(key)?.orders || 0);
    revenueSeries.push(round2(dailyByDate.get(key)?.bookedValue || 0));
  }

  const branchDocs = await Branch.find({ _id: { $in: branchAgg.map((row) => row._id) } })
    .select('name shortName')
    .lean();

  const branchNames = new Map(branchDocs.map((branch) => [branch._id.toString(), branch]));
  const busiest = branchAgg[0]?.orders || 0;

  const branchPerformance = branchAgg
    .filter((row) => branchNames.has(String(row._id)))
    .map((row) => {
      const branch = branchNames.get(String(row._id));
      return {
        id: String(row._id),
        name: branch.shortName || branch.name,
        orders: row.orders,
        pct: busiest > 0 ? Math.round((row.orders / busiest) * 100) : 0,
      };
    });

  const bookedToday = round2(bookedTodayAgg[0]?.total || 0);
  const bookedYesterday = round2(bookedYesterdayAgg[0]?.total || 0);

  res.json({
    ordersToday,
    ordersDelta: percentChange(ordersToday, ordersYesterday),
    waitingWhatsApp,
    openOrders,
    bookedToday,
    bookedDelta: percentChange(bookedToday, bookedYesterday),
    medicineCount,
    ordersSeries,
    revenueSeries,
    branchPerformance,
  });
});

/* ---------- Uploads ---------- */

const uploadProductImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Attach an image file.');

  const result = await uploadPublicProduct(req.file.buffer);
  res.status(201).json({ url: result.secure_url, publicId: result.public_id });
});

const uploadPrescription = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Attach a photo of the prescription.');

  const result = await uploadPrivatePrescription(req.file.buffer);
  res.status(201).json({
    uploadToken: makePrescriptionUploadToken(result.public_id),
  });
});

const revertPrescriptionUpload = asyncHandler(async (req, res) => {
  const uploadToken = String(req.body?.uploadToken || '').trim();
  const publicId = readPrescriptionUploadToken(uploadToken);
  if (!publicId) throw new ApiError(400, 'Upload token is invalid or expired.');

  await destroyCloudinaryAsset(publicId, 'authenticated');
  res.json({ message: 'Prescription upload deleted.' });
});

const deleteProductUpload = asyncHandler(async (req, res) => {
  const publicId = String(req.body?.publicId || '').trim();
  if (!publicId) throw new ApiError(400, 'publicId is required.');
  if (!publicId.startsWith(`${PRODUCT_FOLDER}/`)) {
    throw new ApiError(403, 'That product asset is not ours to delete.');
  }

  await destroyCloudinaryAsset(publicId, 'upload');
  res.json({ message: 'Asset deleted.' });
});



const limiterOptions = { standardHeaders: true, legacyHeaders: false };

const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, ...limiterOptions });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, ...limiterOptions });
const writeLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 12, ...limiterOptions });
const uploadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 12, ...limiterOptions });
const waSessionLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, ...limiterOptions });
const waActionLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, ...limiterOptions });

const authRouter = express.Router();
// authRouter.get('/csrf', getCsrf);
authRouter.post('/register', authLimiter, register);
authRouter.post('/login', authLimiter, login);
authRouter.post('/logout', logout);
authRouter.get('/me', protect, me);
authRouter.patch('/me', protect, updateProfile);
authRouter.patch('/password', protect, authLimiter, changePassword);

const medicineRouter = express.Router();
medicineRouter.get('/', optionalAuth, listMedicines);
medicineRouter.get('/categories', listCategories);
medicineRouter.post('/', protect, adminOnly, createMedicine);
medicineRouter.put('/:id', protect, adminOnly, updateMedicine);
medicineRouter.patch('/:id/visibility', protect, adminOnly, setMedicineVisibility);
medicineRouter.delete('/:id', protect, adminOnly, deleteMedicine);

const branchRouter = express.Router();
branchRouter.get('/', optionalAuth, listBranches);
branchRouter.post('/', protect, adminOnly, createBranch);
branchRouter.put('/:id', protect, adminOnly, updateBranch);

const orderRouter = express.Router();
orderRouter.post('/', writeLimiter, optionalAuth, createOrder);
orderRouter.get('/mine', protect, listMyOrders);
orderRouter.get('/', protect, adminOnly, listAllOrders);
orderRouter.patch('/:id/status', protect, adminOnly, updateOrderStatus);
orderRouter.post('/:id/notify', protect, adminOnly, waActionLimiter, resendOrderNotification);
orderRouter.post('/:id/whatsapp-opened', optionalAuth, markWhatsAppOpened);
orderRouter.get('/:id/prescription', protect, getPrescriptionForOrder);

const uploadRouter = express.Router();
uploadRouter.post(
  '/product',
  protect,
  adminOnly,
  requireCloudinary,
  upload.single('image'),
  uploadProductImage,
);
uploadRouter.delete('/product/revert', protect, adminOnly, requireCloudinary, deleteProductUpload);
uploadRouter.post(
  '/prescription',
  uploadLimiter,
  requireCloudinary,
  upload.single('image'),
  uploadPrescription,
);
uploadRouter.post(
  '/prescription/revert',
  uploadLimiter,
  requireCloudinary,
  revertPrescriptionUpload,
);

const adminRouter = express.Router();
adminRouter.get('/stats', protect, adminOnly, adminStats);
adminRouter.get('/whatsapp/status', protect, adminOnly, waSessionLimiter, noStore, whatsappStatus);
adminRouter.post(
  '/whatsapp/connect',
  protect,
  adminOnly,
  waActionLimiter,
  requireWaGateway,
  noStore,
  whatsappConnect,
);
adminRouter.post(
  '/whatsapp/logout',
  protect,
  adminOnly,
  waActionLimiter,
  requireWaGateway,
  noStore,
  whatsappLogout,
);
adminRouter.post('/whatsapp/test', protect, adminOnly, waActionLimiter, requireWaGateway, whatsappTest);
adminRouter.post(
  '/whatsapp/retry-pending',
  protect,
  adminOnly,
  waActionLimiter,
  requireWaGateway,
  whatsappRetryPending,
);



const app = express();

app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use((req, res, next) => {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && /^[A-Za-z0-9_-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);
app.use(compression());
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(cookieParser());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.clientOrigins.includes(origin.replace(/\/$/, ''))) {
        return callback(null, true);
      }
      return callback(new ApiError(403, 'Origin not allowed.'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // 'Authorization' header allow karna zaruri hai, warna Token block ho jayega
    allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Request-Id', 'Authorization'], 
  }),
);

app.use(globalLimiter);
// app.use(csrfProtection);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

app.get('/api/ready', (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  const status = dbReady ? 200 : 503;
  res.status(status).json({
    status: dbReady ? 'ready' : 'not_ready',
    db: dbReady ? 'connected' : 'disconnected',
    uploads: cloudinaryEnabled ? 'ready' : 'disabled',
    whatsapp: waGatewayEnabled ? waLastKnown.state : 'disabled',
  });
});

app.use('/api/auth', authRouter);
app.use('/api/medicines', medicineRouter);
app.use('/api/branches', branchRouter);
app.use('/api/orders', orderRouter);
app.use('/api/uploads', uploadRouter);
app.use('/api/admin', adminRouter);

app.use((req, _res, next) =>
  next(new ApiError(404, `No route for ${req.method} ${req.originalUrl}`)),
);

app.use((err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong.';
  let details = err.details;

  if (err instanceof multer.MulterError) {
    statusCode = 413;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'That image is over 5 MB.' : 'Upload failed.';
  } else if (err instanceof z.ZodError) {
    statusCode = 422;
    message = 'Some fields need attention.';
    const issues = err.issues || err.errors || [];
    details = Object.fromEntries(issues.map((issue) => [issue.path.join('.'), issue.message]));
  } else if (err.name === 'ValidationError' && err.errors) {
    statusCode = 422;
    message = 'Some fields need attention.';
    details = Object.fromEntries(
      Object.entries(err.errors).map(([field, error]) => [field, error.message]),
    );
  } else if (err.name === 'VersionError') {
    statusCode = 409;
    message = 'This order was changed by someone else. Refresh and try again.';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'That id is not valid.';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'The request body is not valid JSON.';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'The request body is too large.';
  } else if (err.code === 11000) {
    statusCode = 409;
    if (err.keyPattern?.idempotencyKey) {
      message = 'This request was already processed.';
    } else {
      message = 'That record already exists.';
    }
  }

  if (statusCode >= 500) {
    console.error('[error]', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      message: err.message,
      stack: isProd ? undefined : err.stack,
    });
    if (isProd && statusCode === 500) message = 'Something went wrong on our side.';
  }

  res.status(statusCode).json({
    message,
    requestId: req.requestId,
    ...(details ? { details } : {}),
  });
});



async function seedAdmin() {
  console.log('\n--- 🟢 DEBUG: SEED ADMIN CHECK START ---');
  console.log('isProd:', isProd);
  console.log('allowDevSeed (from .env):', config.allowDevSeed);

  if (isProd || !config.allowDevSeed) {
    console.log('❌ DEBUG: Admin seed skipped (Ya toh production hai ya ALLOW_DEV_SEED false hai)');
    return;
  }

  if (!config.seedAdmin.email || !config.seedAdmin.password) {
    console.log('❌ DEBUG: Admin seed skipped (Email ya password .env me missing hai)');
    return;
  }

  if (config.seedAdmin.password.length < 8) {
    console.warn('❌ DEBUG: SEED_ADMIN_PASSWORD 8 character se chhota hai — skipping.');
    return;
  }

  try {
    const email = config.seedAdmin.email.toLowerCase();
    console.log(`🔎 DEBUG: Looking for admin user: ${email}`);

    const existing = await User.findOne({ email }).select('+tokenVersion');

    if (!existing) {
      console.log('✅ DEBUG: Admin user DB me nahi mila. Naya user create kar rahe hain...');
      await User.create({
        name: 'Pharmacy Admin',
        email,
        phone: config.seedAdmin.phone,
        password: config.seedAdmin.password,
        role: 'admin',
      });
      console.log(`🎉 [db] Dev admin created: ${email}`);
      return;
    }

    console.log('⚠️ DEBUG: Admin user pehle se DB me maujud hai.');
    // IMPORTANT FIX: Agar user already exist karta hai, par aapne .env me password change kiya h,
    // toh code usey update nahi kar raha tha. Niche wala block password force update karega.
    let updated = false;
    
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      updated = true;
      console.log('🔄 DEBUG: User role "admin" me update kiya.');
    }

    // Force update password for testing
    existing.password = config.seedAdmin.password; 
    await existing.save(); // Ye pre('save') hook call karega aur naya hash banayega
    console.log('🔑 DEBUG: Admin ka password .env ke hisab se DB me override kar diya gaya hai.');

  } catch (error) {
    console.error('❌ [db] Dev admin seed failed:', error.message);
  }
  console.log('--- 🟢 DEBUG: SEED ADMIN CHECK END ---\n');
}

let server;

async function start() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: !isProd,
  });
  console.log('[db] Connected.');

  await seedAdmin();

  if (waGatewayEnabled) {
    fetchWhatsAppSession()
      .then((session) => console.log(`[whatsapp] Gateway session state: ${session.state}`))
      .catch(() => {});
  }

  server = app.listen(config.port, () => {
    console.log(`[server] Listening on :${config.port} (${config.env})`);
  });
}

async function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down.`);
  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();

  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('[server] Shutdown failed:', error.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
  process.exit(1);
});

if (require.main === module) {
  start().catch((error) => {
    console.error('[fatal] Startup failed:', error);
    process.exit(1);
  });
}

module.exports = app;