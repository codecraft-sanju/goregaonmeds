'use strict';

require('dotenv').config();

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

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
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

/* ================================================================== */
/*  2. ERRORS AND HELPERS                                             */
/* ================================================================== */

class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;
const WHATSAPP_RE = /^\d{10,15}$/;
const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

/* ================================================================== */
/*  3. MODELS                                                         */
/* ================================================================== */

const { Schema, model, Types } = mongoose;

/* ---------- User ---------- */

const userSchema = new Schema(
  {
    name: { type: String, required: [true, 'Name is required.'], trim: true, maxlength: 60 },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required.'],
      index: true,
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer', index: true },
    isActive: { type: Boolean, default: true },
    addresses: [
      {
        label: { type: String, trim: true, maxlength: 30, default: 'Home' },
        houseNo: { type: String, trim: true, maxlength: 120 },
        area: { type: String, trim: true, maxlength: 120 },
        landmark: { type: String, trim: true, maxlength: 120 },
      },
    ],
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
    addresses: this.addresses,
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
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

const Branch = model('Branch', branchSchema);

/* ---------- Medicine ---------- */

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
  },
  { timestamps: true },
);

medicineSchema.index({ name: 'text', use: 'text' });

// FIXED: Removed legacy `next` callback approach to prevent "next is not a function" error
medicineSchema.pre('validate', function checkPricing() {
  if (this.mrp < this.price) throw new Error('MRP cannot be lower than the selling price.');
  if (!this.isDivisible) this.packSize = this.packSize || 1;
});

const Medicine = model('Medicine', medicineSchema);

/* ---------- Order ---------- */

const orderItemSchema = new Schema(
  {
    medicine: { type: Types.ObjectId, ref: 'Medicine', required: true },
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    buyType: { type: String, enum: ['full', 'loose'], required: true },
    qty: { type: Number, required: true, min: 1, max: 50 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitMrp: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
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
    prescriptionUrl: { type: String, trim: true, default: '' },
    prescriptionPublicId: { type: String, trim: true, default: '' },
    estimatedTotal: { type: Number, required: true, min: 0 },
    estimatedSavings: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ['pending_whatsapp', 'placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled'],
      default: 'pending_whatsapp',
      index: true,
    },
    note: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });

// FIXED: Removed legacy `next` callback
orderSchema.pre('validate', function assignOrderNumber() {
  if (!this.orderNumber) {
    const stamp = Date.now().toString(36).toUpperCase();
    const noise = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
    this.orderNumber = `LP-${stamp}${noise}`;
  }
});

const Order = model('Order', orderSchema);

/* ================================================================== */
/*  4. AUTH MIDDLEWARE                                                */
/* ================================================================== */

const COOKIE_NAME = 'lp_token';

const cookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
});

const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

function sendAuthCookie(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
}

function readToken(req) {
  if (req.cookies?.[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub);
    if (user?.isActive) req.user = user;
  } catch {}
  next();
});

const protect = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (!token) throw new ApiError(401, 'Sign in to continue.');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new ApiError(401, 'Your session expired. Sign in again.');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new ApiError(401, 'This account is no longer active.');

  req.user = user;
  next();
});

const adminOnly = (req, _res, next) => {
  if (req.user?.role !== 'admin') return next(new ApiError(403, 'Admin access only.'));
  next();
};

/* ================================================================== */
/*  5. UPLOADS (CLOUDINARY)                                           */
/* ================================================================== */

const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_MIME.has(file.mimetype)) {
      return cb(new ApiError(415, 'Upload a JPG, PNG or WEBP image.'));
    }
    cb(null, true);
  },
});

function uploadBufferToCloudinary(buffer, folder, transformation) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        overwrite: false,
        transformation,
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.end(buffer);
  });
}

const requireCloudinary = (_req, _res, next) => {
  if (!cloudinaryEnabled) return next(new ApiError(503, 'Image uploads are not configured yet.'));
  next();
};

async function destroyCloudinaryAsset(publicId) {
  if (!cloudinaryEnabled || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.warn('[cloudinary] Failed to delete asset', publicId, error.message);
  }
}

