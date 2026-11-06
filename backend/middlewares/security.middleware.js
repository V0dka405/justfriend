"use strict";

/**
 * Layer: Backend Middleware — HTTP Security, Rate Limiters & Request/Response Helpers
 * จัดการ Security Headers (CSP), จำกัดอัตราการยิงคำขอ (Rate Limit), อ่าน JSON Body และบันทึก Audit Log
 */

const orderRateMap = new Map();
const trackRateMap = new Map();

// Periodic cleanup of expired rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, item] of orderRateMap.entries()) {
    if (now - item.start > 10 * 60 * 1000) {
      orderRateMap.delete(ip);
    }
  }
  for (const [ip, item] of trackRateMap.entries()) {
    if (now - item.start > 5 * 60 * 1000) {
      trackRateMap.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

function checkOrderRateLimit(ip) {
  const now = Date.now();
  const win = 10 * 60 * 1000;
  const cur = orderRateMap.get(ip);
  if (!cur || now - cur.start > win) {
    orderRateMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (cur.count >= 15) return false;
  cur.count += 1;
  return true;
}

function checkTrackRateLimit(ip) {
  const now = Date.now();
  const win = 5 * 60 * 1000;
  const cur = trackRateMap.get(ip);
  if (!cur || now - cur.start > win) {
    trackRateMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (cur.count >= 20) return false;
  cur.count += 1;
  return true;
}

function logSecurityAudit(event, details = {}) {
  const ts = new Date().toISOString();
  console.log(`[SECURITY AUDIT] ${ts} | [${event}]`, JSON.stringify(details));
}

function setSecurityHeaders(res, isHtml = false) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isHtml) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self';"
    );
  }
}

function sendJson(res, statusCode, data) {
  setSecurityHeaders(res, false);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) return;
      total += chunk.length;
      if (total > maxBytes) {
        aborted = true;
        const err = new Error("ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป");
        err.statusCode = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        const err = new Error("รูปแบบข้อมูล JSON ไม่ถูกต้อง");
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on("error", (err) => {
      if (!aborted) reject(err);
    });
  });
}

function getClientIp(req) {
  return req.socket?.remoteAddress || "unknown";
}

module.exports = {
  checkOrderRateLimit,
  checkTrackRateLimit,
  logSecurityAudit,
  setSecurityHeaders,
  sendJson,
  readJsonBody,
  getClientIp,
};
