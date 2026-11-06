import React from "react";

export default function Footer({ settings, onGoHome, onOpenTrack }) {
  const storeName = settings.store_name || "TopUp Station";

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <strong style={{ fontSize: "1.05rem", display: "block", marginBottom: "6px" }}>
              {storeName}
            </strong>
            <p style={{ margin: "0 0 8px", fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.55 }}>
              บริการเติมเกมออนไลน์ผ่าน UID สะดวก ปลอดภัย ไม่ต้องใช้รหัสผ่าน
              พร้อมระบบตรวจสอบสถานะออเดอร์แบบเรียลไทม์
            </p>
            <span className="tag">
              🕒 {settings.open_hours || "เปิดบริการทุกวัน 09:00 – 02:00 น."}
            </span>
          </div>

          <div>
            <div className="footer-heading">เมนูลัด</div>
            <div className="footer-links">
              <button type="button" onClick={onGoHome}>
                🎮 เลือกเกมทั้งหมด
              </button>
              <button type="button" onClick={() => onOpenTrack()}>
                🔍 เช็คสถานะคำสั่งซื้อ
              </button>
              <a href="/admin">🔐 ระบบจัดการหลังบ้าน (Admin)</a>
            </div>
          </div>

          <div>
            <div className="footer-heading">ติดต่อฝ่ายบริการลูกค้า</div>
            <div className="footer-links">
              <span>💬 LINE: {settings.contact_line || "@topupstation"}</span>
              <span>📘 Facebook: {settings.contact_facebook || "TopUp Station"}</span>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          © {new Date().getFullYear()} {storeName} — Powered by React &amp; Clean Layered Architecture
        </div>
      </div>
    </footer>
  );
}
