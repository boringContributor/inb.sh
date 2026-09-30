import { describe, expect, test } from "vite-plus/test";
import { verifySignature } from "../src/lib/signature.ts";
import { hmac, toBase64, toHex } from "../src/lib/crypto.ts";

const body = new TextEncoder().encode('{"id":"evt_1"}');
const secret = "whsec_test";

describe("verifySignature", () => {
  test("stripe: accepts a valid v1 signature within tolerance", async () => {
    const t = 1_727_712_043;
    const sig = toHex(await hmac(secret, `${t}.{"id":"evt_1"}`));
    const headers = new Headers({ "stripe-signature": `t=${t},v1=${sig}` });
    expect(await verifySignature({ provider: "stripe", secret }, headers, body, t * 1000)).toBe(
      true,
    );
    expect(
      await verifySignature({ provider: "stripe", secret }, headers, body, (t + 3600) * 1000),
    ).toBe(false);
    expect(
      await verifySignature({ provider: "stripe", secret: "other" }, headers, body, t * 1000),
    ).toBe(false);
  });

  test("github: sha256 hex", async () => {
    const headers = new Headers({
      "x-hub-signature-256": `sha256=${toHex(await hmac(secret, body))}`,
    });
    expect(await verifySignature({ provider: "github", secret }, headers, body)).toBe(true);
    expect(await verifySignature({ provider: "github", secret }, new Headers(), body)).toBe(false);
  });

  test("shopify: base64", async () => {
    const headers = new Headers({ "x-shopify-hmac-sha256": toBase64(await hmac(secret, body)) });
    expect(await verifySignature({ provider: "shopify", secret }, headers, body)).toBe(true);
  });

  test("generic hmac accepts hex or base64 in a custom header", async () => {
    const digest = await hmac(secret, body);
    const hex = new Headers({ "x-sig": `sha256=${toHex(digest)}` });
    const b64 = new Headers({ "x-sig": toBase64(digest) });
    expect(
      await verifySignature({ provider: "hmac-sha256", secret, header: "x-sig" }, hex, body),
    ).toBe(true);
    expect(
      await verifySignature({ provider: "hmac-sha256", secret, header: "x-sig" }, b64, body),
    ).toBe(true);
  });
});
