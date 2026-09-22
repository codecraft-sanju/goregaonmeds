// 'use strict';
// const mongoose = require('mongoose');

// mongoose.set('strictQuery', true);
// // Fail fast instead of silently queueing queries for 10s when the database is unreachable.
// mongoose.set('bufferCommands', false);

// const { Schema } = mongoose;
// const STORE_SETTINGS_KEY = 'store';

// const adminSessionSchema = new Schema(
//   {
//     tokenHash: { type: String, required: true, unique: true },
//     // TTL index: MongoDB removes the document once expiresAt passes (checked roughly every 60s).
//     expiresAt: { type: Date, required: true, index: { expires: 0 } },
//   },
//   { versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
// );

// const billItemSchema = new Schema(
//   {
//     id: { type: String, required: true },
//     name: { type: String, required: true },
//     batch: { type: String, default: '' },
//     expiry: { type: String, default: '' },
//     qty: { type: String, required: true },
//     rate: { type: String, required: true },
//   },
//   { _id: false },
// );

// const billSchema = new Schema(
//   {
//     billId: { type: String, required: true, unique: true },
//     reference: { type: String, required: true },
//     billedAt: { type: Date, required: true },
//     branch: { type: Number, required: true, min: 0 },
//     customer: { type: String, default: '' },
//     phone: { type: String, default: '' },
//     method: { type: String, enum: ['UPI', 'Cash', 'Card'], required: true },
//     fulfilment: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
//     // Delivery charge in paise, snapshotted when the bill first became a delivery bill.
//     shipping: { type: Number, default: 0, min: 0 },
//     items: { type: [billItemSchema], required: true },
//     discount: { type: String, required: true },
//     received: { type: String, required: true },
//     note: { type: String, default: '' },
//     // Server-computed totals in paise. Never trusted from the client.
//     totals: {
//       gross: { type: Number, required: true },
//       discount: { type: Number, required: true },
//       shipping: { type: Number, default: 0 },
//       total: { type: Number, required: true },
//       received: { type: Number, required: true },
//       due: { type: Number, required: true },
//     },
//     savedAt: { type: Date, required: true },
//   },
//   { versionKey: false, timestamps: true },
// );
// billSchema.index({ savedAt: -1, _id: -1 });

// const customerProfileSchema = new Schema(
//   {
//     tokenHash: { type: String, required: true, unique: true },
//     name: { type: String, required: true },
//     phone: { type: String, required: true },
//     house: { type: String, required: true },
//     area: { type: String, required: true },
//     landmark: { type: String, default: '' },
//     branch: { type: Number, required: true, min: 0 },
//     payment: { type: String, enum: ['cod', 'upi'], required: true },
//     // Saved addresses expire 180 days after the customer's last order.
//     lastOrderAt: { type: Date, required: true, index: { expires: '180d' } },
//   },
//   { versionKey: false },
// );

// const storeSettingSchema = new Schema(
//   {
//     key: { type: String, required: true, unique: true },
//     deliveryCharge: {
//       type: Number,
//       required: true,
//       min: 0,
//       validate: { validator: Number.isInteger, message: 'Delivery charge must be a whole number of paise.' },
//     },
//   },
//   { versionKey: false, timestamps: true },
// );

// const AdminSession = mongoose.models.AdminSession || mongoose.model('AdminSession', adminSessionSchema);
// const Bill = mongoose.models.Bill || mongoose.model('Bill', billSchema);
// const CustomerProfile = mongoose.models.CustomerProfile || mongoose.model('CustomerProfile', customerProfileSchema);
// const StoreSetting = mongoose.models.StoreSetting || mongoose.model('StoreSetting', storeSettingSchema);

// /** Delivery charge defaults to ₹0 until an admin saves one. */
// async function getStoreSettings() {
//   const doc = await StoreSetting.findOne({ key: STORE_SETTINGS_KEY }).select('deliveryCharge updatedAt -_id').lean();
//   return { deliveryCharge: doc?.deliveryCharge ?? 0, updatedAt: doc?.updatedAt ? doc.updatedAt.toISOString() : null };
// }

