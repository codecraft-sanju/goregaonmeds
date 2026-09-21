export type SavedProfile = {
  name: string;
  phone: string;
  house: string;
  area: string;
  landmark: string;
  branch: number;
  payment: "cod" | "upi";
};

const TOKEN_KEY = "gm_customer_token";
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function readToken(): string | null {
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    return token && TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}

/** Returns an existing device token, or creates one. Null if storage is unavailable (e.g. blocked). */
function ensureToken(): string | null {
  const existing = readToken();
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    return window.localStorage.getItem(TOKEN_KEY) === token ? token : null;
  } catch {
    return null;
  }
}

function isSavedProfile(value: unknown, branchCount: number): value is SavedProfile {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    ["name", "phone", "house", "area", "landmark"].every((key) => typeof p[key] === "string") &&
    /^[6-9]\d{9}$/.test(p.phone as string) &&
    Number.isInteger(p.branch) &&
    (p.branch as number) >= 0 &&
    (p.branch as number) < branchCount &&
    (p.payment === "cod" || p.payment === "upi")
  );
}

export async function fetchSavedProfile(
  api: string,
  branchCount: number,
  signal: AbortSignal,
): Promise<SavedProfile | null> {
  const token = readToken();
  if (!api || !token) return null;
  const response = await fetch(`${api}/api/customer/profile`, {
    headers: { "X-Customer-Token": token },
    signal,
  });
  if (!response.ok) return null;
  const data: unknown = await response.json().catch(() => null);
  const profile = (data as { profile?: unknown } | null)?.profile;
  return isSavedProfile(profile, branchCount) ? profile : null;
}

/** Best effort: never throws, gives up after `timeoutMs` so checkout is never blocked. */
export async function saveProfile(api: string, profile: SavedProfile, timeoutMs = 2500): Promise<void> {
  const token = api ? ensureToken() : null;
  if (!token) return;
  try {
    await fetch(`${api}/api/customer/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Customer-Token": token },
      body: JSON.stringify(profile),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Saving details is a convenience; the order continues regardless.
  }
}

/** Deletes the server copy and the local token. Never throws. */
export async function forgetProfile(api: string, timeoutMs = 2500): Promise<void> {
  const token = readToken();
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable; nothing stored locally.
  }
  if (!api || !token) return;
  try {
    await fetch(`${api}/api/customer/profile`, {
      method: "DELETE",
      headers: { "X-Customer-Token": token },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // The server copy also expires 180 days after the last order.
  }
}