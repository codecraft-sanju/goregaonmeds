'use strict';
// Server-side mirror of the frontend rules in billing.ts. Keep the two in sync.

const BRANCH_COUNT = 3;
const MAX_DELIVERY_PAISE = 1_000_000; // ₹10,000 ceiling catches a mistyped charge.
const FULFILMENT = ['pickup', 'delivery'];
const MONEY = /^\d{1,7}(\.\d{0,2})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MOBILE = /^[6-9]\d{9}$/;
const EXPIRY = /^\d{4}-(0[1-9]|1[0-2])$/;
const SINGLE_LINE_CONTROL = /[\u0000-\u001F\u007F]/g;
const MULTI_LINE_CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function text(value, max, { multiline = false } = {}) {
  if (typeof value !== 'string') return null;
  const clean = value.replace(multiline ? MULTI_LINE_CONTROL : SINGLE_LINE_CONTROL, '').trim();
  return clean.length <= max ? clean : null;
}

function paise(value) {
  if (typeof value !== 'string' || !MONEY.test(value)) return 0;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function totals(bill, shipping = 0) {
  const gross = bill.items.reduce((sum, item) => sum + paise(item.rate) * Number(item.qty), 0);
  const discount = Math.min(paise(bill.discount), gross);
  const total = gross - discount + shipping;
  const received = paise(bill.received);
  return { gross, discount, shipping, total, received, due: Math.max(0, total - received) };
}

/** Returns { value } with a normalised bill, or { error } with a user-facing message. */
function parseBill(input) {
  if (!isPlainObject(input)) return { error: 'Send the bill as a JSON object.' };

  // YAHAN FIX KIYA HAI: Yeh dono accept karega (id ya billId) taaki cache/deployment ka koi issue na ho
  const incomingId = typeof (input.id || input.billId) === 'string' ? (input.id || input.billId).trim() : '';
  if (!incomingId || !UUID.test(incomingId)) return { error: 'The bill ID is invalid.' };

  const reference = text(input.reference, 50);
  if (!reference) return { error: 'Enter a bill reference (up to 50 characters).' };

  // YAHAN FIX KIYA HAI: Yeh dono accept karega (createdAt ya billedAt)
  const incomingDate = input.createdAt || input.billedAt;
  const billedAt = new Date(typeof incomingDate === 'string' ? incomingDate : NaN);
  if (Number.isNaN(billedAt.getTime()) || billedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return { error: 'The bill date is invalid.' };
  }

  if (!Number.isInteger(input.branch) || input.branch < 0 || input.branch >= BRANCH_COUNT) return { error: 'Choose a valid branch.' };

  const customer = text(input.customer ?? '', 80);
  if (customer === null) return { error: 'Customer name must be 80 characters or fewer.' };

  if (typeof input.phone !== 'string' || (input.phone && !MOBILE.test(input.phone))) {
    return { error: 'Enter a valid 10-digit customer WhatsApp number.' };
  }
  if (!['UPI', 'Cash', 'Card'].includes(input.method)) return { error: 'Choose a valid payment method.' };

  // Bills saved before home delivery existed have no fulfilment field; treat them as pickup.
  const fulfilment = input.fulfilment ?? 'pickup';
  if (!FULFILMENT.includes(fulfilment)) return { error: 'Choose counter pickup or home delivery.' };

  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) {
    return { error: 'Add between 1 and 50 medicines.' };
  }
  
  const items = [];
  for (const [index, raw] of input.items.entries()) {
    const row = index + 1;
    if (!isPlainObject(raw)) return { error: `Row ${row} is invalid.` };
    // Yahan bhi double check laga diya hai
    const itemId = typeof (raw.id || raw.itemId) === 'string' ? (raw.id || raw.itemId).trim() : '';
    if (!itemId || !UUID.test(itemId)) return { error: `Row ${row} is invalid.` };
    
    const name = text(raw.name, 160);
    if (!name) return { error: `Enter the medicine name in row ${row}.` };
    const batch = text(raw.batch ?? '', 30);
    if (batch === null) return { error: `Row ${row}: batch must be 30 characters or fewer.` };
    const expiry = typeof raw.expiry === 'string' ? raw.expiry : '';
    if (expiry && !EXPIRY.test(expiry)) return { error: `Row ${row}: expiry must be a valid month.` };
    if (typeof raw.qty !== 'string' || !/^\d{1,4}$/.test(raw.qty) || Number(raw.qty) < 1) {
      return { error: `Row ${row}: quantity must be a whole number from 1 to 9,999.` };
    }
    if (typeof raw.rate !== 'string' || !MONEY.test(raw.rate)) {
      return { error: `Row ${row}: enter a non-negative rate with at most 2 decimal places.` };
    }
    items.push({ id: itemId, name, batch, expiry, qty: String(Number(raw.qty)), rate: raw.rate });
  }

  if (typeof input.discount !== 'string' || !MONEY.test(input.discount)) return { error: 'Enter a valid discount amount.' };
  if (typeof input.received !== 'string' || !MONEY.test(input.received)) return { error: 'Enter a valid amount received.' };

  const note = text(input.note ?? '', 300, { multiline: true });
  if (note === null) return { error: 'Customer note must be 300 characters or fewer.' };

  const bill = {
    billId: incomingId, reference, billedAt, branch: input.branch, customer, phone: input.phone,
    method: input.method, fulfilment, items, discount: input.discount, received: input.received, note,
  };
  
  if (paise(bill.discount) > totals(bill).gross) return { error: 'Discount cannot exceed the subtotal.' };

  return { value: bill };
}

/** Attaches the server-resolved delivery charge (paise) and totals to a parsed bill, or returns { error }. */
function priceBill(bill, shipping) {
  if (!Number.isInteger(shipping) || shipping < 0) return { error: 'The delivery charge is invalid.' };
  const computed = totals(bill, shipping);
  if (computed.received > computed.total) return { error: 'Amount received cannot exceed the bill total.' };
  return { value: { ...bill, shipping, totals: computed } };
}

/** Returns { value } with the delivery charge in paise, or { error }. */
function parseDeliveryCharge(input) {
  const value = isPlainObject(input) ? input.deliveryCharge : undefined;
  if (typeof value !== 'string' || !MONEY.test(value)) return { error: 'Enter a delivery charge such as 0, 20 or 40.' };
  const amount = paise(value);
  if (amount > MAX_DELIVERY_PAISE) return { error: 'Delivery charge cannot exceed ₹10,000.' };
  return { value: amount };
}

/** Returns { value } with a normalised checkout profile, or { error }. */
function parseProfile(input) {
  if (!isPlainObject(input)) return { error: 'Send the delivery details as a JSON object.' };
  const name = text(input.name, 80);
  const house = text(input.house, 180);
  const area = text(input.area, 100);
  const landmark = text(input.landmark ?? '', 100);
  if (!name || !house || !area || landmark === null) return { error: 'Enter your name and complete delivery address.' };
  if (typeof input.phone !== 'string' || !MOBILE.test(input.phone)) return { error: 'Enter a valid 10-digit Indian mobile number.' };
  if (!Number.isInteger(input.branch) || input.branch < 0 || input.branch >= BRANCH_COUNT) return { error: 'Choose a valid branch.' };
  if (!['cod', 'upi'].includes(input.payment)) return { error: 'Choose a valid payment preference.' };
  return { value: { name, phone: input.phone, house, area, landmark, branch: input.branch, payment: input.payment } };
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { BRANCH_COUNT, MAX_DELIVERY_PAISE, parseBill, priceBill, parseDeliveryCharge, parseProfile, escapeRegex, text };