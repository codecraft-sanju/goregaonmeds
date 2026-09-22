export type FirstOrderOffer = { giftName: string; minSubtotal: number };
export type StoreSettings = { deliveryCharge: number | null; firstOrderOffer: FirstOrderOffer | null };

const isPaise = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

export function parseFirstOrderOffer(value: unknown): FirstOrderOffer | null {
  const offer = value as { giftName?: unknown; minSubtotal?: unknown } | null;
  return offer && typeof offer.giftName === "string" && offer.giftName.trim() && isPaise(offer.minSubtotal)
    ? { giftName: offer.giftName, minSubtotal: offer.minSubtotal }
    : null;
}

/** Public store settings, or null when the server is unreachable or returns bad data. */
export async function fetchStoreSettings(api: string, signal: AbortSignal): Promise<StoreSettings | null> {
  if (!api) return null;
  const response = await fetch(`${api}/api/settings`, { signal, cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { deliveryCharge?: unknown; firstOrderOffer?: unknown } | null;
  if (!data) return null;
  return {
    deliveryCharge: isPaise(data.deliveryCharge) ? data.deliveryCharge : null,
    firstOrderOffer: parseFirstOrderOffer(data.firstOrderOffer),
  };
}

/** Current delivery charge in paise, or null when the server is unreachable or returns bad data. */
export async function fetchDeliveryCharge(api: string, signal: AbortSignal): Promise<number | null> {
  return (await fetchStoreSettings(api, signal))?.deliveryCharge ?? null;
}

/** ₹40 for whole rupees, ₹40.50 otherwise. */
export function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export const firstOrderOfferText = (offer: FirstOrderOffer) =>
  `First Order Offer 🎁 Spend ${formatRupees(offer.minSubtotal)}+ and get a ${offer.giftName} FREE.`;

export const freeGiftLabel = (name: string) => `${name} — FREE (₹0)`;