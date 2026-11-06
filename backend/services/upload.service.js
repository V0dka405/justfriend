"use strict";

/**
 * Layer: Backend Service — Image & Payment Slip Upload Service
 * ตรวจ Magic Bytes ของรูปภาพ (JPG, PNG, WEBP) จำกัดขนาด 5 MB และบันทึกลงโฟลเดอร์ uploads ด้วยชื่อ UUID
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const slipRateMap = new Map();

// Periodic cleanup of expired slip rate entries (M-01)
setInterval(() => {
  const now = Date.now();
  const win = 10 * 60 * 1000;
  for (const [ip, cur] of slipRateMap.entries()) {
    if (now - cur.start > win) {
      slipRateMap.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

function detectImageExtension(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return ".jpg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return ".png";
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return ".webp";
  }

  return null;
}

function readRawBody(req, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) return;
      total += chunk.length;
      if (total > maxBytes) {
        aborted = true;
        const err = new Error("ไฟล์มีขนาดใหญ่เกินกำหนด (สูงสุด 5 MB)");
        err.statusCode = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (!aborted) {
        resolve(Buffer.concat(chunks));
      }
    });

    req.on("error", (err) => {
      if (!aborted) reject(err);
    });
  });
}

function checkSlipUploadLimit(ip) {
  const now = Date.now();
  const win = 10 * 60 * 1000;
  const cur = slipRateMap.get(ip);
  if (!cur || now - cur.start > win) {
    slipRateMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (cur.count >= 15) return false;
  cur.count += 1;
  return true;
}

async function saveUploadedImage(req, uploadsDir) {
  const buffer = await readRawBody(req, MAX_UPLOAD_BYTES);
  if (!buffer.length) {
    const err = new Error("ไม่พบข้อมูลไฟล์รูปภาพ");
    err.statusCode = 400;
    throw err;
  }

  const ext = detectImageExtension(buffer);
  if (!ext) {
    const err = new Error("รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP เท่านั้น");
    err.statusCode = 415;
    throw err;
  }

  fs.mkdirSync(uploadsDir, { recursive: true });
  const filename = `${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(uploadsDir, filename);
  fs.writeFileSync(fullPath, buffer);

  return `/uploads/${filename}`;
}

module.exports = {
  saveUploadedImage,
  checkSlipUploadLimit,
};
