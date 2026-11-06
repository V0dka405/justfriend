"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
} = require("../middlewares/auth.middleware");
const { DATA_DIR, BACKUPS_DIR, UPLOADS_DIR } = require("../config/paths");

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
        try { targetDb.close(); } catch {}
      }

      // Isolate damaged database file
      const corruptedFile = path.join(DATA_DIR, `corrupted_${Date.now()}.db`);
      try {
        fs.renameSync(DB_PATH, corruptedFile);
        try { fs.unlinkSync(`${DB_PATH}-wal`); } catch {}
        try { fs.unlinkSync(`${DB_PATH}-shm`); } catch {}
        console.warn(`[DISASTER RECOVERY] Corrupted database quarantined to: ${corruptedFile}`);
      } catch (renameErr) {
        console.error("[DISASTER RECOVERY] Failed to quarantine corrupted DB:", renameErr);
      }

      // Restore from latest valid backup
      const backups = listDatabaseBackups();
      if (backups.length > 0) {
        const latestBackupPath = path.join(BACKUPS_DIR, backups[0].filename);
        console.log(`[DISASTER RECOVERY] Restoring database from backup: ${backups[0].filename}`);
        fs.copyFileSync(latestBackupPath, DB_PATH);
        const recoveredDb = new DatabaseSync(DB_PATH);
        console.log("[DISASTER RECOVERY] Database successfully restored from backup!");
        return recoveredDb;
      } else {
        console.warn("[DISASTER RECOVERY] No backup snapshots found. Initializing a clean database.");
        return new DatabaseSync(DB_PATH);
      }
    }
  }

  return new DatabaseSync(DB_PATH);
}

const db = openDatabaseWithDisasterRecovery();

// High-Durability, Concurrency & Performance PRAGMAs
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;"); // Safe in WAL mode, impervious to power failure / app crashes
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 8000;"); // Wait up to 8000ms instead of failing immediately with SQLITE_BUSY
db.exec("PRAGMA wal_autocheckpoint = 1000;"); // Keep WAL log size bound
db.exec("PRAGMA cache_size = -64000;"); // 64 MB fast cache
db.exec("PRAGMA temp_store = MEMORY;");

// ---------------------------------------------------------------------------
// Schema Initialization (8-Bit UID Game Top-Up Store)
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

