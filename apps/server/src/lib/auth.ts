import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export interface TokenPayload {
  sub: string;
  exp: number;
}

/** Compact HMAC-SHA256 signed token (JWT-compatible header). */
export function signToken(userId: string, secret: string, ttlSeconds = 60 * 60 * 24 * 30): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString()) as TokenPayload;
    if (typeof payload.sub !== "string" || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
