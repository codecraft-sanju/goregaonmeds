'use strict';
// First Order Offer: one FREE GlucoOne Blood Glucose Machine per customer, across all branches.
// Customer identity is the normalised 10-digit mobile number. The unique index on
// OfferRedemption { offerId, phone } is the single source of truth, so concurrent saves cannot both win.
const { Bill, OfferRedemption } = require('./db');

const FIRST_ORDER_OFFER = Object.freeze({
  active: true,
  id: 'first-order-glucoone',
  giftName: 'GlucoOne Blood Glucose Machine',
  // Medicines after discount, before delivery. The delivery charge never counts toward the threshold.
  minMerchandisePaise: 50_000,
});

const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;
const merchandisePaise = (totals) => Math.max(0, totals.gross - totals.discount);
const giftFor = (redeemedAt) => ({ offerId: FIRST_ORDER_OFFER.id, name: FIRST_ORDER_OFFER.giftName, qty: 1, price: 0, redeemedAt });

function firstOrderOfferPublic() {
  return FIRST_ORDER_OFFER.active
    ? { giftName: FIRST_ORDER_OFFER.giftName, minSubtotal: FIRST_ORDER_OFFER.minMerchandisePaise }
    : null;
}

function findRedemption(phone) {
  return OfferRedemption.findOne({ offerId: FIRST_ORDER_OFFER.id, phone }).select('billId reference redeemedAt -_id').lean();
}

/**
 * Status for a normalised phone, from the point of view of `billId` (the bill being edited, if any):
 * redeemed_here | already_redeemed | inactive | returning_customer | available | no_phone
 */
async function firstOrderStatus(phone, billId) {
  if (!phone) return { status: 'no_phone' };
  const redemption = await findRedemption(phone);
  // Checked before `active` so gifts already given stay on their bills after the offer ends.
  if (redemption) return { status: redemption.billId === billId ? 'redeemed_here' : 'already_redeemed', redemption };
  if (!FIRST_ORDER_OFFER.active) return { status: 'inactive' };
  // Any other saved bill for this number means this is not the customer's first order.
  const previous = await Bill.exists({ phone, billId: { $ne: billId } });
  return { status: previous ? 'returning_customer' : 'available' };
}

/**
 * Decides the free gift for a priced bill and claims the redemption atomically.
 * Returns { freeGift, claimed? } or { status, error }. Call releaseClaim() if the bill write then fails.
 */
async function resolveFreeGift(bill, existing) {
  const min = FIRST_ORDER_OFFER.minMerchandisePaise;
  const merchandise = merchandisePaise(bill.totals);

  if (existing?.freeGift && existing.phone !== bill.phone) {
    return { status: 409, error: 'This bill already includes the redeemed First Order gift, so its customer number cannot be changed. Create a new bill for a different customer.' };
  }

  const { status, redemption } = await firstOrderStatus(bill.phone, bill.billId);
  if (status === 'redeemed_here') {
    if (merchandise < min) {
      return { status: 409, error: `This bill includes the redeemed First Order gift, so its medicine total (before delivery) must stay at ${rupees(min)} or more.` };
    }
    return { freeGift: existing?.freeGift ?? giftFor(redemption.redeemedAt) };
  }
  if (status !== 'available' || merchandise < min) return { freeGift: null };

  const redeemedAt = new Date();
  try {
    await OfferRedemption.create({
      offerId: FIRST_ORDER_OFFER.id, phone: bill.phone, billId: bill.billId, reference: bill.reference,
      branch: bill.branch, merchandisePaise: merchandise, redeemedAt,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    // Lost the race. If the winner is this same bill (double submit), keep its gift; otherwise no gift.
    const winner = await findRedemption(bill.phone);
    return { freeGift: winner?.billId === bill.billId ? giftFor(winner.redeemedAt) : null };
  }
  return { freeGift: giftFor(redeemedAt), claimed: true };
}

/** Undo a claim made in this request when the bill itself could not be saved. */
async function releaseClaim(bill) {
  try {
    await OfferRedemption.deleteOne({ offerId: FIRST_ORDER_OFFER.id, phone: bill.phone, billId: bill.billId });
  } catch (error) {
    console.error('[offers] Could not release redemption:', error.name);
  }
}

/** The redemption stays permanent; only record that its bill was removed. */
function markBillDeleted(billId) {
  return OfferRedemption.updateOne({ billId }, { $set: { billDeletedAt: new Date() } });
}

module.exports = { FIRST_ORDER_OFFER, firstOrderOfferPublic, firstOrderStatus, resolveFreeGift, releaseClaim, markBillDeleted };