// ---------------------------------------------------------------------------
// Seed Default Store Settings, Admin & Starter UID Games + Packages
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  store_name: "TopUp Station",
  store_tagline: "เติมเกมไว ปลอดภัย ใช้แค่ UID",
  announcement_bar:
    "เติมเกมไวใน 1–3 นาที ใช้แค่ UID ปลอดภัย 100% ไม่ต้องกรอกรหัสผ่าน! เช็คสถานะออเดอร์ได้เรียลไทม์",
  hero_kicker: "DIRECT UID TOP-UP",
  hero_heading: "เติมเกมง่ายใน 3 ขั้นตอน ไม่ต้องสมัครสมาชิก",
  hero_subtext:
    "เลือกเกม กรอก UID เลือกแพ็กเกจ แล้วโอนผ่าน PromptPay ระบบส่งรายการถึงแอดมินทันที ปลอดภัย รวดเร็ว",
  promptpay_id: "081-234-5678",
  promptpay_name: "TOPUP STATION",
  promptpay_qr_url: "",
  contact_line: "@topupstation",
  contact_facebook: "fb.com/topupstation",
  open_hours: "เปิดบริการทุกวัน 09:00 – 02:00 น.",
};

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
  const starterGames = [
    {
      slug: "rov",
      name: "RoV: Arena of Valor",
      publisher: "Garena",
      category: "MOBA / FPS",
      currency_name: "คูปอง",
      uid_label: "OpenID (ตัวเลขในตั้งค่าเกม)",
      uid_placeholder: "เช่น 6849201837462910",
      uid_hint:
        "เข้าเกม RoV > กดไอคอนฟันเฟือง (ตั้งค่า) มุมขวาบน > แท็บทั่วไป > กดปุ่มคัดลอก OpenID",
      require_server: 0,
      server_options: "",
      discount_badge: "ลดสูงสุด 12%",
      accent_color: "#ffd13b",
      icon_key: "sword",
      image_url: "/images/rov.png",
      sort_order: 1,
      packages: [
        { sku: "ROV-01", name: "37 คูปอง", bonus_text: "เข้าไวใน 1 นาที", price: 32, full_price: 35, badge: "", sort_order: 1 },
        { sku: "ROV-02", name: "110 คูปอง", bonus_text: "ยอดฮิตเริ่มต้น", price: 95, full_price: 105, badge: "ขายดี", sort_order: 2 },
        { sku: "ROV-03", name: "225 คูปอง", bonus_text: "คุ้มค่าสายสกิน", price: 189, full_price: 215, badge: "", sort_order: 3 },
        { sku: "ROV-04", name: "465 คูปอง", bonus_text: "ปลดล็อกสกินระดับ Limited", price: 385, full_price: 439, badge: "คุ้มสุด", sort_order: 4 },
        { sku: "ROV-05", name: "950 คูปอง", bonus_text: "แถมโบนัสในเกมตามโปร", price: 775, full_price: 889, badge: "HOT", sort_order: 5 },
        { sku: "ROV-06", name: "2,420 คูปอง", bonus_text: "แพ็กใหญ่สายสุ่มลอตเตอรี่", price: 1920, full_price: 2190, badge: "VIP", sort_order: 6 },
      ],
    },
    {
      slug: "valorant",
      name: "VALORANT",
      publisher: "Riot Games",
      category: "MOBA / FPS",
      currency_name: "VP",
      uid_label: "Riot ID พร้อม #Tag",
      uid_placeholder: "เช่น TenZ#TH1",
      uid_hint:
        "ดูชื่อและ #Tag ได้ที่มุมขวาบนในหน้าล็อบบี้เกม VALORANT (โซนไทย/SEA เท่านั้น)",
      require_server: 0,
      server_options: "",
      discount_badge: "ลดสูงสุด 15%",
      accent_color: "#ff4d6d",
      icon_key: "crosshair",
      image_url: "/images/valorant.png",
      sort_order: 2,
      packages: [
        { sku: "VAL-01", name: "475 VP", bonus_text: "เหมาะเติมเศษซื้อสกิน", price: 135, full_price: 150, badge: "", sort_order: 1 },
        { sku: "VAL-02", name: "1,000 VP", bonus_text: "พอดีซื้อ Battlepass!", price: 269, full_price: 300, badge: "ขายดี", sort_order: 2 },
        { sku: "VAL-03", name: "2,050 VP", bonus_text: "สกินปืนระดับ Premium 1 กระบอก", price: 529, full_price: 600, badge: "HOT", sort_order: 3 },
        { sku: "VAL-04", name: "3,650 VP", bonus_text: "สกินมีด / Exclusive", price: 930, full_price: 1050, badge: "", sort_order: 4 },
        { sku: "VAL-05", name: "5,350 VP", bonus_text: "คุ้มสำหรับเหมาเซ็ตเล็ก", price: 1340, full_price: 1500, badge: "คุ้มสุด", sort_order: 5 },
        { sku: "VAL-06", name: "11,000 VP", bonus_text: "เหมา Bundle ยกเซ็ตสุดคุ้ม", price: 2690, full_price: 3000, badge: "VIP", sort_order: 6 },
      ],
    },
    {
      slug: "genshin",
      name: "Genshin Impact",
      publisher: "HoYoverse",
      category: "RPG / Gacha",
      currency_name: "Genesis Crystals",
      uid_label: "UID ตัวเลข 9 หลัก",
      uid_placeholder: "เช่น 812345678",
      uid_hint: "ดูเลข UID 9 หลักได้ที่มุมขวาล่างของหน้าจอขณะอยู่ในเกม หรือหน้าเมนู Paimon",
      require_server: 1,
      server_options: "Asia,America,Europe,TW/HK/MO",
      discount_badge: "ลดสูงสุด 22%",
      accent_color: "#38e2ff",
      icon_key: "crystal",
      image_url: "/images/genshin.png",
      sort_order: 3,
      packages: [
        { sku: "GEN-01", name: "พรดวงจันทร์ (Welkin 30 วัน)", bonus_text: "รับทันที 300 + รายวันรวม 2,700 Primogems", price: 135, full_price: 179, badge: "ขายดี", sort_order: 1 },
        { sku: "GEN-02", name: "300 + 30 Crystals", bonus_text: "โบนัสเติมครั้งแรก x2 ตามเงื่อนไขเกม", price: 135, full_price: 179, badge: "", sort_order: 2 },
        { sku: "GEN-03", name: "980 + 110 Crystals", bonus_text: "ยอดนิยมเปิดกาชา", price: 419, full_price: 529, badge: "HOT", sort_order: 3 },
        { sku: "GEN-04", name: "1,980 + 260 Crystals", bonus_text: "คุ้มกว่าเติมเองในเกม", price: 829, full_price: 1050, badge: "", sort_order: 4 },
        { sku: "GEN-05", name: "3,280 + 600 Crystals", bonus_text: "การันตีตัวละคร 5 ดาวไวขึ้น", price: 1350, full_price: 1790, badge: "คุ้มสุด", sort_order: 5 },
        { sku: "GEN-06", name: "6,480 + 1,600 Crystals", bonus_text: "แพ็กใหญ่ประหยัดกว่า 700 บาท!", price: 2690, full_price: 3490, badge: "VIP", sort_order: 6 },
      ],
    },
    {
      slug: "freefire",
      name: "Free Fire",
      publisher: "Garena",
      category: "Battle Royale",
      currency_name: "เพชร (Diamonds)",
      uid_label: "Player UID ตัวเลข",
      uid_placeholder: "เช่น 1928374650",
      uid_hint: "แตะที่รูปโปรไฟล์มุมซ้ายบนในเกม Free Fire แล้วคัดลอกตัวเลข UID ใต้ชื่อตัวละคร",
      require_server: 0,
      server_options: "",
      discount_badge: "โบนัสเพชรคุ้ม",
      accent_color: "#ff922b",
      icon_key: "flame",
      image_url: "/images/freefire.png",
      sort_order: 4,
      packages: [
        { sku: "FF-01", name: "105 เพชร", bonus_text: "เติมไวไม่ต้องรอนาน", price: 29, full_price: 35, badge: "", sort_order: 1 },
        { sku: "FF-02", name: "345 เพชร", bonus_text: "เหมาะอัป Booyah Pass", price: 92, full_price: 105, badge: "ขายดี", sort_order: 2 },
        { sku: "FF-03", name: "715 เพชร", bonus_text: "สุ่มสกินปืนอัปเกรด", price: 185, full_price: 215, badge: "", sort_order: 3 },
        { sku: "FF-04", name: "1,450 เพชร", bonus_text: "คุ้มสุดสำหรับสายแต่งตัว", price: 369, full_price: 429, badge: "คุ้มสุด", sort_order: 4 },
        { sku: "FF-05", name: "2,980 เพชร", bonus_text: "เหมาสุ่มกิจกรรมใหญ่", price: 739, full_price: 859, badge: "HOT", sort_order: 5 },
      ],
    },
    {
      slug: "pubgm",
      name: "PUBG Mobile",
      publisher: "Level Infinite",
      category: "Battle Royale",
      currency_name: "UC",
      uid_label: "Character ID (ตัวเลข)",
      uid_placeholder: "เช่น 5123456789",
      uid_hint: "กดรูปโปรไฟล์มุมซ้ายบนในหน้าล็อบบี้ PUBG Mobile เพื่อดูเลข UID (รองรับเซิร์ฟ Global/TH)",
      require_server: 0,
      server_options: "",
      discount_badge: "ลดสูงสุด 16%",
      accent_color: "#2ee57d",
      icon_key: "helmet",
      image_url: "/images/pubgm.png",
      sort_order: 5,
      packages: [
        { sku: "PUBG-01", name: "60 UC", bonus_text: "เติมด่วนเข้าทันที", price: 32, full_price: 35, badge: "", sort_order: 1 },
        { sku: "PUBG-02", name: "325 UC", bonus_text: "รวมโบนัส 300+25 UC", price: 155, full_price: 179, badge: "ขายดี", sort_order: 2 },
        { sku: "PUBG-03", name: "660 UC", bonus_text: "พอดีเปิด Royale Pass!", price: 305, full_price: 359, badge: "HOT", sort_order: 3 },
        { sku: "PUBG-04", name: "1,800 UC", bonus_text: "รวมโบนัส 1,500+300 UC", price: 769, full_price: 899, badge: "คุ้มสุด", sort_order: 4 },
        { sku: "PUBG-05", name: "3,850 UC", bonus_text: "สายสุ่ม X-Suit & รถหรู", price: 1520, full_price: 1790, badge: "VIP", sort_order: 5 },
      ],
    },
    {
      slug: "hsr",
      name: "Honkai: Star Rail",
      publisher: "HoYoverse",
      category: "RPG / Gacha",
      currency_name: "Oneiric Shards",
      uid_label: "UID ตัวเลข 9 หลัก",
      uid_placeholder: "เช่น 801234567",
      uid_hint: "ดูเลข UID 9 หลักที่มุมซ้ายล่างของหน้าจอ หรือเปิดเมนูโทรศัพท์ในเกม",
      require_server: 1,
      server_options: "Asia,America,Europe,TW/HK/MO",
      discount_badge: "ลดสูงสุด 22%",
      accent_color: "#b47cff",
      icon_key: "star",
      image_url: "/images/hsr.png",
      sort_order: 6,
      packages: [
        { sku: "HSR-01", name: "บัตรเสบียงรถไฟ (30 วัน)", bonus_text: "รับทันที 300 + รายวันรวม 2,700 Stellar Jade", price: 135, full_price: 179, badge: "ขายดี", sort_order: 1 },
        { sku: "HSR-02", name: "300 + 30 Shards", bonus_text: "โบนัส x2 ครั้งแรกตามเงื่อนไขเกม", price: 135, full_price: 179, badge: "", sort_order: 2 },
        { sku: "HSR-03", name: "980 + 110 Shards", bonus_text: "แพ็กยอดฮิตเปิดตู้ตัวละคร", price: 419, full_price: 529, badge: "HOT", sort_order: 3 },
        { sku: "HSR-04", name: "1,980 + 260 Shards", bonus_text: "เปิด Light Cone ประจำตัว", price: 829, full_price: 1050, badge: "", sort_order: 4 },
        { sku: "HSR-05", name: "3,280 + 600 Shards", bonus_text: "คุ้มค่าประหยัดกว่า 400 บาท", price: 1350, full_price: 1790, badge: "คุ้มสุด", sort_order: 5 },
        { sku: "HSR-06", name: "6,480 + 1,600 Shards", bonus_text: "แพ็กใหญ่สายปลด Eidolon!", price: 2690, full_price: 3490, badge: "VIP", sort_order: 6 },
      ],
    },
  ];

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

  for (const g of starterGames) {
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

// Ensure default logos for all games
db.prepare("UPDATE games SET image_url = '/images/rov.png' WHERE slug = 'rov'").run();
db.prepare("UPDATE games SET image_url = '/images/valorant.png' WHERE slug = 'valorant'").run();
db.prepare("UPDATE games SET image_url = '/images/freefire.png' WHERE slug = 'freefire'").run();
db.prepare("UPDATE games SET image_url = '/images/genshin.png' WHERE slug = 'genshin'").run();
db.prepare("UPDATE games SET image_url = '/images/pubgm.png' WHERE slug = 'pubgm'").run();
db.prepare("UPDATE games SET image_url = '/images/hsr.png' WHERE slug = 'hsr'").run();

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

const ALLOWED_SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));

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
  const games = db
    .prepare("SELECT * FROM games ORDER BY sort_order ASC, id ASC")
    .all();
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

