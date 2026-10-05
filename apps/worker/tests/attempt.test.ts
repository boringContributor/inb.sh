import { describe, expect, test } from "vite-plus/test";
import { type RequestContext, evaluateConditions, referencesAttempt } from "@inb/shared";

const ctx = (attempt?: number): RequestContext => ({
  request: {
    id: "req_1",
    method: "POST",
    path: "/",
    url: "/",
    query: {},
    headers: {},
    body: null,
    rawBody: "",
    ip: null,
    country: null,
    attempt,
  },
  endpoint: { id: "ep_1", slug: "s", name: "n" },
  now: { iso8601: "", unix: 0, ms: 0 },
});

describe("request.attempt", () => {
  test("rules opt into counting via a condition or a respond body", () => {
    const respond = { type: "respond", status: 500, contentType: "text/plain", body: "" };
    expect(
      referencesAttempt({
        conditions: [{ field: "request.attempt", op: "lt", value: "3" }],
        actions: [],
      }),
    ).toBe(true);
    expect(
      referencesAttempt({ conditions: [{ field: " attempt", op: "is", value: "1" }], actions: [] }),
    ).toBe(true);
    expect(
      referencesAttempt({
        conditions: [],
        actions: [{ ...respond, body: '{"try": {{ request.attempt }}}' }],
      }),
    ).toBe(true);
    expect(
      referencesAttempt({
        conditions: [{ field: "method", op: "is", value: "POST" }],
        actions: [respond],
      }),
    ).toBe(false);
  });

  test("fail the first two tries, pass the third", () => {
    const failing = [{ field: "request.attempt", op: "lt" as const, value: "3" }];
    expect([1, 2, 3].map((n) => evaluateConditions(ctx(n), failing))).toEqual([true, true, false]);
  });
});
