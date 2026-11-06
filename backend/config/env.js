"use strict";

/**
 * Layer: Backend Config — Environment Loader
 * โหลดตัวแปรสภาพแวดล้อมจากไฟล์ .env โดยไม่พึ่งพาไลบรารีภายนอก
 */

const fs = require("node:fs");
const { ENV_FILE } = require("./paths");

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;

  try {
    const content = fs.readFileSync(ENV_FILE, "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        let v = trimmed.slice(eqIdx + 1).trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (process.env[k] === undefined) {
          process.env[k] = v;
        }
      }
    }
  } catch (err) {
    console.warn("[ENV WARNING] Failed to read .env file:", err.message);
  }
}

loadEnv();

const CONFIG = {
  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || "0.0.0.0",
  DATABASE_URL: (process.env.DATABASE_URL || "").trim(),
  NODE_ENV: process.env.NODE_ENV || "development",
};

module.exports = { loadEnv, CONFIG };