const VALID_ICONS = new Set([
  "sword",
  "crosshair",
  "crystal",
  "flame",
  "helmet",
  "star",
  "gamepad",
  "crown",
]);

function normalizeGameInput(input, existingSlug = "") {
  const name = String(input.name || "").trim();
  if (!name) {
    const err = new Error("กรุณาระบุชื่อเกม");
    err.statusCode = 400;
    throw err;
  }

  let slug = String(input.slug || existingSlug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) {
    slug = `game-${Math.random().toString(36).slice(2, 7)}`;
  }

  const rawColor = String(input.accent_color || "#ffd13b").trim();
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : "#ffd13b";
  const rawIcon = String(input.icon_key || "gamepad").trim();
  const iconKey = VALID_ICONS.has(rawIcon) ? rawIcon : "gamepad";

  return {
    slug: slug.slice(0, 48),
    name: name.slice(0, 120),
    publisher: String(input.publisher || "").trim().slice(0, 80),
    category: (String(input.category || "MOBA / FPS").trim() || "MOBA / FPS").slice(0, 60),
    currency_name: (String(input.currency_name || "คูปอง").trim() || "คูปอง").slice(0, 60),
    uid_label: (String(input.uid_label || "UID ผู้เล่น").trim() || "UID ผู้เล่น").slice(0, 100),
    uid_placeholder: String(input.uid_placeholder || "กรอก UID ของคุณ...").trim().slice(0, 120),
    uid_hint: String(input.uid_hint || "").trim().slice(0, 400),
    require_server: input.require_server ? 1 : 0,
    server_options: String(input.server_options || "").trim().slice(0, 300),
    discount_badge: String(input.discount_badge || "").trim().slice(0, 40),
    accent_color: accentColor,
    icon_key: iconKey,
    image_url: String(input.image_url || "").trim().slice(0, 1000),
    sort_order: Math.floor(Number(input.sort_order ?? 10) || 0),
    is_active: input.is_active === false || input.is_active === 0 ? 0 : 1,
  };
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
      const e = new Error(`รหัสลิงก์เกม (Slug: ${g.slug}) ซ้ำกับเกมที่มีอยู่แล้ว`);
      e.statusCode = 409;
      throw e;
    }
    throw err;
  }
}