/* ================================================================== */
/*  6. CONTROLLERS WITH ZOD VALIDATION                                */
/* ================================================================== */

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(60),
  email: z.string().trim().email('Enter a valid email address.').max(120),
  phone: z.string().regex(INDIAN_MOBILE_RE, 'Enter a 10-digit mobile number.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.'),
});

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(60),
  phone: z.string().regex(INDIAN_MOBILE_RE, 'Enter a 10-digit mobile number.'),
});

const passwordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'Use at least 8 characters.'),
});

const medicineSchemaZod = z.object({
  name: z.string().trim().min(2, 'Enter the medicine name.').max(120),
  use: z.string().trim().min(3, 'Describe what it is used for.').max(200),
  category: z.string().trim().min(1, 'Pick a category.').max(60),
  price: z.number().min(0, 'Enter a valid price.'),
  mrp: z.number().min(0),
  packSize: z.number().min(1).default(1),
  packType: z.string().trim().max(30).default('Strip'),
  unitType: z.string().trim().max(30).default('Tablet'),
  isDivisible: z.boolean().default(false),
  requiresPrescription: z.boolean().default(false),
  emoji: z.string().trim().max(8).default('💊'),
  imageUrl: z.string().trim().max(400).optional().default(''),
  imagePublicId: z.string().trim().max(200).optional().default(''),
  tag: z.string().trim().max(30).optional().default(''),
  isActive: z.boolean().default(true),
}).refine((data) => data.mrp >= data.price, {
  message: "MRP must be at least the selling price.",
  path: ["mrp"],
});

const branchSchemaZod = z.object({
  name: z.string().trim().min(2, 'Enter the branch name.').max(80),
  shortName: z.string().trim().max(30).optional(),
  phone: z.string().regex(WHATSAPP_RE, 'Enter the WhatsApp number with country code.'),
  address: z.string().trim().min(1, 'Enter a short area label.').max(120),
  fullAddress: z.string().trim().min(10, 'Enter the full address.').max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isActive: z.boolean().default(true),
});

const orderSchemaZod = z.object({
  type: z.enum(['cart', 'prescription']),
  branchId: z.string(),
  customer: z.object({
    name: z.string().trim().min(2, 'Enter the name for this delivery.'),
    phone: z.string().regex(INDIAN_MOBILE_RE, 'Enter a 10-digit mobile number.'),
    houseNo: z.string().trim().min(3, 'Enter your house or flat number.'),
    area: z.string().trim().optional().default(''),
    landmark: z.string().trim().optional().default(''),
  }),
  items: z.array(z.object({
    medicineId: z.string(),
    buyType: z.enum(['full', 'loose']),
    qty: z.number().min(1).max(50),
  })).optional().default([]),
  prescriptionUrl: z.string().trim().optional().default(''),
  prescriptionPublicId: z.string().trim().optional().default(''),
  note: z.string().trim().max(300).optional().default(''),
});

/* ---------- Auth ---------- */

const register = asyncHandler(async (req, res) => {
  const parsed = registerSchema.parse(req.body);
  const existing = await User.findOne({ email: parsed.email.toLowerCase() });
  if (existing) throw new ApiError(409, 'An account with this email already exists.');

  const user = await User.create({ ...parsed, role: 'customer' });
  sendAuthCookie(res, user);
  res.status(201).json({ user: user.toPublic(), token: signToken(user) });
});

const login = asyncHandler(async (req, res) => {
  const parsed = loginSchema.parse(req.body);
  const user = await User.findOne({ email: parsed.email.toLowerCase() }).select('+password');
  if (!user || !user.isActive || !(await user.comparePassword(parsed.password))) {
    throw new ApiError(401, 'Email or password is incorrect.');
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  sendAuthCookie(res, user);
  res.json({ user: user.toPublic(), token: signToken(user) });
});

const logout = (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ message: 'Signed out.' });
};

const me = (req, res) => res.json({ user: req.user.toPublic() });

