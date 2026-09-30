const encoder = new TextEncoder();

export async function hmac(
  secret: string | Uint8Array,
  data: string | Uint8Array,
  hash: "SHA-256" | "SHA-1" = "SHA-256",
): Promise<Uint8Array> {
  const keyData = typeof secret === "string" ? encoder.encode(secret) : secret;
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    typeof data === "string" ? encoder.encode(data) : data,
  );
  return new Uint8Array(sig);
}

export const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const toBase64Url = (bytes: Uint8Array) =>
  toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Constant-time comparison for equal-length strings. */
export function safeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}