function updateGame(id, input) {
  const existing = db.prepare("SELECT * FROM games WHERE id = ?").get(Number(id));
  if (!existing) {
    const err = new Error("ไม่พบข้อมูลเกมที่ต้องการแก้ไข");
    err.statusCode = 404;
    throw err;
  }

  const merged = {
    slug: input.slug !== undefined ? input.slug : existing.slug,
    name: input.name !== undefined ? input.name : existing.name,
    publisher: input.publisher !== undefined ? input.publisher : existing.publisher,
    category: input.category !== undefined ? input.category : existing.category,
    currency_name: input.currency_name !== undefined ? input.currency_name : existing.currency_name,
    uid_label: input.uid_label !== undefined ? input.uid_label : existing.uid_label,
    uid_placeholder: input.uid_placeholder !== undefined ? input.uid_placeholder : existing.uid_placeholder,
    uid_hint: input.uid_hint !== undefined ? input.uid_hint : existing.uid_hint,
    require_server: input.require_server !== undefined ? input.require_server : existing.require_server,
    server_options: input.server_options !== undefined ? input.server_options : existing.server_options,
    discount_badge: input.discount_badge !== undefined ? input.discount_badge : existing.discount_badge,
    accent_color: input.accent_color !== undefined ? input.accent_color : existing.accent_color,
    icon_key: input.icon_key !== undefined ? input.icon_key : existing.icon_key,
    image_url: input.image_url !== undefined ? input.image_url : existing.image_url,
    sort_order: input.sort_order !== undefined ? input.sort_order : existing.sort_order,
    is_active: input.is_active !== undefined ? input.is_active : existing.is_active,
  };

  const g = normalizeGameInput(merged, existing.slug);
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
      const e = new Error(`รหัสลิงก์เกม (Slug: ${g.slug}) ซ้ำกับเกมอื่น`);
      e.statusCode = 409;
      throw e;
    }
    throw err;
  }
}

