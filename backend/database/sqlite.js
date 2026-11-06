"use strict";

/**
 * Layer: Backend Database — High-Durability SQLite WAL Adapter
 * จัดการฐานข้อมูล SQLite พร้อมโหมด WAL, ระบบกู้คืนอัตโนมัติ (Disaster Recovery) และ Hot Backup
 */

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
} = require("../middlewares/auth.middleware");
const { DATA_DIR, BACKUPS_DIR, UPLOADS_DIR } = require("../config/paths");
const {
  DEFAULT_SETTINGS,
  ALLOWED_SETTING_KEYS,
  VALID_ORDER_STATUSES,
  STARTER_GAMES,
  createHttpError,
  generateOrderCode,
  normalizeGameInput,
  mergeGameFields,
  normalizePackageInput,
  mergePackageFields,
  buildStarterPackagesForNewGame,
  computeDiscountedPackagePrice,
  validateAndNormalizeOrderInput,
  formatCreatedOrderResponse,
  parseTrackOrderLookup,
  verifyAndFormatTrackedOrder,
  attachOrderTransitionMeta,
} = require("./shared");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "store.db");

// ---------------------------------------------------------------------------
// Crash-Resilient Database Initialization & Disaster Recovery
// ---------------------------------------------------------------------------
function openDatabaseWithDisasterRecovery() {
  let targetDb = null;
  if (fs.existsSync(DB_PATH)) {
    try {
      targetDb = new DatabaseSync(DB_PATH);
      const row = targetDb.prepare("PRAGMA quick_check;").get();
      const status = row ? Object.values(row)[0] : "fail";
      if (status !== "ok") {
        throw new Error(`Integrity check failed: ${status}`);
      }
      return targetDb;
    } catch (err) {
      console.error("[CRITICAL DB CORRUPTION DETECTED]", err.message);
      if (targetDb) {
        try {
          targetDb.close();
        } catch {}
      }

      const corruptedFile = path.join(DATA_DIR, `corrupted_${Date.now()}.db`);
      try {
        fs.renameSync(DB_PATH, corruptedFile);
        try {
          fs.unlinkSync(`${DB_PATH}-wal`);
        } catch {}
        try {
          fs.unlinkSync(`${DB_PATH}-shm`);
        } catch {}
        console.warn(`[DISASTER RECOVERY] Corrupted database quarantined to: ${corruptedFile}`);
      } catch (renameErr) {
        console.error("[DISASTER RECOVERY] Failed to quarantine corrupted DB:", renameErr);
      }

      const backups = listDatabaseBackups();
      if (backups.length > 0) {
        const latestBackupPath = path.join(BACKUPS_DIR, backups[0].filename);
        console.log(`[DISASTER RECOVERY] Restoring database from backup: ${backups[0].filename}`);
        fs.copyFileSync(latestBackupPath, DB_PATH);
        const recoveredDb = new DatabaseSync(DB_PATH);
        console.log("[DISASTER RECOVERY] Database successfully restored from backup!");
        return recoveredDb;
      }

      console.warn("[DISASTER RECOVERY] No backup snapshots found. Initializing a clean database.");
      return new DatabaseSync(DB_PATH);
    }
  }

  return new DatabaseSync(DB_PATH);
}

const db = openDatabaseWithDisasterRecovery();

// High-Durability, Concurrency & Performance PRAGMAs
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 8000;");
db.exec("PRAGMA wal_autocheckpoint = 1000;");
db.exec("PRAGMA cache_size = -64000;");
db.exec("PRAGMA temp_store = MEMORY;");

