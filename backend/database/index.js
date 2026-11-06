"use strict";

/**
 * Layer: Backend Database — Dual-Engine Dispatcher
 * สลับการทำงานอัตโนมัติระหว่าง Cloud PostgreSQL (เมื่อตั้งค่า DATABASE_URL) และ SQLite WAL Mode
 */

const { CONFIG } = require("../config/env");

let activeDb;
const rawDbUrl = CONFIG.DATABASE_URL;

if (rawDbUrl && (rawDbUrl.startsWith("postgres://") || rawDbUrl.startsWith("postgresql://"))) {
  console.log("[DATABASE ENGINE] Detected DATABASE_URL. Connecting to PostgreSQL Database...");
  activeDb = require("./postgres");
} else {
  console.log("[DATABASE ENGINE] DATABASE_URL not set. Running on High-Durability SQLite WAL Engine.");
  activeDb = require("./sqlite");
}

module.exports = activeDb;
