import React from "react";

export default function Navbar({ settings, onGoHome, onOpenTrack }) {
  const storeName = settings.store_name || "TopUp Station";
  const initial = storeName.trim().charAt(0).toUpperCase() || "T";

  return (
    <>
      {settings.announcement_bar && (
        <div className="announce-bar">
          <div className="container">{settings.announcement_bar}</div>
        </div>
      )}

      <header className="site-header">
        <div className="container header-inner">
          <button type="button" className="brand-link" onClick={onGoHome}>
            <span className="brand-mark" aria-hidden="true">
              {initial}
            </span>
            <span>
              <span className="brand-title">{storeName}</span>
              <span className="brand-sub">
                {settings.store_tagline || "เติมเกมไว ปลอดภัย ใช้แค่ UID"}
              </span>
            </span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onOpenTrack()}
          >
            🔍 เช็คสถานะออเดอร์
          </button>
        </div>
      </header>
    </>
  );
}