// const getDeliveryCharge = async () => (await getStoreSettings()).deliveryCharge;

// async function setDeliveryCharge(deliveryCharge) {
//   const doc = await StoreSetting.findOneAndUpdate(
//     { key: STORE_SETTINGS_KEY },
//     { $set: { deliveryCharge } },
//     { upsert: true, returnDocument: 'after', runValidators: true, lean: true },
//   );
//   return { deliveryCharge: doc.deliveryCharge, updatedAt: doc.updatedAt.toISOString() };
// }

// async function connectDatabase(uri) {
//   if (typeof uri !== 'string' || !/^mongodb(\+srv)?:\/\//.test(uri.trim())) {
//     throw new Error('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection string.');
//   }
//   mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB disconnected.'));
//   mongoose.connection.on('reconnected', () => console.log('[db] MongoDB reconnected.'));
//   mongoose.connection.on('error', (error) => console.error('[db] MongoDB error:', error.name));
//   await mongoose.connect(uri.trim(), { serverSelectionTimeoutMS: 10000, maxPoolSize: 10 });
//   await Promise.all([AdminSession.syncIndexes(), Bill.syncIndexes(), CustomerProfile.syncIndexes(), StoreSetting.syncIndexes()]);
//   console.log('[db] Connected to MongoDB.');
// }

// const isDatabaseReady = () => mongoose.connection.readyState === 1;
// const disconnectDatabase = () => mongoose.disconnect();
// const isDatabaseError = (error) => typeof error?.name === 'string' && /^Mongo/.test(error.name);

// module.exports = {
//   AdminSession, Bill, CustomerProfile, StoreSetting,
//   getStoreSettings, getDeliveryCharge, setDeliveryCharge,
//   connectDatabase, disconnectDatabase, isDatabaseReady, isDatabaseError,
// };

'use strict';
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);
// Fail fast instead of silently queueing queries for 10s when the database is unreachable.
mongoose.set('bufferCommands', false);

const { Schema } = mongoose;
const STORE_SETTINGS_KEY = 'store';

const adminSessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    // TTL index: MongoDB removes the document once expiresAt passes (checked roughly every 60s).
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

const billItemSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    batch: { type: String, default: '' },
    expiry: { type: String, default: '' },
    qty: { type: String, required: true },
    rate: { type: String, required: true },
  },
  { _id: false },
);

// Promotional item attached by the server only. Never counted in totals.
const freeGiftSchema = new Schema(
  {
    offerId: { type: String, required: true },
    name: { type: String, required: true },
    qty: { type: Number, default: 1, min: 1 },
    price: { type: Number, default: 0, min: 0, max: 0 },
    redeemedAt: { type: Date, required: true },
  },
  { _id: false },
);

const billSchema = new Schema(
  {
    billId: { type: String, required: true, unique: true },
    reference: { type: String, required: true },
    billedAt: { type: Date, required: true },
    branch: { type: Number, required: true, min: 0 },
    customer: { type: String, default: '' },
    phone: { type: String, default: '' },
    method: { type: String, enum: ['UPI', 'Cash', 'Card'], required: true },
    fulfilment: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
    // Delivery charge in paise, snapshotted when the bill first became a delivery bill.
    shipping: { type: Number, default: 0, min: 0 },
    items: { type: [billItemSchema], required: true },
    discount: { type: String, required: true },
    received: { type: String, required: true },
    note: { type: String, default: '' },
    freeGift: { type: freeGiftSchema, default: null },
    // Server-computed totals in paise. Never trusted from the client.
    totals: {
      gross: { type: Number, required: true },
      discount: { type: Number, required: true },
      shipping: { type: Number, default: 0 },
      total: { type: Number, required: true },
      received: { type: Number, required: true },
      due: { type: Number, required: true },
    },
    savedAt: { type: Date, required: true },
  },
  { versionKey: false, timestamps: true },
);
billSchema.index({ savedAt: -1, _id: -1 });
// Supports the "has this number ordered before?" check for the First Order Offer.
billSchema.index({ phone: 1 });

const customerProfileSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    house: { type: String, required: true },
    area: { type: String, required: true },
    landmark: { type: String, default: '' },
    branch: { type: Number, required: true, min: 0 },
    payment: { type: String, enum: ['cod', 'upi'], required: true },
    // Saved addresses expire 180 days after the customer's last order.
    lastOrderAt: { type: Date, required: true, index: { expires: '180d' } },
  },
  { versionKey: false },
);

const storeSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    deliveryCharge: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'Delivery charge must be a whole number of paise.' },
    },
  },
  { versionKey: false, timestamps: true },
);

// Permanent ledger of offer redemptions. Never deleted by the app, not even when the bill is deleted.
const offerRedemptionSchema = new Schema(
  {
    offerId: { type: String, required: true },
    phone: { type: String, required: true, match: /^[6-9]\d{9}$/ },
    billId: { type: String, required: true },
    reference: { type: String, default: '' },
    branch: { type: Number, min: 0 },
    merchandisePaise: { type: Number, required: true, min: 0 },
    redeemedAt: { type: Date, required: true },
    billDeletedAt: { type: Date, default: null },
  },
  { versionKey: false },
);
// The atomic guarantee: one redemption per offer per normalised mobile number.
offerRedemptionSchema.index({ offerId: 1, phone: 1 }, { unique: true });
offerRedemptionSchema.index({ billId: 1 });

const AdminSession = mongoose.models.AdminSession || mongoose.model('AdminSession', adminSessionSchema);
const Bill = mongoose.models.Bill || mongoose.model('Bill', billSchema);
const CustomerProfile = mongoose.models.CustomerProfile || mongoose.model('CustomerProfile', customerProfileSchema);
const StoreSetting = mongoose.models.StoreSetting || mongoose.model('StoreSetting', storeSettingSchema);
const OfferRedemption = mongoose.models.OfferRedemption || mongoose.model('OfferRedemption', offerRedemptionSchema);

/** Delivery charge defaults to ₹0 until an admin saves one. */
async function getStoreSettings() {
  const doc = await StoreSetting.findOne({ key: STORE_SETTINGS_KEY }).select('deliveryCharge updatedAt -_id').lean();
  return { deliveryCharge: doc?.deliveryCharge ?? 0, updatedAt: doc?.updatedAt ? doc.updatedAt.toISOString() : null };
}

const getDeliveryCharge = async () => (await getStoreSettings()).deliveryCharge;

async function setDeliveryCharge(deliveryCharge) {
  const doc = await StoreSetting.findOneAndUpdate(
    { key: STORE_SETTINGS_KEY },
    { $set: { deliveryCharge } },
    { upsert: true, returnDocument: 'after', runValidators: true, lean: true },
  );
  return { deliveryCharge: doc.deliveryCharge, updatedAt: doc.updatedAt.toISOString() };
}

async function connectDatabase(uri) {
  if (typeof uri !== 'string' || !/^mongodb(\+srv)?:\/\//.test(uri.trim())) {
    throw new Error('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection string.');
  }
  mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB disconnected.'));
  mongoose.connection.on('reconnected', () => console.log('[db] MongoDB reconnected.'));
  mongoose.connection.on('error', (error) => console.error('[db] MongoDB error:', error.name));
  await mongoose.connect(uri.trim(), { serverSelectionTimeoutMS: 10000, maxPoolSize: 10 });
  await Promise.all([
    AdminSession.syncIndexes(), Bill.syncIndexes(), CustomerProfile.syncIndexes(),
    StoreSetting.syncIndexes(), OfferRedemption.syncIndexes(),
  ]);
  console.log('[db] Connected to MongoDB.');
}

const isDatabaseReady = () => mongoose.connection.readyState === 1;
const disconnectDatabase = () => mongoose.disconnect();
const isDatabaseError = (error) => typeof error?.name === 'string' && /^Mongo/.test(error.name);

module.exports = {
  AdminSession, Bill, CustomerProfile, StoreSetting, OfferRedemption,
  getStoreSettings, getDeliveryCharge, setDeliveryCharge,
  connectDatabase, disconnectDatabase, isDatabaseReady, isDatabaseError,
};