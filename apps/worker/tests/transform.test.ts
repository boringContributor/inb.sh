import { describe, expect, test } from "vite-plus/test";
import { runTransform, validateTransform } from "../src/lib/transform.ts";

const input = {
  method: "POST",
  path: "/hooks/stripe",
  query: {},
  headers: { "content-type": "application/json" },
  body: { id: "evt_1", type: "invoice.paid", data: { amount: 4900 }, customer_email: "jane@example.com" },
};

describe("runTransform", () => {
  test("merges headers and picks body fields (design example)", async () => {
    const out = await runTransform(
      `$merge([$, {"headers": $merge([headers, {"x-source": "inbound"}]), "body": $pick(body, "id", "type", "data")}])`,
      input,
    );
    expect(out.headers["x-source"]).toBe("inbound");
    expect(out.headers["content-type"]).toBe("application/json");
    expect(out.body).toEqual({ id: "evt_1", type: "invoice.paid", data: { amount: 4900 } });
    expect(out.method).toBe("POST");
  });

  test("a bare result replaces the body", async () => {
    const out = await runTransform(`{ "event": body.type }`, input);
    expect(out.body).toEqual({ event: "invoice.paid" });
    expect(out.headers).toEqual(input.headers);
  });

  test("$mask keeps the last four characters", async () => {
    const out = await runTransform(`{ "email": $mask(body.customer_email) }`, input);
    expect(out.body).toEqual({ email: `${"•".repeat(12)}.com` });
  });

  test("syntax errors are reported by validateTransform", () => {
    expect(validateTransform("{ broken")).toBeTruthy();
    expect(validateTransform("body.type")).toBeNull();
  });
});
