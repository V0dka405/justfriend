"use strict";

/**
 * Layer: Backend Database — Shared Domain Constants, Seed Data & Input Normalizers
 * ศูนย์รวมค่าเริ่มต้นของร้าน ข้อมูลเกมเริ่มต้น และฟังก์ชันตรวจสอบความถูกต้องของข้อมูล (Validation)
 * ใช้ร่วมกันทั้ง SQLite (Local / WAL) และ PostgreSQL (Cloud Production) เพื่อให้พฤติกรรมตรงกัน 100%
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

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

const ALLOWED_SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));

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

const VALID_ORDER_STATUSES = new Set([
  "pending",
  "processing",
  "completed",
  "cancelled",
]);

// รูปแบบไฟล์สลิปที่อนุญาต (/uploads/<uuid>.<jpg|png|webp>) ป้องกัน SSRF / Phishing Link (H-01)
const SLIP_URL_RE =
  /^\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))$/i;

const STARTER_GAMES = [
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

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** สร้างรหัสออเดอร์สุ่ม 8 ตัวอักษรฐานสิบหก เช่น TOP-20261107-A1B2C3D4 (ป้องกันการเดารหัส H-02) */
function generateOrderCode() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TOP-${y}${m}${d}-${rand}`;
}

function normalizeGameInput(input = {}, existingSlug = "") {
  const name = String(input.name || "").trim();
  if (!name) {
    throw createHttpError(400, "กรุณาระบุชื่อเกม");
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

function mergeGameFields(existing, input = {}) {
  const fields = [
    "slug",
    "name",
    "publisher",
    "category",
    "currency_name",
    "uid_label",
    "uid_placeholder",
    "uid_hint",
    "require_server",
    "server_options",
    "discount_badge",
    "accent_color",
    "icon_key",
    "image_url",
    "sort_order",
    "is_active",
  ];
  const merged = {};
  for (const key of fields) {
    merged[key] = input[key] !== undefined ? input[key] : existing[key];
  }
  return normalizeGameInput(merged, existing.slug);
}

function normalizePackageInput(input = {}, existingSku = "") {
  const gameId = Number(input.game_id);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    throw createHttpError(400, "กรุณาเลือกเกมสำหรับแพ็กเกจนี้");
  }

  const name = String(input.name || "").trim();
  if (!name) {
    throw createHttpError(400, "กรุณาระบุชื่อแพ็กเกจ เช่น 110 คูปอง");
  }

  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) {
    throw createHttpError(400, "ราคาขายต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
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
    price: Math.min(1_000_000, Math.round(price * 100) / 100),
    full_price:
      Number.isFinite(fullPrice) && fullPrice > 0
        ? Math.min(1_000_000, Math.round(fullPrice * 100) / 100)
        : 0,
    badge: String(input.badge || "").trim().slice(0, 30),
    sort_order: Math.floor(Number(input.sort_order ?? 10) || 0),
    is_active: input.is_active === false || input.is_active === 0 ? 0 : 1,
  };
}

function mergePackageFields(existing, input = {}) {
  const fields = [
    "game_id",
    "sku",
    "name",
    "bonus_text",
    "price",
    "full_price",
    "badge",
    "sort_order",
    "is_active",
  ];
  const merged = {};
  for (const key of fields) {
    merged[key] = input[key] !== undefined ? input[key] : existing[key];
  }
  return normalizePackageInput(merged, existing.sku);
}

function buildStarterPackagesForNewGame(currencyName = "คูปอง", slugPrefix = "GM") {
  const cur = String(currencyName || "คูปอง").trim() || "คูปอง";
  const prefix =
    String(slugPrefix || "GM")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4) || "PKG";

  return [
    { sku: `${prefix}-01`, name: `100 ${cur}`, bonus_text: "แพ็กเริ่มต้นเติมไว", price: 89, full_price: 100, badge: "", sort_order: 1 },
    { sku: `${prefix}-02`, name: `300 ${cur}`, bonus_text: "ยอดนิยมสุดคุ้ม", price: 269, full_price: 300, badge: "ขายดี", sort_order: 2 },
    { sku: `${prefix}-03`, name: `500 ${cur}`, bonus_text: "โบนัสพิเศษในเกม", price: 440, full_price: 500, badge: "HOT", sort_order: 3 },
  ];
}

function computeDiscountedPackagePrice(pkg, pct) {
  let full = Number(pkg.full_price) || 0;
  const curr = Number(pkg.price) || 0;
  if (full <= 0 || full < curr) {
    full = curr;
  }
  const newPrice = pct === 0 ? full : Math.max(1, Math.round(full * (1 - pct / 100)));
  return { newPrice, fullPrice: full };
}

function validateAndNormalizeOrderInput(payload = {}, pkg, game, uploadsDir) {
  if (!pkg) {
    throw createHttpError(404, "แพ็กเกจนี้ไม่พร้อมให้บริการในขณะนี้ กรุณาเลือกใหม่");
  }
  if (!game) {
    throw createHttpError(400, "เกมนี้ปิดปรับปรุงชั่วคราว");
  }

  const playerUid = String(payload.player_uid || "").trim();
  const playerServer = String(payload.player_server || "").trim();
  const playerIgn = String(payload.player_ign || "").trim();
  const customerPhone = String(payload.customer_phone || "").trim();
  const customerLine = String(payload.customer_line || "").trim();
  const note = String(payload.note || "").trim();
  const paymentSlipUrl = String(payload.payment_slip_url || "").trim().slice(0, 500);

  if (!playerUid || playerUid.length < 3) {
    throw createHttpError(400, `กรุณากรอก ${game.uid_label} ให้ครบถ้วน`);
  }

  if (game.require_server && !playerServer) {
    throw createHttpError(400, "กรุณาเลือก Server ของบัญชีเกมก่อนชำระเงิน");
  }

  const phoneDigits = customerPhone.replace(/\D/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 15) {
    throw createHttpError(
      400,
      "กรุณากรอกเบอร์โทรศัพท์ที่ติดต่อได้ (9–10 หลัก) เพื่อใช้เช็คสถานะออเดอร์"
    );
  }

  if (!paymentSlipUrl) {
    throw createHttpError(400, "กรุณาแนบรูปสลิปโอนเงินเพื่อยืนยันการเติมเกม");
  }

  const slipMatch = SLIP_URL_RE.exec(paymentSlipUrl);
  if (!slipMatch) {
    throw createHttpError(400, "รูปแบบลิงก์รูปสลิปไม่ถูกต้อง กรุณาอัปโหลดสลิปใหม่");
  }

  const slipDiskPath = path.join(uploadsDir, slipMatch[1]);
  if (!fs.existsSync(slipDiskPath)) {
    throw createHttpError(400, "ไม่พบไฟล์สลิปในระบบ กรุณาอัปโหลดสลิปใหม่อีกครั้ง");
  }

  return {
    playerUid: playerUid.slice(0, 120),
    playerServer: playerServer.slice(0, 80),
    playerIgn: playerIgn.slice(0, 80),
    customerPhone: customerPhone.slice(0, 30),
    customerLine: customerLine.slice(0, 80),
    note: note.slice(0, 300),
    paymentSlipUrl,
    phoneDigits,
  };
}

function formatCreatedOrderResponse(orderId, orderCode, game, pkg, normalized, createdAt) {
  return {
    id: Number(orderId),
    order_code: orderCode,
    game_name: game.name,
    package_name: pkg.name,
    bonus_text: pkg.bonus_text || "",
    player_uid: normalized.playerUid,
    player_server: normalized.playerServer,
    player_ign: normalized.playerIgn,
    phone_last4: normalized.phoneDigits.slice(-4),
    amount: Number(pkg.price),
    status: "pending",
    created_at: createdAt,
  };
}

function parseTrackOrderLookup(orderCode, phoneLast4) {
  const code = String(orderCode || "").trim().toUpperCase();
  const last4 = String(phoneLast4 || "").replace(/\D/g, "");
  if (!code || last4.length !== 4) {
    throw createHttpError(400, "กรุณากรอกรหัสใบสั่งซื้อ และเลขท้ายเบอร์โทร 4 หลัก");
  }
  return { code, last4 };
}

function verifyAndFormatTrackedOrder(order, last4, formatDate = String) {
  const notFoundMsg = "ไม่พบรายการสั่งซื้อ หรือเลขท้ายเบอร์โทร 4 หลักไม่ตรงกัน";
  if (!order) {
    throw createHttpError(404, notFoundMsg);
  }
  const digits = String(order.customer_phone || "").replace(/\D/g, "");
  if (!digits.endsWith(last4)) {
    throw createHttpError(404, notFoundMsg);
  }
  return {
    order_code: order.order_code,
    game_name: order.game_name,
    package_name: order.package_name,
    bonus_text: order.bonus_text || "",
    player_uid: order.player_uid,
    player_server: order.player_server,
    player_ign: order.player_ign,
    amount: Number(order.amount),
    status: order.status,
    admin_note: order.admin_note || "",
    created_at: formatDate(order.created_at),
    updated_at: formatDate(order.updated_at),
  };
}

function attachOrderTransitionMeta(updatedOrder, previousStatus) {
  Object.defineProperty(updatedOrder, "_wasAlreadyCompleted", {
    value: previousStatus === "completed",
    enumerable: false,
  });
  return updatedOrder;
}

module.exports = {
  DEFAULT_SETTINGS,
  ALLOWED_SETTING_KEYS,
  VALID_ICONS,
  VALID_ORDER_STATUSES,
  SLIP_URL_RE,
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
};
