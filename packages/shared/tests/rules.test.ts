import { describe, expect, test } from "vite-plus/test";
import {
  type RequestContext,
  describeConditions,
  evaluateCondition,
  evaluateConditions,
  nowContext,
  renderTemplate,
  resolvePath,
  summarizeRequest,
} from "../src/index.ts";

const ctx = (overrides: Partial<RequestContext["request"]> = {}, status?: number): RequestContext => ({
  request: {
    id: "req_1",
    method: "POST",
    path: "/hooks/stripe",
    url: "https://inb.sh/abcd/hooks/stripe",
    query: { page: "2" },
    headers: { "stripe-signature": "t=1,v1=abc", "content-type": "application/json" },
    body: { type: "invoice.paid", data: { object: { id: "in_1", items: [{ sku: "a" }] } }, livemode: false },
    rawBody: "{}",
    ip: "1.2.3.4",
    country: "DE",
    ...overrides,
  },
  response: status ? { status } : undefined,
  endpoint: { id: "ep_1", slug: "abcd", name: "Stripe" },
  now: nowContext(new Date("2026-09-30T12:04:03Z")),
});

describe("resolvePath", () => {
  test("relative paths resolve against the request", () => {
    expect(resolvePath(ctx(), "method")).toBe("POST");
    expect(resolvePath(ctx(), "body.data.object.id")).toBe("in_1");
    expect(resolvePath(ctx(), "body.data.object.items[0].sku")).toBe("a");
  });
  test("headers are case-insensitive and may be written as `header x`", () => {
    expect(resolvePath(ctx(), "headers.Stripe-Signature")).toBe("t=1,v1=abc");
    expect(resolvePath(ctx(), "header stripe-signature")).toBe("t=1,v1=abc");
    expect(resolvePath(ctx(), "request.headers.content-type")).toBe("application/json");
  });
  test("rooted paths", () => {
    expect(resolvePath(ctx({}, 502), "response.status")).toBe(502);
    expect(resolvePath(ctx(), "now.iso8601")).toBe("2026-09-30T12:04:03.000Z");
    expect(resolvePath(ctx(), "endpoint.slug")).toBe("abcd");
  });
  test("missing paths are undefined", () => {
    expect(resolvePath(ctx(), "body.nope.deeper")).toBeUndefined();
  });
});

describe("conditions", () => {
  test("design examples", () => {
    expect(
      evaluateConditions(ctx(), [
        { field: "method", op: "is", value: "POST" },
        { field: "body.type", op: "starts_with", value: '"invoice."' },
      ]),
    ).toBe(true);
    expect(evaluateConditions(ctx({ headers: {} }), [{ field: "header stripe-signature", op: "missing", value: "" }])).toBe(true);
    expect(evaluateConditions(ctx({}, 503), [{ field: "response.status", op: "is", value: "5xx" }])).toBe(true);
    expect(evaluateConditions(ctx({}, 200), [{ field: "response.status", op: "is", value: "5xx" }])).toBe(false);
    expect(evaluateConditions(ctx(), [{ field: "body.livemode", op: "is", value: "false" }])).toBe(true);
  });
  test("method comparison ignores case", () => {
    expect(evaluateCondition(ctx(), { field: "method", op: "is", value: "post" }).passed).toBe(true);
  });
  test("invalid regex never matches", () => {
    expect(evaluateCondition(ctx(), { field: "path", op: "matches", value: "([" }).passed).toBe(false);
  });
  test("numeric comparisons", () => {
    expect(evaluateCondition(ctx({}, 404), { field: "response.status", op: "gt", value: "399" }).passed).toBe(true);
  });
  test("description", () => {
    expect(describeConditions([])).toBe("every request");
    expect(describeConditions([{ field: "header stripe-signature", op: "missing", value: "" }])).toBe(
      "header stripe-signature is missing",
    );
  });
});

describe("templates", () => {
  test("interpolates tokens", () => {
    expect(renderTemplate("id={{ request.id }} at {{now.iso8601}}", ctx())).toBe("id=req_1 at 2026-09-30T12:04:03.000Z");
  });
  test("json-aware rendering escapes strings and inlines objects", () => {
    const out = renderTemplate('{"event": "{{ request.body.type }}", "data": "{{ request.body.data }}"}', ctx(), true);
    expect(JSON.parse(out)).toEqual({ event: "invoice.paid", data: { object: { id: "in_1", items: [{ sku: "a" }] } } });
    const quoted = renderTemplate('{"x": "{{ request.body.type }}"}', ctx({ body: { type: 'a"b' } }), true);
    expect(JSON.parse(quoted)).toEqual({ x: 'a"b' });
  });
  test("unknown tokens render empty", () => {
    expect(renderTemplate("[{{ request.body.nope }}]", ctx())).toBe("[]");
  });
});

describe("summarizeRequest", () => {
  test("prefers webhook event names", () => {
    expect(summarizeRequest({ method: "POST", path: "/", headers: {}, body: { type: "charge.succeeded" } })).toBe("charge.succeeded");
    expect(
      summarizeRequest({ method: "POST", path: "/", headers: { "x-github-event": "push" }, body: { ref: "main" } }),
    ).toBe("push");
    expect(
      summarizeRequest({ method: "POST", path: "/", headers: { "x-github-event": "pull_request" }, body: { action: "opened" } }),
    ).toBe("pull_request.opened");
  });
  test("falls back to method and path", () => {
    expect(summarizeRequest({ method: "GET", path: "/health", headers: {}, body: null })).toBe("health check");
    expect(summarizeRequest({ method: "DELETE", path: "/v1/hook", headers: {}, body: null })).toBe("delete /v1/hook");
  });
});
