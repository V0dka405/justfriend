"use strict";

/**
 * Layer: Backend Config — Centralized Project Paths
 * รวมตำแหน่งโฟลเดอร์สำคัญของทั้งโปรเจกต์ไว้ที่เดียว เพื่อให้แต่ละ Layer เรียกใช้งานได้ง่ายและไม่หลง Path
 */

const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");

const PATHS = {
  ROOT_DIR,
  ENV_FILE: path.join(ROOT_DIR, ".env"),

  // Frontend Layer Directories (React Build + Admin Assets)
  FRONTEND_DIR: path.join(ROOT_DIR, "frontend"),
  FRONTEND_DIST_DIR: path.join(ROOT_DIR, "frontend", "dist"),
  FRONTEND_DIST_ASSETS_DIR: path.join(ROOT_DIR, "frontend", "dist", "assets"),
  FRONTEND_PAGES_DIR: path.join(ROOT_DIR, "frontend", "pages"),
  FRONTEND_CSS_DIR: path.join(ROOT_DIR, "frontend", "css"),
  FRONTEND_JS_DIR: path.join(ROOT_DIR, "frontend", "js"),
  FRONTEND_IMAGES_DIR: path.join(ROOT_DIR, "frontend", "assets", "images"),

  // Storage Directories
  DATA_DIR: path.join(ROOT_DIR, "data"),
  BACKUPS_DIR: path.join(ROOT_DIR, "data", "backups"),
  UPLOADS_DIR: path.join(ROOT_DIR, "uploads"),
};

module.exports = PATHS;
