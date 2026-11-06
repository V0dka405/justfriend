const RECENT_ORDERS_KEY = "topup_recent_orders_v1";

export const STATUS_LABELS = {
  pending: "รอตรวจสลิป",
  processing: "กำลังเติม UID",
  completed: "เติมสำเร็จแล้ว",
  cancelled: "ยกเลิกรายการ",
};

export function formatMoney(num) {
  const val = Number(num) || 0;
  return `฿${val.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
}

export function safeUrl(raw) {
  const val = String(raw || "").trim();
  if (!val) return "";
  if (val.startsWith("/uploads/") || val.startsWith("/images/")) return val;
  if (/^https?:\/\//i.test(val)) return val;
  return "";
}

function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function makeCleanCoverSvg(game) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(game?.accent_color || "")
    ? game.accent_color
    : "#0284c7";
  const rawName = String(game?.name || "Game").trim();
  const rawPub = String(game?.publisher || "TopUp Station").trim();
  const rawInitial = (rawName.charAt(0) || "G").toUpperCase();

  const name = escapeXml(rawName.slice(0, 18));
  const pub = escapeXml(rawPub.slice(0, 26));
  const initial = escapeXml(rawInitial);
  const safeId = String(game?.id || "0").replace(/[^a-zA-Z0-9_-]/g, "");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="g_${safeId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" rx="40" fill="url(#g_${safeId})"/>
    <circle cx="240" cy="60" r="95" fill="${accent}" opacity="0.22"/>
    <circle cx="50" cy="250" r="80" fill="#38bdf8" opacity="0.16"/>
    <rect x="95" y="65" width="110" height="110" rx="28" fill="${accent}"/>
    <text x="150" y="138" text-anchor="middle" fill="#ffffff" font-family="Inter, sans-serif" font-weight="800" font-size="52">${initial}</text>
    <text x="150" y="222" text-anchor="middle" fill="#ffffff" font-family="Inter, sans-serif" font-weight="700" font-size="22">${name}</text>
    <text x="150" y="250" text-anchor="middle" fill="#94a3b8" font-family="Inter, sans-serif" font-weight="500" font-size="14">${pub}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function getGameCoverSrc(game) {
  const clean = safeUrl(game?.image_url);
  if (!clean) return makeCleanCoverSvg(game);
  if (clean.startsWith("/images/")) return `${clean}?v=5`;
  return clean;
}

export function getRecentOrders() {
  try {
    const raw = localStorage.getItem(RECENT_ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecentOrder(orderCode, phoneLast4, gameName) {
  try {
    const list = getRecentOrders().filter((x) => x.order_code !== orderCode);
    list.unshift({
      order_code: orderCode,
      phone_last4: phoneLast4,
      game_name: gameName,
    });
    localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify(list.slice(0, 5)));
  } catch {}
}

export function filterFeaturedBundles(packages = []) {
  return packages
    .filter((p) => {
      const b = String(p.badge || "").toUpperCase();
      const n = String(p.name || "").toLowerCase();
      const txt = String(p.bonus_text || "").toLowerCase();
      return (
        b === "VIP" ||
        b === "HOT" ||
        b === "ขายดี" ||
        b === "คุ้มสุด" ||
        n.includes("bundle") ||
        txt.includes("bundle") ||
        txt.includes("battlepass") ||
        txt.includes("เสบียง")
      );
    })
    .slice(0, 3);
}