const updateProfile = asyncHandler(async (req, res) => {
  const parsed = profileSchema.parse(req.body);
  req.user.name = parsed.name;
  req.user.phone = parsed.phone;
  await req.user.save();
  res.json({ user: req.user.toPublic() });
});

const changePassword = asyncHandler(async (req, res) => {
  const parsed = passwordSchema.parse(req.body);
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(parsed.currentPassword))) {
    throw new ApiError(401, 'Your current password is incorrect.');
  }

  user.password = parsed.newPassword;
  await user.save();
  sendAuthCookie(res, user);
  res.json({ message: 'Password updated.' });
});

/* ---------- Medicines ---------- */

const listMedicines = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit) || 60));
  const search = req.query.search ? String(req.query.search).trim() : '';
  const category = req.query.category ? String(req.query.category).trim() : '';
  const includeInactive = req.user?.role === 'admin' && req.query.all === 'true';

  const filter = includeInactive ? {} : { isActive: true };
  if (category && category !== 'All') filter.category = category;
  
  if (search) {
    filter.$text = { $search: search };
  }

  const [items, total] = await Promise.all([
    Medicine.find(filter)
      .sort(search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Medicine.countDocuments(filter),
  ]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
});

const listCategories = asyncHandler(async (_req, res) => {
  const categories = await Medicine.distinct('category', { isActive: true });
  res.json({ categories: categories.sort() });
});

const createMedicine = asyncHandler(async (req, res) => {
  const parsed = medicineSchemaZod.parse(req.body);
  if (!parsed.isDivisible) parsed.packSize = 1;
  const medicine = await Medicine.create(parsed);
  res.status(201).json({ medicine });
});

const updateMedicine = asyncHandler(async (req, res) => {
  const existing = await Medicine.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Medicine not found.');

  const parsed = medicineSchemaZod.parse(req.body);
  if (!parsed.isDivisible) parsed.packSize = 1;

  const previousPublicId = existing.imagePublicId;
  Object.assign(existing, parsed);
  await existing.save();

  if (previousPublicId && previousPublicId !== existing.imagePublicId) {
    await destroyCloudinaryAsset(previousPublicId);
  }

  res.json({ medicine: existing });
});

const deleteMedicine = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) throw new ApiError(404, 'Medicine not found.');

  medicine.isActive = false;
  await medicine.save();

  res.json({ message: 'Medicine hidden from the store.' });
});

/* ---------- Branches ---------- */

const listBranches = asyncHandler(async (req, res) => {
  const filter = req.user?.role === 'admin' ? {} : { isActive: true };
  const branches = await Branch.find(filter).sort({ createdAt: 1 }).lean();
  res.json({ branches });
});

const createBranch = asyncHandler(async (req, res) => {
  const parsed = branchSchemaZod.parse(req.body);
  const slug = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!parsed.shortName) parsed.shortName = parsed.name.split(' ')[0];

  const branch = await Branch.create({ ...parsed, slug });
  res.status(201).json({ branch });
});

const updateBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw new ApiError(404, 'Branch not found.');

  const parsed = branchSchemaZod.parse(req.body);
  if (!parsed.shortName) parsed.shortName = parsed.name.split(' ')[0];

  Object.assign(branch, parsed);
  await branch.save();

  res.json({ branch });
});

/* ---------- Orders ---------- */

const ORDER_STATUSES = ['pending_whatsapp', 'placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled'];