// ---------------------------------------------------------------------------
// Schema Initialization & Seed Data
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS store_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    publisher TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'MOBA / FPS',
    currency_name TEXT NOT NULL DEFAULT 'คูปอง',
    uid_label TEXT NOT NULL DEFAULT 'UID ผู้เล่น',
    uid_placeholder TEXT NOT NULL DEFAULT 'กรอก UID ของคุณ...',
    uid_hint TEXT NOT NULL DEFAULT '',
    require_server INTEGER NOT NULL DEFAULT 0,
    server_options TEXT NOT NULL DEFAULT '',
    discount_badge TEXT NOT NULL DEFAULT '',
    accent_color TEXT NOT NULL DEFAULT '#ffd13b',
    icon_key TEXT NOT NULL DEFAULT 'gamepad',
    image_url TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    bonus_text TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL CHECK(price >= 0),
    full_price REAL NOT NULL DEFAULT 0 CHECK(full_price >= 0),
    badge TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE NOT NULL,
    game_id INTEGER,
    game_name TEXT NOT NULL,
    package_id INTEGER,
    package_sku TEXT NOT NULL,
    package_name TEXT NOT NULL,
    bonus_text TEXT NOT NULL DEFAULT '',
    player_uid TEXT NOT NULL,
    player_server TEXT NOT NULL DEFAULT '',
    player_ign TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL,
    customer_line TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL,
    payment_slip_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const insertSettingStmt = db.prepare(
  "INSERT OR IGNORE INTO store_settings (key, value) VALUES (?, ?)"
);
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  insertSettingStmt.run(k, v);
}

const adminCountRow = db.prepare("SELECT COUNT(*) AS cnt FROM admins").get();
if (!adminCountRow || adminCountRow.cnt === 0) {
  const initialPass = process.env.ADMIN_INITIAL_PASSWORD || "admin1234";
  if (!process.env.ADMIN_INITIAL_PASSWORD) {
    console.warn(
      "[SECURITY WARNING] ADMIN_INITIAL_PASSWORD is not set in environment. Using default password 'admin1234'. Please change it immediately via Admin Dashboard or set ADMIN_INITIAL_PASSWORD."
    );
  }
  const { salt, hash } = hashPassword(initialPass);
  db.prepare(
    "INSERT INTO admins (username, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?)"
  ).run("admin", salt, hash, new Date().toISOString());
}

