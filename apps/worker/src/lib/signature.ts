import type { SigningConfig } from "@inb/shared";
import { hmac, safeEqual, toBase64, toHex } from "./crypto.ts";

const STRIPE_TOLERANCE_S = 300;

/**
 * Verify provider webhook signatures against the raw body. Returns `false`
 * for missing or malformed headers instead of throwing — a failed
 * verification is data we want to show, not an error.
 */
export async function verifySignature(
  signing: SigningConfig,
  headers: Headers,
  rawBody: Uint8Array,
  now = Date.now(),
): Promise<boolean> {
  const body = new TextDecoder().decode(rawBody);
  switch (signing.provider) {
    case "stripe": {
      const header = headers.get("stripe-signature");
      if (!header) return false;
      const parts = Object.fromEntries(
        header.split(",").map((p) => {
          const [k, ...v] = p.split("=");
          return [k!.trim(), v.join("=")];
        }),
      ) as Record<string, string>;
      const t = Number(parts.t);
      if (!t || Math.abs(now / 1000 - t) > STRIPE_TOLERANCE_S) return false;
      const expected = toHex(await hmac(signing.secret, `${t}.${body}`));
      const candidates = header
        .split(",")
        .filter((p) => p.trim().startsWith("v1="))
        .map((p) => p.trim().slice(3));
      return candidates.some((c) => safeEqual(c, expected));
    }
    case "github": {
      const header = headers.get("x-hub-signature-256");
      if (!header?.startsWith("sha256=")) return false;
      const expected = `sha256=${toHex(await hmac(signing.secret, rawBody))}`;
      return safeEqual(header, expected);
    }
    case "shopify": {
      const header = headers.get("x-shopify-hmac-sha256");
      if (!header) return false;
      return safeEqual(header, toBase64(await hmac(signing.secret, rawBody)));
    }
    case "slack": {
      const ts = headers.get("x-slack-request-timestamp");
      const header = headers.get("x-slack-signature");
      if (!ts || !header) return false;
      if (Math.abs(now / 1000 - Number(ts)) > STRIPE_TOLERANCE_S) return false;
      const expected = `v0=${toHex(await hmac(signing.secret, `v0:${ts}:${body}`))}`;
      return safeEqual(header, expected);
    }
    case "hmac-sha256": {
      const header = headers.get(signing.header || "x-signature");
      if (!header) return false;
      const digest = await hmac(signing.secret, rawBody);
      const value = header.replace(/^sha256=/, "");
      return safeEqual(value, toHex(digest)) || safeEqual(value, toBase64(digest));
    }
  }
}
