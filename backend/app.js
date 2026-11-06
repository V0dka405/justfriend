"use strict";

/**
 * Layer: Backend Core — HTTP Application & Frontend Static Asset Router
 * เชื่อมต่อ API Routes ทั้งหมด และเสิร์ฟไฟล์จากชั้น Frontend อย่างปลอดภัย (ป้องกัน Path Traversal)
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PATHS = require("./config/paths");
const { setSecurityHeaders, sendJson } = require("./middlewares/security.middleware");
const { handlePublicRoutes } = require("./routes/public.routes");
const { handleAdminRoutes } = require("./routes/admin.routes");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveFile(res, filePath, isUpload = false) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      setSecurityHeaders(res, false);
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const isHtml = ext === ".html";
    setSecurityHeaders(res, isHtml);
    if (isUpload) {
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    }
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": isUpload ? "public, max-age=86400" : "no-cache",
    });
    res.end(data);
  });
}

function serveSafeSubPath(res, baseDir, subPath) {
  const cleanRel = subPath.replace(/^\/+/, "");
  const target = path.resolve(baseDir, cleanRel);
  const relCheck = path.relative(baseDir, target);

  if (!cleanRel || relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
    setSecurityHeaders(res, false);
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  serveFile(res, target, false);
}

const server = http.createServer(async (req, res) => {
  try {
    let pathname = "/";
    try {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      pathname = decodeURIComponent(parsedUrl.pathname);
    } catch {
      return sendJson(res, 400, { error: "URL ไม่ถูกต้อง (Bad Request)" });
    }

    // 1. Backend API Layer (/api/*)
    if (pathname.startsWith("/api/")) {
      const handledPublic = await handlePublicRoutes(req, res, pathname);
      if (handledPublic) return;

      const handledAdmin = await handleAdminRoutes(req, res, pathname);
      if (handledAdmin) return;

      return sendJson(res, 404, { error: "ไม่พบ API ที่ร้องขอ" });
    }

    // 2. Uploaded Payment Slips & Custom Covers (/uploads/*)
    if (pathname.startsWith("/uploads/")) {
      const rel = pathname.slice("/uploads/".length);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i.test(rel)) {
        setSecurityHeaders(res, false);
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }
      const target = path.resolve(PATHS.UPLOADS_DIR, rel);
      serveFile(res, target, true);
      return;
    }

    // 3. Frontend Layer — React Storefront (Built via Vite) & Admin Dashboard
    if (pathname === "/" || pathname === "/index.html") {
      serveFile(res, path.join(PATHS.FRONTEND_DIST_DIR, "index.html"));
      return;
    }

    if (pathname.startsWith("/assets/")) {
      serveSafeSubPath(res, PATHS.FRONTEND_DIST_ASSETS_DIR, pathname.slice("/assets/".length));
      return;
    }

    if (pathname === "/admin" || pathname === "/admin/" || pathname === "/admin.html") {
      serveFile(res, path.join(PATHS.FRONTEND_PAGES_DIR, "admin.html"));
      return;
    }

    // 4. Frontend Layer — Static Assets (/css/*, /js/*, /images/*)
    if (pathname.startsWith("/css/")) {
      serveSafeSubPath(res, PATHS.FRONTEND_CSS_DIR, pathname.slice("/css/".length));
      return;
    }

    if (pathname.startsWith("/js/")) {
      serveSafeSubPath(res, PATHS.FRONTEND_JS_DIR, pathname.slice("/js/".length));
      return;
    }

    if (pathname.startsWith("/images/")) {
      serveSafeSubPath(res, PATHS.FRONTEND_IMAGES_DIR, pathname.slice("/images/".length));
      return;
    }

    setSecurityHeaders(res, false);
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  } catch (err) {
    const status = err.statusCode || 500;
    const msg = status >= 500 ? "เกิดข้อผิดพลาดภายในระบบ" : err.message;
    if (status >= 500) {
      console.error("[Server Error]", err);
    }
    sendJson(res, status, { error: msg });
  }
});

module.exports = { server };