const createOrder = asyncHandler(async (req, res) => {
  const parsed = orderSchemaZod.parse(req.body);

  if (parsed.type === 'cart' && parsed.customer.area.length < 3) {
    throw new ApiError(422, 'Enter your area or locality.', { area: 'Enter your area or locality.' });
  }

  const branch = await Branch.findById(parsed.branchId);
  if (!branch || !branch.isActive) throw new ApiError(400, 'Pick an available branch.');

  if (parsed.type === 'cart' && parsed.items.length === 0) throw new ApiError(400, 'Your cart is empty.');

  let items = [];
  let estimatedTotal = 0;
  let estimatedSavings = 0;

  if (parsed.items.length > 0) {
    const ids = parsed.items.map((item) => item.medicineId).filter((id) => Types.ObjectId.isValid(id));
    const medicines = await Medicine.find({ _id: { $in: ids }, isActive: true }).lean();
    const byId = new Map(medicines.map((med) => [med._id.toString(), med]));

    items = parsed.items.map((raw) => {
      const medicine = byId.get(String(raw.medicineId));
      if (!medicine) throw new ApiError(400, 'One of the items is no longer available.');

      const buyType = raw.buyType === 'loose' && medicine.isDivisible ? 'loose' : 'full';
      const qty = raw.qty;

      const unitPrice = buyType === 'loose' ? Number((medicine.price / medicine.packSize).toFixed(2)) : medicine.price;
      const unitMrp = buyType === 'loose' ? Number((medicine.mrp / medicine.packSize).toFixed(2)) : medicine.mrp;
      const lineTotal = Number((unitPrice * qty).toFixed(2));

      estimatedTotal += lineTotal;
      estimatedSavings += Math.max(0, unitMrp - unitPrice) * qty;

      return {
        medicine: medicine._id,
        name: medicine.name,
        displayName:
          buyType === 'loose'
            ? `${medicine.name} — 1 ${medicine.unitType.toLowerCase()}`
            : `${medicine.name} — ${medicine.packType.toLowerCase()} of ${medicine.packSize}`,
        buyType,
        qty,
        unitPrice,
        unitMrp,
        lineTotal,
      };
    });
  }

  const order = await Order.create({
    user: req.user?._id || null,
    branch: branch._id,
    type: parsed.type,
    items,
    customer: parsed.customer,
    prescriptionUrl: parsed.prescriptionUrl,
    prescriptionPublicId: parsed.prescriptionPublicId,
    estimatedTotal: Number(estimatedTotal.toFixed(2)),
    estimatedSavings: Number(estimatedSavings.toFixed(2)),
    note: parsed.note,
    status: 'pending_whatsapp', 
  });

  res.status(201).json({
    order: {
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      estimatedTotal: order.estimatedTotal,
      status: order.status,
      branch: { id: branch._id.toString(), name: branch.name, phone: branch.phone },
    },
  });
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
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 25));
  const status = req.query.status ? String(req.query.status).trim() : '';

  const filter = {};
  if (status && ORDER_STATUSES.includes(status)) filter.status = status;

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

  res.json({ orders, total, page, pages: Math.ceil(total / limit) || 1 });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const status = String(req.body.status).trim();
  if (!ORDER_STATUSES.includes(status)) throw new ApiError(422, 'Unknown order status.');

  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { status, note: String(req.body.note || '').slice(0, 300) },
    { new: true },
  ).populate('branch', 'name shortName phone address');

  if (!order) throw new ApiError(404, 'Order not found.');
  res.json({ order });
});

const adminStats = asyncHandler(async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [ordersToday, pending, revenueAgg, medicineCount] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: startOfDay } }),
    Order.countDocuments({ status: { $in: ['pending_whatsapp', 'placed', 'confirmed', 'packed'] } }),
    Order.aggregate([
      { $match: { status: 'delivered', createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$estimatedTotal' } } },
    ]),
    Medicine.countDocuments({ isActive: true }),
  ]);

  res.json({
    ordersToday,
    pending,
    revenueToday: revenueAgg[0]?.total || 0,
    medicineCount,
  });
});

/* ---------- Uploads ---------- */

const uploadProductImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Attach an image file.');

  const result = await uploadBufferToCloudinary(req.file.buffer, 'lotus-pharmacy/products', [
    { width: 600, height: 600, crop: 'fill', gravity: 'auto' },
    { quality: 'auto', fetch_format: 'auto' }, 
  ]);

  res.status(201).json({ url: result.secure_url, publicId: result.public_id });
});

const uploadPrescription = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Attach a photo of the prescription.');

  const result = await uploadBufferToCloudinary(req.file.buffer, 'lotus-pharmacy/prescriptions', [
    { width: 1600, crop: 'limit' },
    { quality: 'auto', fetch_format: 'auto' },
  ]);

  res.status(201).json({ url: result.secure_url, publicId: result.public_id });
});

