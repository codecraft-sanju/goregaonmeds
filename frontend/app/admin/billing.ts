//frontend/app/admin/billing.ts
export type Item = { id: string; name: string; batch: string; expiry: string; qty: string; rate: string };
export type Fulfilment = 'pickup' | 'delivery';
// Attached by the server only; never counted in totals and ignored if sent back.
export type FreeGift = { offerId: string; name: string; qty: number; price: number; redeemedAt: string };
export type OfferStatus = 'available' | 'returning_customer' | 'already_redeemed' | 'redeemed_here' | 'no_phone' | 'inactive';
export type Bill = {
  id: string; reference: string; createdAt: string; branch: number;
  customer: string; phone: string; method: 'UPI' | 'Cash' | 'Card';
  // shipping is in paise and resolved by the server; the client value is display-only.
  fulfilment: Fulfilment; shipping: number;
  freeGift: FreeGift | null;
  items: Item[]; discount: string; received: string; note: string;
};
export const BRANCHES = [
  { name: 'Apple Pharmacy', area: 'Aarey Road', address: 'Shop No. 9, Sheetal Krupa Building, Ground Floor, Aarey Road, Goregaon East, Mumbai', phone: '+91 84338 18771', gstin: '', licence: '', open24x7: false },
  { name: 'Lotus Pharmacy', area: 'Jay Prakash Nagar', address: 'Shop No. 10, Shreyas Bhavan, Jay Prakash Nagar Road No. 1, opposite Domino’s Pizza, Goregaon East, Mumbai', phone: '+91 84338 18771', gstin: '', licence: '', open24x7: false },
  { name: 'Healthzone & Cosmetic', area: 'Aarey Road', address: 'Pednekar Chawl, Shop No. 3, Ground Floor, S.V., Aarey Road, Goregaon East, Mumbai', phone: '+91 84338 18771', gstin: '', licence: '', open24x7: true },
];
export const MAX_DELIVERY_PAISE = 1_000_000; // Must match the backend validation.js limit.
export const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100);
export function paise(value: string): number {
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(value)) return 0;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export const validMoney = (value: string) => /^\d{1,7}(\.\d{0,2})?$/.test(value);
export const newItem = (): Item => ({ id: crypto.randomUUID(), name: '', batch: '', expiry: '', qty: '1', rate: '' });
export function newBill(): Bill {
  const id = crypto.randomUUID();
  return { id, reference: `GM-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${id.slice(0,8).toUpperCase()}`, createdAt: new Date().toISOString(), branch: 0, customer: '', phone: '', method: 'UPI', fulfilment: 'pickup', shipping: 0, freeGift: null, items: [newItem()], discount: '0', received: '0', note: '' };
}
export function totals(b: Bill) {
  const gross = b.items.reduce((sum, i) => sum + paise(i.rate) * (Number(i.qty) || 0), 0);
  const discount = Math.min(paise(b.discount), gross);
  const shipping = b.fulfilment === 'delivery' && Number.isInteger(b.shipping) && b.shipping > 0 ? b.shipping : 0;
  const total = gross - discount + shipping;
  const received = paise(b.received);
  // merchandise = medicines after discount, before delivery (the First Order Offer threshold basis).
  return { gross, discount, merchandise: gross - discount, shipping, total, received, due: Math.max(0, total - received), units: b.items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0) };
}
export function validate(b: Bill, requirePhone = false): string {
  if (!b.reference.trim()) return 'Enter a bill reference.';
  if (b.items.length === 0 || b.items.length > 50) return 'Add between 1 and 50 medicines.';
  if ((requirePhone || b.phone) && !/^[6-9]\d{9}$/.test(b.phone)) return 'Enter a valid 10-digit customer WhatsApp number.';
  for (const [index, item] of b.items.entries()) {
    if (!item.name.trim()) return `Enter the medicine name in row ${index + 1}.`;
    if (!/^\d+$/.test(item.qty) || Number(item.qty) < 1 || Number(item.qty) > 9999) return `Row ${index + 1}: quantity must be a whole number from 1 to 9,999.`;
    if (!validMoney(item.rate)) return `Row ${index + 1}: enter a non-negative rate with at most 2 decimal places.`;
  }
  if (!validMoney(b.discount)) return 'Enter a valid discount amount.';
  if (paise(b.discount) > totals(b).gross) return 'Discount cannot exceed the subtotal.';
  if (!validMoney(b.received)) return 'Enter a valid amount received.';
  if (paise(b.received) > totals(b).total) return 'Amount received cannot exceed the bill total.';
  return '';
}