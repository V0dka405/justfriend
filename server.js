"use strict";

/**
 * Entry Point — เริ่มต้นระบบเซิร์ฟเวอร์และจัดการ Graceful Shutdown
 * คำสั่งรัน: `node server.js` หรือ `npm start`
 */

const { CONFIG } = require("./backend/config/env");
const storeDb = require("./backend/database");
const { server } = require("./backend/app");

function gracefulShutdown(signal) {
  console.log(`[SERVER] Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    console.log("[SERVER] HTTP server closed.");
    try {
      await storeDb.closeDatabaseCleanly();
    } catch {}
    process.exit(0);
  });
  setTimeout(async () => {
    console.error("[SERVER] Graceful shutdown timed out, force closing.");
    try {
      await storeDb.closeDatabaseCleanly();
    } catch {}
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

if (require.main === module) {
  server.listen(CONFIG.PORT, CONFIG.HOST, () => {
    console.log(`8-Bit Game Top-Up Store running at http://localhost:${CONFIG.PORT}`);
    console.log(`Admin Control Room running at http://localhost:${CONFIG.PORT}/admin`);
  });
}

module.exports = { server, gracefulShutdown };
