"use strict";

/**
 * Layer: Backend Routes — Admin Dashboard API
 * เส้นทาง API สำหรับแอดมิน (เข้าสู่ระบบ, จัดการเกม/แพ็กเกจ/ส่วนลด, ตรวจสลิปออเดอร์, ตั้งค่าร้าน, สำรองฐานข้อมูล)
 */

const storeDb = require("../database");
const auth = require("../middlewares/auth.middleware");
const {
  logSecurityAudit,
  sendJson,
  readJsonBody,
  getClientIp,
} = require("../middlewares/security.middleware");
const { saveUploadedImage } = require("../services/upload.service");
const topupService = require("../services/topup.service");
const { UPLOADS_DIR } = require("../config/paths");

async function handleAdminRoutes(req, res, pathname) {
  if (!pathname.startsWith("/api/admin")) {
    return false;
  }

  const method = req.method || "GET";

  // 1. Admin Session Check
  if (method === "GET" && pathname === "/api/admin/me") {
    const cookies = auth.parseCookies(req);
    const admin = await storeDb.getAdminByToken(cookies[auth.SESSION_COOKIE_NAME]);
    if (!admin) {
      sendJson(res, 200, { authenticated: false });
      return true;
    }
    sendJson(res, 200, { authenticated: true, admin });
    return true;
  }

  // 2. Admin Login (A07, M-02, M-05)
  if (method === "POST" && pathname === "/api/admin/login") {
    auth.enforceCsrf(req);
    const ip = getClientIp(req);
    const limit = auth.checkLoginRateLimit(ip);
    if (!limit.allowed) {
      logSecurityAudit("LOGIN_LOCKED", { ip, retryAfterSec: limit.retryAfterSec });
      sendJson(res, 429, {
        error: `กรอกรหัสผิดเกินกำหนด กรุณารออีก ${limit.retryAfterSec} วินาที`,
      });
      return true;
    }

    const body = await readJsonBody(req);
    const result = await storeDb.loginAdmin(body.username, body.password);
    if (!result) {
      auth.recordFailedLogin(ip);
      logSecurityAudit("LOGIN_FAILED", { ip, username: String(body.username || "").slice(0, 50) });
      sendJson(res, 401, { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
      return true;
    }

    auth.clearFailedLogins(ip);
    auth.setSessionCookie(res, result.rawToken, req);
    logSecurityAudit("LOGIN_SUCCESS", { ip, adminId: result.admin.id, username: result.admin.username });
    sendJson(res, 200, { authenticated: true, admin: result.admin });
    return true;
  }

  // 3. Admin Logout
  if (method === "POST" && pathname === "/api/admin/logout") {
    auth.enforceCsrf(req);
    const cookies = auth.parseCookies(req);
    await storeDb.logoutSession(cookies[auth.SESSION_COOKIE_NAME]);
    auth.clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // --- Protected Admin Endpoints (ต้องผ่านการยืนยันตัวตนแอดมินทั้งหมด) ---
  const { admin } = await auth.requireAdmin(req, storeDb);

  if (method === "GET" && pathname === "/api/admin/overview") {
    sendJson(res, 200, {
      admin,
      stats: await storeDb.getAdminStats(),
      settings: await storeDb.getSettings(),
      games: await storeDb.listAdminGamesWithPackages(),
      orders: await storeDb.listAdminOrders(),
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/admin/upload") {
    auth.enforceCsrf(req);
    const url = await saveUploadedImage(req, UPLOADS_DIR);
    sendJson(res, 201, { url });
    return true;
  }

  // Games CRUD
  if (method === "POST" && pathname === "/api/admin/games") {
    auth.enforceCsrf(req);
    const body = await readJsonBody(req);
    const game = await storeDb.createGame(body);
    if (body.create_starter_packages) {
      await storeDb.createStarterPackagesForGame(game.id, game.currency_name, game.slug);
    }
    const fullGame = await storeDb.getGameById(game.id);
    sendJson(res, 201, { game: fullGame });
    return true;
  }

  const gameMatch = pathname.match(/^\/api\/admin\/games\/(\d+)$/);
  if (gameMatch) {
    const id = Number(gameMatch[1]);
    if (method === "PUT") {
      auth.enforceCsrf(req);
      const body = await readJsonBody(req);
      const game = await storeDb.updateGame(id, body);
      sendJson(res, 200, { game });
      return true;
    }
    if (method === "DELETE") {
      auth.enforceCsrf(req);
      const result = await storeDb.deleteGame(id);
      sendJson(res, 200, result);
      return true;
    }
  }

  // Apply Game Discount %
  const gameDiscountMatch = pathname.match(/^\/api\/admin\/games\/(\d+)\/discount$/);
  if (gameDiscountMatch && method === "POST") {
    auth.enforceCsrf(req);
    const id = Number(gameDiscountMatch[1]);
    const body = await readJsonBody(req);
    const updatedGame = await storeDb.applyGameDiscount(id, body.percent);
    sendJson(res, 200, { game: updatedGame });
    return true;
  }

  // Apply Storewide Discount %
  if (pathname === "/api/admin/store/discount" && method === "POST") {
    auth.enforceCsrf(req);
    const body = await readJsonBody(req);
    const games = await storeDb.applyStorewideDiscount(body.percent);
    sendJson(res, 200, { games });
    return true;
  }

  // Batch Update Packages
  if (pathname === "/api/admin/packages/batch" && method === "PUT") {
    auth.enforceCsrf(req);
    const body = await readJsonBody(req);
    const games = await storeDb.batchUpdatePackages(body.packages);
    sendJson(res, 200, { games });
    return true;
  }

  // Packages CRUD
  if (method === "POST" && pathname === "/api/admin/packages") {
    auth.enforceCsrf(req);
    const body = await readJsonBody(req);
    const pkg = await storeDb.createPackage(body);
    sendJson(res, 201, { package: pkg });
    return true;
  }

  const pkgMatch = pathname.match(/^\/api\/admin\/packages\/(\d+)$/);
  if (pkgMatch) {
    const id = Number(pkgMatch[1]);
    if (method === "PUT") {
      auth.enforceCsrf(req);
      const body = await readJsonBody(req);
      const pkg = await storeDb.updatePackage(id, body);
      sendJson(res, 200, { package: pkg });
      return true;
    }
    if (method === "DELETE") {
      auth.enforceCsrf(req);
      const result = await storeDb.deletePackage(id);
      sendJson(res, 200, result);
      return true;
    }
  }

  // Orders Status & Admin Note Update
  const orderMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
  if (orderMatch && method === "PUT") {
    auth.enforceCsrf(req);
    const id = Number(orderMatch[1]);
    const body = await readJsonBody(req);
    const order = await storeDb.updateAdminOrder(id, body);
    if (order.status === "completed" && !order._wasAlreadyCompleted) {
      topupService.processTopupOrder(order).catch((err) => {
        console.error("[TOPUP PROVIDER HOOK]", err.message);
      });
    }
    sendJson(res, 200, { order });
    return true;
  }

  // Top-Up Provider Status (Auto API / Manual Mode)
  if (method === "GET" && pathname === "/api/admin/topup-provider") {
    sendJson(res, 200, topupService.getProviderStatus());
    return true;
  }

  // Store Settings & Password (M-05)
  if (method === "PUT" && pathname === "/api/admin/settings") {
    auth.enforceCsrf(req);
    const body = await readJsonBody(req);
    const settings = await storeDb.updateSettings(body);
    logSecurityAudit("SETTINGS_UPDATED", {
      adminId: admin.id,
      promptpayIdMasked: body.promptpay_id ? "SET_OR_UPDATED" : "UNCHANGED",
      promptpayName: body.promptpay_name,
      promptpayQrUrl: body.promptpay_qr_url,
    });
    sendJson(res, 200, { settings });
    return true;
  }

  if (method === "POST" && pathname === "/api/admin/password") {
    auth.enforceCsrf(req);
    const body = await readJsonBody(req);
    const freshToken = await storeDb.changeAdminPassword(
      admin.id,
      body.current_password,
      body.new_password
    );
    auth.setSessionCookie(res, freshToken, req);
    logSecurityAudit("PASSWORD_CHANGED", { adminId: admin.id });
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Database Resilience, Health & Hot Backup Endpoints
  if (method === "GET" && pathname === "/api/admin/database/health") {
    sendJson(res, 200, await storeDb.getDatabaseHealth());
    return true;
  }

  if (method === "POST" && pathname === "/api/admin/database/backup") {
    auth.enforceCsrf(req);
    const backup = await storeDb.createDatabaseBackup("manual_admin");
    logSecurityAudit("DATABASE_BACKUP_CREATED", {
      filename: backup.filename,
      size: backup.sizeBytes,
    });
    sendJson(res, 201, { backup, health: await storeDb.getDatabaseHealth() });
    return true;
  }

  if (method === "POST" && pathname === "/api/admin/database/checkpoint") {
    auth.enforceCsrf(req);
    await storeDb.checkpointWal();
    logSecurityAudit("DATABASE_WAL_CHECKPOINT", {});
    sendJson(res, 200, { ok: true, health: await storeDb.getDatabaseHealth() });
    return true;
  }

  return false;
}

module.exports = { handleAdminRoutes };
