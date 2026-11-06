"use strict";

/**
 * Layer: Backend Routes — Public Storefront API
 * เส้นทาง API สำหรับหน้าร้านลูกค้า (ดึงข้อมูลเกม/แพ็กเกจ, อัปโหลดสลิป, สั่งซื้อ, เช็คสถานะออเดอร์)
 */

const storeDb = require("../database");
const { enforceCsrf } = require("../middlewares/auth.middleware");
const {
  checkOrderRateLimit,
  checkTrackRateLimit,
  logSecurityAudit,
  sendJson,
  readJsonBody,
  getClientIp,
} = require("../middlewares/security.middleware");
const { saveUploadedImage, checkSlipUploadLimit } = require("../services/upload.service");
const { UPLOADS_DIR } = require("../config/paths");

async function handlePublicRoutes(req, res, pathname) {
  const method = req.method || "GET";

  // 1. Public Storefront Data (Games + Active Packages + Settings)
  if (method === "GET" && pathname === "/api/storefront") {
    const settings = await storeDb.getSettings();
    const games = await storeDb.listPublicGamesWithPackages();
    sendJson(res, 200, { settings, games });
    return true;
  }

  // 2. Public Payment Slip Upload
  if (method === "POST" && pathname === "/api/upload-slip") {
    enforceCsrf(req);
    const ip = getClientIp(req);
    if (!checkSlipUploadLimit(ip)) {
      logSecurityAudit("SLIP_UPLOAD_RATE_LIMIT", { ip });
      sendJson(res, 429, { error: "อัปโหลดบ่อยเกินไป กรุณารอสักครู่" });
      return true;
    }
    const url = await saveUploadedImage(req, UPLOADS_DIR);
    sendJson(res, 201, { url });
    return true;
  }

  // 3. Create Top-Up Order (H-01, M-01)
  if (method === "POST" && pathname === "/api/orders") {
    enforceCsrf(req);
    const ip = getClientIp(req);
    if (!checkOrderRateLimit(ip)) {
      logSecurityAudit("ORDER_RATE_LIMIT_EXCEEDED", { ip });
      sendJson(res, 429, { error: "สร้างคำสั่งซื้อบ่อยเกินไป กรุณารอ 10 นาที" });
      return true;
    }
    const body = await readJsonBody(req);
    const order = await storeDb.createTopupOrder(body);
    logSecurityAudit("ORDER_CREATED", {
      ip,
      orderCode: order.order_code,
      packageId: body.package_id,
      amount: order.amount,
    });
    sendJson(res, 201, { order });
    return true;
  }

  // 4. Track Top-Up Order (H-02)
  if (method === "POST" && pathname === "/api/orders/track") {
    enforceCsrf(req);
    const ip = getClientIp(req);
    if (!checkTrackRateLimit(ip)) {
      logSecurityAudit("TRACK_RATE_LIMIT_EXCEEDED", { ip });
      sendJson(res, 429, { error: "ตรวจสอบสถานะออเดอร์บ่อยเกินไป กรุณารอสักครู่" });
      return true;
    }
    const body = await readJsonBody(req);
    const order = await storeDb.trackPublicOrder(body.order_code, body.phone_last4);
    sendJson(res, 200, { order });
    return true;
  }

  return false;
}

module.exports = { handlePublicRoutes };
