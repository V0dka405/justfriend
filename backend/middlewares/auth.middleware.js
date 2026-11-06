"use strict";

/**
 * Layer: Backend Middleware — Authentication & Session Security
 * จัดการการเข้ารหัสรหัสผ่าน (Scrypt), คุกกี้เซสชันแอดมิน, ป้องกัน Brute-Force Login และตรวจ CSRF
 */

const crypto = require("node:crypto");

const SESSION_COOKIE_NAME = "pixel_admin_sid";
const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

// Brute-force login rate limiter (max 8 failed attempts per 10 minutes per IP)
const loginAttempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

// Periodic cleanup of expired rate limit entries to prevent unbounded memory growth (M-01)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts.entries()) {
    if (now - entry.firstAt > WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const passStr = String(password || "");
  if (passStr.length > 128) {
    const err = new Error("รหัสผ่านต้องมีความยาวไม่เกิน 128 ตัวอักษร");
    err.statusCode = 400;
    throw err;
  }
  const hash = crypto.scryptSync(passStr, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (typeof password !== "string" || password.length === 0 || password.length > 128) {
    return false;
  }
  if (!salt || !expectedHash) return false;
  const computed = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

function generateSessionToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString();
  return { raw, tokenHash, expiresAt };
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  });
  return out;
}

function setSessionCookie(res, rawToken, req = null) {
  const isHttps = Boolean(
    process.env.NODE_ENV === "production" ||
      (req && (req.headers["x-forwarded-proto"] === "https" || req.socket?.encrypted))
  );
  const secureFlag = isHttps ? "; Secure" : "";
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(
    rawToken
  )}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SEC}; SameSite=Strict${secureFlag}`;
  res.setHeader("Set-Cookie", cookie);
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`
  );
}

function hasValidCsrfHeader(req) {
  return req.headers["x-requested-with"] === "XMLHttpRequest";
}

function enforceCsrf(req) {
  if (!hasValidCsrfHeader(req)) {
    const err = new Error("คำขอไม่ผ่านการตรวจสอบความปลอดภัย (CSRF)");
    err.statusCode = 403;
    throw err;
  }
}

async function requireAdmin(req, storeDb) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  const admin = await storeDb.getAdminByToken(token);
  if (!admin) {
    const err = new Error("กรุณาเข้าสู่ระบบแอดมินก่อนดำเนินการ");
    err.statusCode = 401;
    throw err;
  }
  return { admin, token };
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return { allowed: true };
  if (now - entry.firstAt > WINDOW_MS) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - entry.firstAt)) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

function clearFailedLogins(ip) {
  loginAttempts.delete(ip);
}

module.exports = {
  SESSION_COOKIE_NAME,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  hasValidCsrfHeader,
  enforceCsrf,
  requireAdmin,
  checkLoginRateLimit,
  recordFailedLogin,
  clearFailedLogins,
};