function deleteGame(id) {
  const info = db.prepare("DELETE FROM games WHERE id = ?").run(Number(id));
  if (!info.changes) {
    const err = new Error("ไม่พบเกมที่ต้องการลบ");
    err.statusCode = 404;
    throw err;
  }
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Package CRUD
// ---------------------------------------------------------------------------
function getPackageById(id) {
  return db.prepare("SELECT * FROM packages WHERE id = ?").get(Number(id));
}

function normalizePackageInput(input, existingSku = "") {
  const gameId = Number(input.game_id);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    const err = new Error("กรุณาเลือกเกมสำหรับแพ็กเกจนี้");
    err.statusCode = 400;
    throw err;
  }

  const game = db.prepare("SELECT id FROM games WHERE id = ?").get(gameId);
  if (!game) {
    const err = new Error("ไม่พบเกมที่ระบุ");
    err.statusCode = 404;
    throw err;
  }

  const name = String(input.name || "").trim();
  if (!name) {
    const err = new Error("กรุณาระบุชื่อแพ็กเกจ เช่น 110 คูปอง");
    err.statusCode = 400;
    throw err;
  }

  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) {
    const err = new Error("ราคาขายต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
    err.statusCode = 400;
    throw err;
  }

  const fullPrice = Number(input.full_price || 0);
  let sku = String(input.sku || existingSku || "").trim().toUpperCase();
  if (!sku) {
    sku = `PKG-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }

  return {
    game_id: gameId,
    sku: sku.slice(0, 32),
    name: name.slice(0, 140),
    bonus_text: String(input.bonus_text || "").trim().slice(0, 160),
    price: Math.round(price * 100) / 100,
    full_price: Number.isFinite(fullPrice) && fullPrice > 0 ? Math.round(fullPrice * 100) / 100 : 0,
    badge: String(input.badge || "").trim().slice(0, 30),
    sort_order: Math.floor(Number(input.sort_order ?? 10) || 0),
    is_active: input.is_active === false || input.is_active === 0 ? 0 : 1,
  };
}

function createPackage(input) {
  const p = normalizePackageInput(input);
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
      const e = new Error(`รหัสแพ็กเกจ (SKU: ${p.sku}) ซ้ำกับรายการอื่น`);
      e.statusCode = 409;
      throw e;
    }
    throw err;
  }
}

function createStarterPackagesForGame(gameId, currencyName = "คูปอง", slugPrefix = "GM") {
  const gId = Number(gameId);
  const cur = String(currencyName || "คูปอง").trim();
  const prefix = String(slugPrefix || "GM").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "PKG";
  const now = new Date().toISOString();

  const starters = [
    { sku: `${prefix}-01`, name: `100 ${cur}`, bonus: "แพ็กเริ่มต้นเติมไว", price: 89, full: 100, badge: "", order: 1 },
    { sku: `${prefix}-02`, name: `300 ${cur}`, bonus: "ยอดนิยมสุดคุ้ม", price: 269, full: 300, badge: "ขายดี", order: 2 },
    { sku: `${prefix}-03`, name: `500 ${cur}`, bonus: "โบนัสพิเศษในเกม", price: 440, full: 500, badge: "HOT", order: 3 },
  ];

  const stmt = db.prepare(`
    INSERT INTO packages (
      game_id, sku, name, bonus_text, price, full_price, badge, sort_order, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  for (const p of starters) {
    try {
      stmt.run(gId, p.sku, p.name, p.bonus, p.price, p.full, p.badge, p.order, now, now);
    } catch {
      stmt.run(gId, `${p.sku}-${Date.now().toString().slice(-4)}`, p.name, p.bonus, p.price, p.full, p.badge, p.order, now, now);
    }
  }
}

function updatePackage(id, input) {
  const existing = getPackageById(id);
  if (!existing) {
    const err = new Error("ไม่พบแพ็กเกจที่ต้องการแก้ไข");
    err.statusCode = 404;
    throw err;
  }

  const merged = {
    game_id: input.game_id !== undefined ? input.game_id : existing.game_id,
    sku: input.sku !== undefined ? input.sku : existing.sku,
    name: input.name !== undefined ? input.name : existing.name,
    bonus_text: input.bonus_text !== undefined ? input.bonus_text : existing.bonus_text,
    price: input.price !== undefined ? input.price : existing.price,
    full_price: input.full_price !== undefined ? input.full_price : existing.full_price,
    badge: input.badge !== undefined ? input.badge : existing.badge,
    sort_order: input.sort_order !== undefined ? input.sort_order : existing.sort_order,
    is_active: input.is_active !== undefined ? input.is_active : existing.is_active,
  };

  const p = normalizePackageInput(merged, existing.sku);
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
      const e = new Error(`รหัสแพ็กเกจ (SKU: ${p.sku}) ซ้ำกับรายการอื่น`);
      e.statusCode = 409;
      throw e;
    }
    throw err;
  }
}

