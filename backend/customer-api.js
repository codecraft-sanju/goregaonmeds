//backend/customer-api.js
'use strict';
// Saved delivery details for one-click checkout.
// A customer is identified by a random 256-bit device token (X-Customer-Token), never by phone
// number: looking addresses up by phone would let anyone read a stranger's home address.
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { createHash } = require('node:crypto');
const { CustomerProfile } = require('./db');
const { parseProfile } = require('./validation');

const TOKEN = /^[a-f0-9]{64}$/;
const PUBLIC_FIELDS = 'name phone house area landmark branch payment -_id';

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function tokenHash(req) {
  const token = req.get('X-Customer-Token');
  return typeof token === 'string' && TOKEN.test(token) ? createHash('sha256').update(token).digest('hex') : null;
}

module.exports = function installCustomerApi(app) {
  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(express.json({ limit: '4kb' }));
  router.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please retry in a few minutes.' },
  }));

  router.get('/profile', asyncRoute(async (req, res) => {
    const hash = tokenHash(req);
    if (!hash) return res.json({ profile: null });
    const profile = await CustomerProfile.findOne({ tokenHash: hash }).select(PUBLIC_FIELDS).lean();
    return res.json({ profile: profile ?? null });
  }));

  router.put('/profile', asyncRoute(async (req, res) => {
    const hash = tokenHash(req);
    if (!hash) return res.status(400).json({ error: 'Missing or invalid device token.' });
    const parsed = parseProfile(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    await CustomerProfile.updateOne(
      { tokenHash: hash },
      { $set: { ...parsed.value, lastOrderAt: new Date() }, $setOnInsert: { tokenHash: hash } },
      { upsert: true, runValidators: true },
    );
    return res.status(204).end();
  }));

  router.delete('/profile', asyncRoute(async (req, res) => {
    const hash = tokenHash(req);
    if (hash) await CustomerProfile.deleteOne({ tokenHash: hash });
    return res.status(204).end();
  }));

  app.use('/api/customer', router);
};