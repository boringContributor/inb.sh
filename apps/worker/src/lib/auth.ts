import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { type Env, type HonoEnv, secret } from "../env.ts";
import { hmac, safeEqual, toBase64Url } from "./crypto.ts";

const COOKIE = "inb_session";
const MAX_AGE_S = 60 * 60 * 24 * 30;

function sessionKey(env: Env): string {
  const key = secret(env, "SessionSecret") ?? secret(env, "AdminPassword");
  if (!key) throw new Error("SessionSecret is not configured");
  return key;
}

async function sign(env: Env, payload: string): Promise<string> {
  return toBase64Url(await hmac(sessionKey(env), payload));
}

export async function issueSession(c: Context<HonoEnv>) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const payload = `admin.${exp}`;
  setCookie(c, COOKIE, `${payload}.${await sign(c.env, payload)}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export function clearSession(c: Context<HonoEnv>) {
  deleteCookie(c, COOKIE, { path: "/" });
}

async function validCookie(env: Env, value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [sub, exp, sig] = value.split(".");
  if (!sub || !exp || !sig) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await sign(env, `${sub}.${exp}`));
}

export function checkPassword(env: Env, password: string): boolean {
  const expected = secret(env, "AdminPassword");
  return !!expected && safeEqual(password, expected);
}

export async function isAuthenticated(c: Context<HonoEnv>): Promise<boolean> {
  if (c.env.DEV === "true" && !secret(c.env, "AdminPassword")) return true;
  if (await validCookie(c.env, getCookie(c, COOKIE))) return true;
  // CLI / automation: `Authorization: Bearer <admin password>`
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer ")) return checkPassword(c.env, auth.slice(7));
  return false;
}

export const requireAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!(await isAuthenticated(c))) return c.json({ error: "unauthorized" }, 401);
  await next();
};