function deletePackage(id) {
  const info = db.prepare("DELETE FROM packages WHERE id = ?").run(Number(id));
  if (!info.changes) {
    const err = new Error("ไม่พบแพ็กเกจที่ต้องการลบ");
    err.statusCode = 404;
    throw err;
  }
  return { deleted: true };
}

function applyGameDiscount(gameId, percent) {
  const gId = Number(gameId);
  const pct = Math.max(0, Math.min(99, Math.round(Number(percent) || 0)));
  const game = getGameById(gId);
  if (!game) {
    const err = new Error("ไม่พบเกมที่ต้องการปรับลดราคา");
    err.statusCode = 404;
    throw err;
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
      let full = Number(p.full_price) || 0;
      let curr = Number(p.price) || 0;
      if (full <= 0 || full < curr) {
        full = curr;
      }
      let newPrice;
      if (pct === 0) {
        newPrice = full;
      } else {
        newPrice = Math.max(1, Math.round(full * (1 - pct / 100)));
      }
      updatePkgStmt.run(newPrice, full, now, p.id);
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

  return listAdminGamesWithPackages().find((g) => g.id === gId);
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

      let price = existing.price;
      if (it.price !== undefined) {
        const rawPrice = Number(it.price);
        if (Number.isFinite(rawPrice)) {
          price = Math.min(1_000_000, Math.max(0, Math.round(rawPrice * 100) / 100));
        }
      }

      let full_price = existing.full_price;
      if (it.full_price !== undefined) {
        const rawFull = Number(it.full_price);
        if (Number.isFinite(rawFull)) {
          full_price = Math.min(1_000_000, Math.max(0, Math.round(rawFull * 100) / 100));
        }
      }

      const badge = it.badge !== undefined ? String(it.badge).trim().slice(0, 30) : existing.badge;
      const is_active = it.is_active !== undefined ? (it.is_active ? 1 : 0) : existing.is_active;
      stmt.run(price, full_price, badge, is_active, now, id);
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return listAdminGamesWithPackages();
}

// ---------------------------------------------------------------------------
// Top-Up Order Creation & Tracking
// ---------------------------------------------------------------------------
function generateOrderCode() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  // 4 random bytes = 8 hex chars (4,294,967,296 entropy per day) preventing brute-force IDOR (H-02)
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TOP-${y}${m}${d}-${rand}`;
}

function createTopupOrder(payload) {
  const packageId = Number(payload.package_id);
  const playerUid = String(payload.player_uid || "").trim();
  const playerServer = String(payload.player_server || "").trim();
  const playerIgn = String(payload.player_ign || "").trim();
  const customerPhone = String(payload.customer_phone || "").trim();
  const customerLine = String(payload.customer_line || "").trim();
  const note = String(payload.note || "").trim();
  const paymentSlipUrl = String(payload.payment_slip_url || "").trim().slice(0, 500);

  if (!Number.isInteger(packageId) || packageId <= 0) {
    const err = new Error("กรุณาเลือกแพ็กเกจที่ต้องการเติมก่อนกดยืนยัน");
    err.statusCode = 400;
    throw err;
  }

  const pkg = db
    .prepare("SELECT * FROM packages WHERE id = ? AND is_active = 1")
    .get(packageId);
  if (!pkg) {
    const err = new Error("แพ็กเกจนี้ไม่พร้อมให้บริการในขณะนี้ กรุณาเลือกใหม่");
    err.statusCode = 404;
    throw err;
  }

  const game = db
    .prepare("SELECT * FROM games WHERE id = ? AND is_active = 1")
    .get(pkg.game_id);
  if (!game) {
    const err = new Error("เกมนี้ปิดปรับปรุงชั่วคราว");
    err.statusCode = 400;
    throw err;
  }

  if (!playerUid || playerUid.length < 3) {
    const err = new Error(`กรุณากรอก ${game.uid_label} ให้ครบถ้วน`);
    err.statusCode = 400;
    throw err;
  }

  if (game.require_server && !playerServer) {
    const err = new Error("กรุณาเลือก Server ของบัญชีเกมก่อนชำระเงิน");
    err.statusCode = 400;
    throw err;
  }

  const phoneDigits = customerPhone.replace(/\D/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 15) {
    const err = new Error("กรุณากรอกเบอร์โทรศัพท์ที่ติดต่อได้ (9–10 หลัก) เพื่อใช้เช็คสถานะออเดอร์");
    err.statusCode = 400;
    throw err;
  }

  if (!paymentSlipUrl) {
    const err = new Error("กรุณาแนบรูปสลิปโอนเงินเพื่อยืนยันการเติมเกม");
    err.statusCode = 400;
    throw err;
  }

  // Validate exact /uploads/<uuid>.<ext> pattern to block external phishing links (H-01)
  const SLIP_URL_RE = /^\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))$/i;
  const slipMatch = SLIP_URL_RE.exec(paymentSlipUrl);
  if (!slipMatch) {
    const err = new Error("รูปแบบลิงก์รูปสลิปไม่ถูกต้อง กรุณาอัปโหลดสลิปใหม่");
    err.statusCode = 400;
    throw err;
  }

  // Verify file exists on local disk
  const slipDiskPath = path.join(UPLOADS_DIR, slipMatch[1]);
  if (!fs.existsSync(slipDiskPath)) {
    const err = new Error("ไม่พบไฟล์สลิปในระบบ กรุณาอัปโหลดสลิปใหม่อีกครั้ง");
    err.statusCode = 400;
    throw err;
  }

  // Prevent slip replay (reuse across orders)
  const duplicateSlip = db
    .prepare("SELECT order_code FROM orders WHERE payment_slip_url = ?")
    .get(paymentSlipUrl);
  if (duplicateSlip) {
    const err = new Error("สลิปโอนเงินนี้ถูกใช้งานในระบบไปแล้ว กรุณาใช้สลิปรายการใหม่");
    err.statusCode = 409;
    throw err;
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
      playerUid.slice(0, 120),
      playerServer.slice(0, 80),
      playerIgn.slice(0, 80),
      customerPhone.slice(0, 30),
      customerLine.slice(0, 80),
      note.slice(0, 300),
      pkg.price,
      paymentSlipUrl,
      now,
      now
    );

  return {
    id: Number(info.lastInsertRowid),
    order_code: orderCode,
    game_name: game.name,
    package_name: pkg.name,
    bonus_text: pkg.bonus_text,
    player_uid: playerUid,
    player_server: playerServer,
    player_ign: playerIgn,
    phone_last4: phoneDigits.slice(-4),
    amount: pkg.price,
    status: "pending",
    created_at: now,
  };
}

function trackPublicOrder(orderCode, phoneLast4) {
  const code = String(orderCode || "").trim().toUpperCase();
  const last4 = String(phoneLast4 || "").replace(/\D/g, "");
  if (!code || last4.length !== 4) {
    const err = new Error("กรุณากรอกรหัสใบสั่งซื้อ และเลขท้ายเบอร์โทร 4 หลัก");
    err.statusCode = 400;
    throw err;
  }

  const order = db.prepare("SELECT * FROM orders WHERE order_code = ?").get(code);
  if (!order) {
    const err = new Error("ไม่พบรายการสั่งซื้อ หรือเลขท้ายเบอร์โทร 4 หลักไม่ตรงกัน");
    err.statusCode = 404;
    throw err;
  }

  const digits = String(order.customer_phone || "").replace(/\D/g, "");
  if (!digits.endsWith(last4)) {
    const err = new Error("ไม่พบรายการสั่งซื้อ หรือเลขท้ายเบอร์โทร 4 หลักไม่ตรงกัน");
    err.statusCode = 404;
    throw err;
  }

  return {
    order_code: order.order_code,
    game_name: order.game_name,
    package_name: order.package_name,
    bonus_text: order.bonus_text,
    player_uid: order.player_uid,
    player_server: order.player_server,
    player_ign: order.player_ign,
    amount: order.amount,
    status: order.status,
    admin_note: order.admin_note,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

function listAdminOrders() {
  // Prioritize pending and processing orders so spamming fake orders cannot push real orders out of view (M-01)
  return db
    .prepare(
      `SELECT * FROM orders 
       ORDER BY CASE status WHEN 'pending' THEN 1 WHEN 'processing' THEN 2 ELSE 3 END ASC, id DESC 
       LIMIT 300`
    )
    .all();
}

const VALID_ORDER_STATUSES = new Set([
  "pending",
  "processing",
  "completed",
  "cancelled",
]);

function updateAdminOrder(orderId, patch) {
  const existing = db.prepare("SELECT * FROM orders WHERE id = ?").get(Number(orderId));
  if (!existing) {
    const err = new Error("ไม่พบออเดอร์ที่ต้องการอัปเดต");
    err.statusCode = 404;
    throw err;
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

  return db.prepare("SELECT * FROM orders WHERE id = ?").get(existing.id);
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
    const err = new Error("รหัสผ่านใหม่ต้องมีความยาวระหว่าง 8 ถึง 128 ตัวอักษร");
    err.statusCode = 400;
    throw err;
  }

  const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(Number(adminId));
  if (!admin || !verifyPassword(currentPassword, admin.password_salt, admin.password_hash)) {
    const err = new Error("รหัสผ่านปัจจุบันไม่ถูกต้อง");
    err.statusCode = 401;
    throw err;
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

  // VACUUM INTO produces a 100% consistent, defragmented live hot backup without read/write locks
  db.exec(`VACUUM INTO '${cleanPath}'`);

  const stat = fs.statSync(fullPath);

  // Keep latest 10 backup snapshots to prevent storage exhaustion
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

    if (files.length > keepCount) {
      for (let i = keepCount; i < files.length; i++) {
        try {
          fs.unlinkSync(files[i].path);
        } catch {}
      }
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

// Automatically create initial backup on startup if none exists or older than 6 hours
try {
  const existingBackups = listDatabaseBackups();
  const nowMs = Date.now();
  const sixHoursMs = 6 * 60 * 60 * 1000;
  const needsInitialBackup =
    existingBackups.length === 0 ||
    nowMs - new Date(existingBackups[0].createdAt).getTime() > sixHoursMs;

  if (needsInitialBackup) {
    createDatabaseBackup("startup");
    console.log("[DB] Created initial database hot backup snapshot.");
  }
} catch (err) {
  console.error("[DB] Startup backup failed:", err);
}

// Scheduled auto backup and WAL truncation every 6 hours
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
