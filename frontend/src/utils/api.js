/**
 * API Client — จุดเดียวสำหรับเรียก Backend จากหน้าร้าน React
 *
 * กฎของทีม: ห้ามเรียก fetch("/api/...") ตรงๆ ใน Component
 * ให้เรียกผ่านฟังก์ชันในไฟล์นี้เสมอ เพื่อให้ทุกคำขอ POST/PUT/DELETE
 * แนบ Header `X-Requested-With: XMLHttpRequest` (ป้องกัน CSRF) อัตโนมัติ
 * และจัดการข้อความ error จาก Backend เป็นรูปแบบเดียวกัน
 */

const CSRF_HEADER = { "X-Requested-With": "XMLHttpRequest" };

async function parseResponse(res, fallbackMessage) {
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error((data && data.error) || fallbackMessage);
  }
  return data;
}

async function postJson(url, body, fallbackMessage) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...CSRF_HEADER },
    body: JSON.stringify(body),
  });
  return parseResponse(res, fallbackMessage);
}

/** GET /api/storefront → { settings, games } */
export async function fetchStorefront() {
  const res = await fetch("/api/storefront");
  return parseResponse(res, "โหลดข้อมูลร้านค้าไม่สำเร็จ");
}

/** POST /api/upload-slip (raw binary body) → { url: "/uploads/<uuid>.<ext>" } */
export async function uploadSlip(file) {
  const res = await fetch("/api/upload-slip", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream", ...CSRF_HEADER },
    body: file,
  });
  return parseResponse(res, "อัปโหลดสลิปไม่สำเร็จ");
}

/** POST /api/orders → { order } */
export function createOrder(payload) {
  return postJson("/api/orders", payload, "ไม่สามารถสร้างรายการสั่งซื้อได้");
}

/** POST /api/orders/track → { order } */
export function trackOrder(orderCode, phoneLast4) {
  return postJson(
    "/api/orders/track",
    { order_code: orderCode, phone_last4: phoneLast4 },
    "ไม่พบข้อมูลออเดอร์ กรุณาตรวจสอบอีกครั้ง"
  );
}