const gameCountRow = db.prepare("SELECT COUNT(*) AS cnt FROM games").get();
if (!gameCountRow || gameCountRow.cnt === 0) {
  const now = new Date().toISOString();
  const insertGame = db.prepare(`
    INSERT INTO games (
      slug, name, publisher, category, currency_name, uid_label, uid_placeholder,
      uid_hint, require_server, server_options, discount_badge, accent_color,
      icon_key, image_url, sort_order, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const insertPkg = db.prepare(`
    INSERT INTO packages (
      game_id, sku, name, bonus_text, price, full_price, badge, sort_order, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  for (const g of STARTER_GAMES) {
    const info = insertGame.run(
      g.slug,
      g.name,
      g.publisher,
      g.category,
      g.currency_name,
      g.uid_label,
      g.uid_placeholder,
      g.uid_hint,
      g.require_server,
      g.server_options,
      g.discount_badge,
      g.accent_color,
      g.icon_key,
      g.image_url || "",
      g.sort_order,
      now,
      now
    );
    const gameId = Number(info.lastInsertRowid);
    for (const p of g.packages) {
      insertPkg.run(
        gameId,
        p.sku,
        p.name,
        p.bonus_text,
        p.price,
        p.full_price,
        p.badge,
        p.sort_order,
        now,
        now
      );
    }
  }
}

// เติมรูปปกมาตรฐานเฉพาะกรณีที่ยังไม่มีรูปปก (ไม่ทับรูปปกที่แอดมินอัปโหลดเอง)
const fillMissingCoverStmt = db.prepare(
  "UPDATE games SET image_url = ? WHERE slug = ? AND (image_url IS NULL OR image_url = '')"
);
for (const g of STARTER_GAMES) {
  if (g.image_url) {
    fillMissingCoverStmt.run(g.image_url, g.slug);
  }
}

// ---------------------------------------------------------------------------
// Settings Queries
// ---------------------------------------------------------------------------
function getSettings() {
  const rows = db.prepare("SELECT key, value FROM store_settings").all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    out[r.key] = r.value;
  }
  return out;
}

function updateSettings(patch) {
  const upsert = db.prepare(`
    INSERT INTO store_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [k, v] of Object.entries(patch || {})) {
      if (ALLOWED_SETTING_KEYS.has(k) && typeof v === "string") {
        upsert.run(k, v.trim().slice(0, 800));
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return getSettings();
}

// ---------------------------------------------------------------------------
// Games & Packages Queries
// ---------------------------------------------------------------------------
function listPublicGamesWithPackages() {
  const games = db
    .prepare(
      `SELECT id, slug, name, publisher, category, currency_name, uid_label,
              uid_placeholder, uid_hint, require_server, server_options,
              discount_badge, accent_color, icon_key, image_url, sort_order
       FROM games
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`
    )
    .all();

  const pkgStmt = db.prepare(
    `SELECT id, game_id, sku, name, bonus_text, price, full_price, badge, sort_order
     FROM packages
     WHERE game_id = ? AND is_active = 1
     ORDER BY sort_order ASC, price ASC, id ASC`
  );

  return games.map((g) => ({
    ...g,
    packages: pkgStmt.all(g.id),
  }));
}

function listAdminGamesWithPackages() {
  const games = db.prepare("SELECT * FROM games ORDER BY sort_order ASC, id ASC").all();
  const pkgStmt = db.prepare(
    "SELECT * FROM packages WHERE game_id = ? ORDER BY sort_order ASC, price ASC, id ASC"
  );
  return games.map((g) => ({
    ...g,
    packages: pkgStmt.all(g.id),
  }));
}

function getGameById(id) {
  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(Number(id));
  if (!game) return null;
  const packages = db
    .prepare("SELECT * FROM packages WHERE game_id = ? ORDER BY sort_order ASC, price ASC, id ASC")
    .all(game.id);
  return { ...game, packages };
}

function createGame(input) {
  const g = normalizeGameInput(input);
  const now = new Date().toISOString();
  try {
    const info = db
      .prepare(
        `INSERT INTO games (
          slug, name, publisher, category, currency_name, uid_label, uid_placeholder,
          uid_hint, require_server, server_options, discount_badge, accent_color,
          icon_key, image_url, sort_order, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        g.slug,
        g.name,
        g.publisher,
        g.category,
        g.currency_name,
        g.uid_label,
        g.uid_placeholder,
        g.uid_hint,
        g.require_server,
        g.server_options,
        g.discount_badge,
        g.accent_color,
        g.icon_key,
        g.image_url,
        g.sort_order,
        g.is_active,
        now,
        now
      );
    return getGameById(info.lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      throw createHttpError(409, `รหัสลิงก์เกม (Slug: ${g.slug}) ซ้ำกับเกมที่มีอยู่แล้ว`);
    }
    throw err;
  }
}

function updateGame(id, input) {
  const existing = db.prepare("SELECT * FROM games WHERE id = ?").get(Number(id));
  if (!existing) {
    throw createHttpError(404, "ไม่พบข้อมูลเกมที่ต้องการแก้ไข");
  }

  const g = mergeGameFields(existing, input);
  const now = new Date().toISOString();

  try {
    db.prepare(
      `UPDATE games
       SET slug = ?, name = ?, publisher = ?, category = ?, currency_name = ?,
           uid_label = ?, uid_placeholder = ?, uid_hint = ?, require_server = ?,
           server_options = ?, discount_badge = ?, accent_color = ?, icon_key = ?,
           image_url = ?, sort_order = ?, is_active = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      g.slug,
      g.name,
      g.publisher,
      g.category,
      g.currency_name,
      g.uid_label,
      g.uid_placeholder,
      g.uid_hint,
      g.require_server,
      g.server_options,
      g.discount_badge,
      g.accent_color,
      g.icon_key,
      g.image_url,
      g.sort_order,
      g.is_active,
      now,
      Number(id)
    );
    return getGameById(id);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      throw createHttpError(409, `รหัสลิงก์เกม (Slug: ${g.slug}) ซ้ำกับเกมอื่น`);
    }
    throw err;
  }
}

function deleteGame(id) {
  const info = db.prepare("DELETE FROM games WHERE id = ?").run(Number(id));
  if (!info.changes) {
    throw createHttpError(404, "ไม่พบเกมที่ต้องการลบ");
  }
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Package CRUD & Discounts
// ---------------------------------------------------------------------------
function getPackageById(id) {
  return db.prepare("SELECT * FROM packages WHERE id = ?").get(Number(id));
}

function ensureGameExists(gameId) {
  const game = db.prepare("SELECT id FROM games WHERE id = ?").get(Number(gameId));
  if (!game) {
    throw createHttpError(404, "ไม่พบเกมที่ระบุ");
  }
}

function createPackage(input) {
  const p = normalizePackageInput(input);
  ensureGameExists(p.game_id);
  const now = new Date().toISOString();

  try {
    const info = db
      .prepare(
        `INSERT INTO packages (
          game_id, sku, name, bonus_text, price, full_price, badge, sort_order, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        p.game_id,
        p.sku,
        p.name,
        p.bonus_text,
        p.price,
        p.full_price,
        p.badge,
        p.sort_order,
        p.is_active,
        now,
        now
      );
    return getPackageById(info.lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      throw createHttpError(409, `รหัสแพ็กเกจ (SKU: ${p.sku}) ซ้ำกับรายการอื่น`);
    }
    throw err;
  }
}

function createStarterPackagesForGame(gameId, currencyName = "คูปอง", slugPrefix = "GM") {
  const gId = Number(gameId);
  const now = new Date().toISOString();
  const starters = buildStarterPackagesForNewGame(currencyName, slugPrefix);

  const stmt = db.prepare(`
    INSERT INTO packages (
      game_id, sku, name, bonus_text, price, full_price, badge, sort_order, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  for (const p of starters) {
    try {
      stmt.run(gId, p.sku, p.name, p.bonus_text, p.price, p.full_price, p.badge, p.sort_order, now, now);
    } catch {
      const uniqueSku = `${p.sku}-${Date.now().toString().slice(-4)}`;
      stmt.run(gId, uniqueSku, p.name, p.bonus_text, p.price, p.full_price, p.badge, p.sort_order, now, now);
    }
  }
  return getGameById(gId);
}

function updatePackage(id, input) {
  const existing = getPackageById(id);
  if (!existing) {
    throw createHttpError(404, "ไม่พบแพ็กเกจที่ต้องการแก้ไข");
  }

  const p = mergePackageFields(existing, input);
  ensureGameExists(p.game_id);
  const now = new Date().toISOString();

  try {
    db.prepare(
      `UPDATE packages
       SET game_id = ?, sku = ?, name = ?, bonus_text = ?, price = ?,
           full_price = ?, badge = ?, sort_order = ?, is_active = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      p.game_id,
      p.sku,
      p.name,
      p.bonus_text,
      p.price,
      p.full_price,
      p.badge,
      p.sort_order,
      p.is_active,
      now,
      Number(id)
    );
    return getPackageById(id);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      throw createHttpError(409, `รหัสแพ็กเกจ (SKU: ${p.sku}) ซ้ำกับรายการอื่น`);
    }
    throw err;
  }
}

