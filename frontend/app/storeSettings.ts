//frontend/app/storeSettings.ts
/** Current delivery charge in paise, or null when the server is unreachable or returns bad data. */
export async function fetchDeliveryCharge(api: string, signal: AbortSignal): Promise<number | null> {
  if (!api) return null;
  const response = await fetch(`${api}/api/settings`, { signal, cache: "no-store" });
  if (!response.ok) return null;
  const data: unknown = await response.json().catch(() => null);
  const charge = (data as { deliveryCharge?: unknown } | null)?.deliveryCharge;
  return typeof charge === "number" && Number.isInteger(charge) && charge >= 0 ? charge : null;
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