const deleteUpload = asyncHandler(async (req, res) => {
  const { publicId } = req.body;
  if (!publicId) throw new ApiError(400, 'publicId is required.');
  await destroyCloudinaryAsset(publicId);
  res.json({ message: 'Asset deleted.' });
});


/* ================================================================== */
/*  7. ROUTES                                                         */
/* ================================================================== */

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const writeLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 40 });

const authRouter = express.Router();
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

const uploadRouter = express.Router();
uploadRouter.post('/product', protect, adminOnly, requireCloudinary, upload.single('image'), uploadProductImage);
uploadRouter.post('/prescription', writeLimiter, requireCloudinary, upload.single('image'), uploadPrescription);
uploadRouter.delete('/revert', protect, adminOnly, requireCloudinary, deleteUpload);

const adminRouter = express.Router();
adminRouter.get('/stats', protect, adminOnly, adminStats);

/* ================================================================== */
/*  8. APP SETUP & SEEDING                                            */
/* ================================================================== */

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(cookieParser());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.clientOrigins.includes(origin)) return callback(null, true);
      callback(new ApiError(403, 'Origin not allowed.'));
    },
    credentials: true,
  }),
);

app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/medicines', medicineRouter);
app.use('/api/branches', branchRouter);
app.use('/api/orders', orderRouter);
app.use('/api/uploads', uploadRouter);
app.use('/api/admin', adminRouter);

app.use((req, _res, next) => next(new ApiError(404, `No route for ${req.method} ${req.originalUrl}`)));

app.use((err, _req, res, _next) => {
  let { statusCode = 500, message } = err;
  let details = err.details;

  if (err instanceof multer.MulterError) {
    statusCode = 413;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'That image is over 5 MB.' : 'Upload failed.';
  } else if (err instanceof z.ZodError) {
    statusCode = 422;
    message = 'Some fields need attention.';
    details = Object.fromEntries(err.errors.map((e) => [e.path.join('.'), e.message]));
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'That id is not valid.';
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'That record already exists.';
  }

  if (statusCode >= 500) {
    console.error('[error]', err);
    if (isProd) message = 'Something went wrong on our side.';
  }

  res.status(statusCode).json({ message, ...(details ? { details } : {}) });
});

let server;

async function setupSeedAdmin() {
  if (!config.seedAdmin.email || !config.seedAdmin.password) {
    return;
  }
  
  try {
    const adminEmail = config.seedAdmin.email.toLowerCase();
    let adminUser = await User.findOne({ email: adminEmail });

    if (!adminUser) {
      adminUser = new User({
        name: 'System Admin',
        email: adminEmail,
        phone: '9999999999',
        password: config.seedAdmin.password,
        role: 'admin',
      });
      await adminUser.save();
      console.log(`[db] Seed admin created successfully for: ${adminEmail}`);
    } else if (adminUser.role !== 'admin') {
      adminUser.role = 'admin';
      await adminUser.save();
      console.log(`[db] Existing user upgraded to admin role: ${adminEmail}`);
    } else {
      console.log(`[db] Seed admin is ready: ${adminEmail}`);
    }
  } catch (err) {
    console.error('[db] Error seeding admin user:', err.message);
  }
}

async function setupSeedBranch() {
  try {
    const branchCount = await Branch.countDocuments();
    if (branchCount === 0) {
      await Branch.create({
        slug: 'main-branch',
        name: 'Main Branch',
        shortName: 'Main',
        phone: '919999999999',
        address: 'Central Area',
        fullAddress: '123 Main Street, City Center',
        lat: 19.0760,
        lng: 72.8777,
        isActive: true
      });
      console.log('[db] Seed branch created successfully.');
    }
  } catch (err) {
    console.error('[db] Error seeding branch:', err.message);
  }
}

async function start() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('[db] Connected.');
  
  await setupSeedAdmin();
  await setupSeedBranch();

  server = app.listen(config.port, () => console.log(`[server] Listening on :${config.port}`));
}

start().catch((error) => {
  console.error('[fatal] Startup failed:', error);
  process.exit(1);
});

module.exports = app;