function deletePackage(id) {
  const info = db.prepare("DELETE FROM packages WHERE id = ?").run(Number(id));
  if (!info.changes) {
    throw createHttpError(404, "ไม่พบแพ็กเกจที่ต้องการลบ");
  }
  return { deleted: true };
}

function applyGameDiscount(gameId, percent) {
  const gId = Number(gameId);
  const pct = Math.max(0, Math.min(99, Math.round(Number(percent) || 0)));
  const game = getGameById(gId);
  if (!game) {
    throw createHttpError(404, "ไม่พบเกมที่ต้องการปรับลดราคา");
  }

  const pkgs = db.prepare("SELECT * FROM packages WHERE game_id = ?").all(gId);
  const now = new Date().toISOString();
  const updatePkgStmt = db.prepare(`
    UPDATE packages
    SET price = ?, full_price = ?, updated_at = ?
    WHERE id = ?
  `);

  db.exec("BEGIN TRANSACTION;");
  try {
    for (const p of pkgs) {
      const { newPrice, fullPrice } = computeDiscountedPackagePrice(p, pct);
      updatePkgStmt.run(newPrice, fullPrice, now, p.id);
    }

    const badgeText = pct > 0 ? `ลดสูงสุด ${pct}%` : "";
    db.prepare("UPDATE games SET discount_badge = ?, updated_at = ? WHERE id = ?").run(
      badgeText,
      now,
      gId
    );
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return getGameById(gId);
}

function applyStorewideDiscount(percent) {
  const pct = Math.max(0, Math.min(99, Math.round(Number(percent) || 0)));
  const games = db.prepare("SELECT id FROM games").all();
  for (const g of games) {
    applyGameDiscount(g.id, pct);
  }
  return listAdminGamesWithPackages();
}

function batchUpdatePackages(items) {
  if (!Array.isArray(items)) return [];
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE packages
    SET price = ?, full_price = ?, badge = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `);

  db.exec("BEGIN TRANSACTION;");
  try {
    for (const it of items) {
      const id = Number(it.id);
      if (!Number.isInteger(id) || id <= 0) continue;
      const existing = getPackageById(id);
      if (!existing) continue;

      const p = mergePackageFields(existing, it);
      stmt.run(p.price, p.full_price, p.badge, p.is_active, now, id);
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return listAdminGamesWithPackages();
}

// ---------------------------------------------------------------------------
// Top-Up Order Creation, Tracking & Fulfillment
// ---------------------------------------------------------------------------
function createTopupOrder(payload = {}) {
  const packageId = Number(payload.package_id);
  if (!Number.isInteger(packageId) || packageId <= 0) {
    throw createHttpError(400, "กรุณาเลือกแพ็กเกจที่ต้องการเติมก่อนกดยืนยัน");
  }

  const pkg = db
    .prepare("SELECT * FROM packages WHERE id = ? AND is_active = 1")
    .get(packageId);
  const game = pkg
    ? db.prepare("SELECT * FROM games WHERE id = ? AND is_active = 1").get(pkg.game_id)
    : null;

  const normalized = validateAndNormalizeOrderInput(payload, pkg, game, UPLOADS_DIR);

  const duplicateSlip = db
    .prepare("SELECT order_code FROM orders WHERE payment_slip_url = ?")
    .get(normalized.paymentSlipUrl);
  if (duplicateSlip) {
    throw createHttpError(409, "สลิปโอนเงินนี้ถูกใช้งานในระบบไปแล้ว กรุณาใช้สลิปรายการใหม่");
  }

  const now = new Date().toISOString();
  let orderCode = generateOrderCode();
  while (db.prepare("SELECT 1 FROM orders WHERE order_code = ?").get(orderCode)) {
    orderCode = generateOrderCode();
  }

  const info = db
    .prepare(
      `INSERT INTO orders (
        order_code, game_id, game_name, package_id, package_sku, package_name,
        bonus_text, player_uid, player_server, player_ign, customer_phone,
        customer_line, note, amount, payment_slip_url, status, admin_note,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)`
    )
    .run(
      orderCode,
      game.id,
      game.name,
      pkg.id,
      pkg.sku,
      pkg.name,
      pkg.bonus_text || "",
      normalized.playerUid,
      normalized.playerServer,
      normalized.playerIgn,
      normalized.customerPhone,
      normalized.customerLine,
      normalized.note,
      pkg.price,
      normalized.paymentSlipUrl,
      now,
      now
    );

  return formatCreatedOrderResponse(info.lastInsertRowid, orderCode, game, pkg, normalized, now);
}

function trackPublicOrder(orderCode, phoneLast4) {
  const { code, last4 } = parseTrackOrderLookup(orderCode, phoneLast4);
  const order = db.prepare("SELECT * FROM orders WHERE order_code = ?").get(code);
  return verifyAndFormatTrackedOrder(order, last4);
}

function listAdminOrders() {
  return db
    .prepare(
      `SELECT * FROM orders 
       ORDER BY CASE status WHEN 'pending' THEN 1 WHEN 'processing' THEN 2 ELSE 3 END ASC, id DESC 
       LIMIT 300`
    )
    .all();
}

function updateAdminOrder(orderId, patch = {}) {
  const existing = db.prepare("SELECT * FROM orders WHERE id = ?").get(Number(orderId));
  if (!existing) {
    throw createHttpError(404, "ไม่พบออเดอร์ที่ต้องการอัปเดต");
  }

  const nextStatus =
    patch.status && VALID_ORDER_STATUSES.has(patch.status)
      ? patch.status
      : existing.status;
  const nextAdminNote =
    patch.admin_note !== undefined
      ? String(patch.admin_note || "").trim().slice(0, 300)
      : existing.admin_note;

  const now = new Date().toISOString();
  db.prepare(
    "UPDATE orders SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?"
  ).run(nextStatus, nextAdminNote, now, existing.id);

  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(existing.id);
  return attachOrderTransitionMeta({ ...updated }, existing.status);
}

function getAdminStats() {
  const revRow = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS active_orders FROM orders WHERE status != 'cancelled'"
    )
    .get();
  const pendingRow = db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM orders WHERE status IN ('pending', 'processing')"
    )
    .get();
  const completedRow = db
    .prepare("SELECT COUNT(*) AS cnt FROM orders WHERE status = 'completed'")
    .get();
  const gamesRow = db
    .prepare(
      "SELECT COUNT(*) AS total_games, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_games FROM games"
    )
    .get();
  const pkgsRow = db
    .prepare(
      "SELECT COUNT(*) AS total_pkgs, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_pkgs FROM packages"
    )
    .get();

  return {
    revenue: Math.round((revRow.revenue || 0) * 100) / 100,
    total_orders: revRow.active_orders || 0,
    pending_orders: pendingRow.cnt || 0,
    completed_orders: completedRow.cnt || 0,
    total_games: gamesRow.total_games || 0,
    active_games: gamesRow.active_games || 0,
    total_packages: pkgsRow.total_pkgs || 0,
    active_packages: pkgsRow.active_pkgs || 0,
  };
}

// ---------------------------------------------------------------------------
// Admin Authentication & Session Management
// ---------------------------------------------------------------------------
function loginAdmin(username, password) {
  const user = String(username || "").trim();
  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(user);
  if (!admin) return null;
  if (!verifyPassword(password, admin.password_salt, admin.password_hash)) {
    return null;
  }

  db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(
    new Date().toISOString()
  );

  const session = generateSessionToken();
  db.prepare(
    "INSERT INTO admin_sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).run(
    session.tokenHash,
    admin.id,
    session.expiresAt,
    new Date().toISOString()
  );

  return {
    admin: { id: admin.id, username: admin.username },
    rawToken: session.raw,
  };
}

function getAdminByToken(rawToken) {
  if (!rawToken) return null;
  const th = hashToken(rawToken);
  const row = db
    .prepare(
      `SELECT a.id, a.username, s.expires_at
       FROM admin_sessions s
       JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = ?`
    )
    .get(th);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(th);
    return null;
  }
  return { id: row.id, username: row.username };
}

function logoutSession(rawToken) {
  if (!rawToken) return;
  db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(
    hashToken(rawToken)
  );
}

function changeAdminPassword(adminId, currentPassword, newPassword) {
  const next = String(newPassword || "");
  if (next.length < 8 || next.length > 128) {
    throw createHttpError(400, "รหัสผ่านใหม่ต้องมีความยาวระหว่าง 8 ถึง 128 ตัวอักษร");
  }

  const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(Number(adminId));
  if (!admin || !verifyPassword(currentPassword, admin.password_salt, admin.password_hash)) {
    throw createHttpError(401, "รหัสผ่านปัจจุบันไม่ถูกต้อง");
  }

  const { salt, hash } = hashPassword(next);
  db.prepare("UPDATE admins SET password_salt = ?, password_hash = ? WHERE id = ?").run(
    salt,
    hash,
    admin.id
  );

  db.prepare("DELETE FROM admin_sessions WHERE admin_id = ?").run(admin.id);
  const session = generateSessionToken();
  db.prepare(
    "INSERT INTO admin_sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).run(
    session.tokenHash,
    admin.id,
    session.expiresAt,
    new Date().toISOString()
  );
  return session.raw;
}

// ---------------------------------------------------------------------------
// Database Resilience, Health & Live Hot-Backup Engine
// ---------------------------------------------------------------------------
function createDatabaseBackup(reason = "auto") {
  const safeReason = String(reason || "auto").replace(/[^a-zA-Z0-9_-]/g, "");
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const filename = `backup_${safeReason}_${timestamp}.db`;
  const fullPath = path.join(BACKUPS_DIR, filename);
  const cleanPath = fullPath.replace(/\\/g, "/");

  db.exec(`VACUUM INTO '${cleanPath}'`);
  const stat = fs.statSync(fullPath);
  pruneOldBackups(10);

  return {
    filename,
    sizeBytes: stat.size,
    createdAt: now.toISOString(),
    reason: safeReason,
  };
}

function pruneOldBackups(keepCount = 10) {
  try {
    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith("backup_") && f.endsWith(".db"))
      .map((f) => {
        const fp = path.join(BACKUPS_DIR, f);
        const stat = fs.statSync(fp);
        return { name: f, path: fp, time: stat.mtimeMs };
      })
      .sort((a, b) => b.time - a.time);

    for (let i = keepCount; i < files.length; i++) {
      try {
        fs.unlinkSync(files[i].path);
      } catch {}
    }
  } catch (err) {
    console.error("[DB] Failed to prune old backups:", err);
  }
}

function listDatabaseBackups() {
  try {
    return fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith("backup_") && f.endsWith(".db"))
      .map((f) => {
        const fp = path.join(BACKUPS_DIR, f);
        const stat = fs.statSync(fp);
        return {
          filename: f,
          sizeBytes: stat.size,
          createdAt: new Date(stat.mtimeMs).toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch {
    return [];
  }
}

function getDatabaseHealth() {
  let integrity = "ok";
  try {
    const row = db.prepare("PRAGMA quick_check;").get();
    integrity = row ? Object.values(row)[0] : "ok";
  } catch (err) {
    integrity = err.message;
  }

  let dbSize = 0;
  try {
    dbSize = fs.statSync(DB_PATH).size;
  } catch {}

  let walSize = 0;
  try {
    walSize = fs.statSync(`${DB_PATH}-wal`).size;
  } catch {}

  const backups = listDatabaseBackups();
  const lastBackup = backups.length ? backups[0].createdAt : null;

  return {
    isHealthy: integrity === "ok",
    integrity,
    journalMode: "wal",
    synchronous: "NORMAL",
    busyTimeoutMs: 8000,
    dbSizeBytes: dbSize,
    walSizeBytes: walSize,
    backupCount: backups.length,
    lastBackupTime: lastBackup,
    backups: backups.slice(0, 10),
  };
}

function checkpointWal() {
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    return true;
  } catch (err) {
    console.error("[DB] WAL checkpoint failed:", err);
    return false;
  }
}

function closeDatabaseCleanly() {
  try {
    checkpointWal();
    db.close();
    console.log("[DB] Closed cleanly with WAL truncated.");
  } catch (err) {
    console.error("[DB] Error closing database:", err);
  }
}

try {
  const existingBackups = listDatabaseBackups();
  const sixHoursMs = 6 * 60 * 60 * 1000;
  const needsInitialBackup =
    existingBackups.length === 0 ||
    Date.now() - new Date(existingBackups[0].createdAt).getTime() > sixHoursMs;

  if (needsInitialBackup) {
    createDatabaseBackup("startup");
    console.log("[DB] Created initial database hot backup snapshot.");
  }
} catch (err) {
  console.error("[DB] Startup backup failed:", err);
}

setInterval(() => {
  try {
    createDatabaseBackup("auto");
    checkpointWal();
  } catch (err) {
    console.error("[DB] Scheduled auto-backup failed:", err);
  }
}, 6 * 60 * 60 * 1000).unref();

module.exports = {
  getSettings,
  updateSettings,
  listPublicGamesWithPackages,
  listAdminGamesWithPackages,
  getGameById,
  createGame,
  updateGame,
  deleteGame,
  createPackage,
  createStarterPackagesForGame,
  updatePackage,
  deletePackage,
  applyGameDiscount,
  applyStorewideDiscount,
  batchUpdatePackages,
  createTopupOrder,
  trackPublicOrder,
  listAdminOrders,
  updateAdminOrder,
  getAdminStats,
  loginAdmin,
  getAdminByToken,
  logoutSession,
  changeAdminPassword,
  createDatabaseBackup,
  listDatabaseBackups,
  getDatabaseHealth,
  checkpointWal,
  closeDatabaseCleanly,
};
