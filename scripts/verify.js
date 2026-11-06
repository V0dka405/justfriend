"use strict";

/**
 * Team Verification Script — รันก่อน commit / push ทุกครั้ง
 * คำสั่ง: npm run verify
 *
 * ขั้นตอน:
 *   1. ตรวจ syntax ไฟล์ JavaScript ทั้งหมด (node --check)
 *   2. Build หน้าร้าน React ด้วย Vite
 *   3. รันชุดทดสอบ API แบบแยกฐานข้อมูลจำลอง (node --test)
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function step(label, fn) {
  const started = Date.now();
  process.stdout.write(`▶ ${label} ... `);
  try {
    fn();
    console.log(`OK (${Date.now() - started}ms)`);
    return true;
  } catch (err) {
    console.log("FAILED");
    console.error(String(err.stdout || err.message || err).trim());
    if (err.stderr) console.error(String(err.stderr).trim());
    return false;
  }
}

const results = [];

results.push(
  step("Syntax check (backend + server.js + tests + scripts)", () => {
    const files = [
      path.join(ROOT, "server.js"),
      ...listJsFiles(path.join(ROOT, "backend")),
      ...listJsFiles(path.join(ROOT, "tests")),
      ...listJsFiles(path.join(ROOT, "scripts")),
      path.join(ROOT, "frontend", "js", "admin.js"),
    ];
    for (const f of files) {
      execSync(`node --check "${f}"`, { cwd: ROOT, stdio: "pipe" });
    }
  })
);

results.push(
  step("Frontend build (vite)", () => {
    execSync("npx vite build --config frontend/vite.config.mjs --logLevel error", {
      cwd: ROOT,
      stdio: "pipe",
    });
  })
);

results.push(
  step("API test suite (node --test)", () => {
    execSync('node --test "tests/**/*.test.js"', { cwd: ROOT, stdio: "pipe" });
  })
);

const failed = results.filter((ok) => !ok).length;
console.log(
  failed === 0
    ? `\n✅ VERIFY PASSED — ${results.length}/${results.length} steps OK`
    : `\n❌ VERIFY FAILED — ${failed} step(s) failed`
);
process.exit(failed === 0 ? 0 : 1);
