//backend/db.js
'use strict';
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);
// Fail fast instead of silently queueing queries for 10s when the database is unreachable.
mongoose.set('bufferCommands', false);

const { Schema } = mongoose;

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

const billSchema = new Schema(
  {
    billId: { type: String, required: true, unique: true },
    reference: { type: String, required: true },
    billedAt: { type: Date, required: true },
    branch: { type: Number, required: true, min: 0 },
    customer: { type: String, default: '' },
    phone: { type: String, default: '' },
    method: { type: String, enum: ['UPI', 'Cash', 'Card'], required: true },
    items: { type: [billItemSchema], required: true },
    discount: { type: String, required: true },
    received: { type: String, required: true },
    note: { type: String, default: '' },
    // Server-computed totals in paise. Never trusted from the client.
    totals: {
      gross: { type: Number, required: true },
      discount: { type: Number, required: true },
      total: { type: Number, required: true },
      received: { type: Number, required: true },
      due: { type: Number, required: true },
    },
    savedAt: { type: Date, required: true },
  },
  { versionKey: false, timestamps: true },
);
billSchema.index({ savedAt: -1, _id: -1 });

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

const AdminSession = mongoose.models.AdminSession || mongoose.model('AdminSession', adminSessionSchema);
const Bill = mongoose.models.Bill || mongoose.model('Bill', billSchema);
const CustomerProfile = mongoose.models.CustomerProfile || mongoose.model('CustomerProfile', customerProfileSchema);

async function connectDatabase(uri) {
  if (typeof uri !== 'string' || !/^mongodb(\+srv)?:\/\//.test(uri.trim())) {
    throw new Error('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection string.');
  }
  mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB disconnected.'));
  mongoose.connection.on('reconnected', () => console.log('[db] MongoDB reconnected.'));
  mongoose.connection.on('error', (error) => console.error('[db] MongoDB error:', error.name));
  await mongoose.connect(uri.trim(), { serverSelectionTimeoutMS: 10000, maxPoolSize: 10 });
  await Promise.all([AdminSession.syncIndexes(), Bill.syncIndexes(), CustomerProfile.syncIndexes()]);
  console.log('[db] Connected to MongoDB.');
}

const isDatabaseReady = () => mongoose.connection.readyState === 1;
const disconnectDatabase = () => mongoose.disconnect();
const isDatabaseError = (error) => typeof error?.name === 'string' && /^Mongo/.test(error.name);

module.exports = { AdminSession, Bill, CustomerProfile, connectDatabase, disconnectDatabase, isDatabaseReady, isDatabaseError };