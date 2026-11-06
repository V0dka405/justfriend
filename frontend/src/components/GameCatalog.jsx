import React, { useState, useRef, useEffect } from "react";
import { getGameCoverSrc, makeCleanCoverSvg } from "../utils/helpers";

export default function GameCatalog({ games, settings, onSelectGame }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [poppingGameId, setPoppingGameId] = useState(null);
  const clickTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  const handleGameTileClick = (game) => {
    setPoppingGameId(game.id);
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      onSelectGame(game);
    }, 210);
  };

  const categories = ["all"];
  for (const g of games) {
    if (g.category && !categories.includes(g.category)) {
      categories.push(g.category);
    }
  }

  const q = searchQuery.trim().toLowerCase();
  const filteredGames = games.filter((g) => {
    if (activeCategory !== "all" && g.category !== activeCategory) return false;
    if (!q) return true;
    return (
      String(g.name || "").toLowerCase().includes(q) ||
      String(g.publisher || "").toLowerCase().includes(q) ||
      String(g.currency_name || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="catalog-page">
      <section className="hero">
        <div className="container">
          <span className="tag">⚡ {settings.hero_kicker || "DIRECT UID TOP-UP"}</span>
          <h1 className="hero-title">
            {settings.hero_heading || "เลือกเกมที่ต้องการเติมเงิน"}
          </h1>
          <p className="hero-sub">
            {settings.hero_subtext ||
              "แตะที่ไอคอนเกมเพื่อดูบันเดิลแนะนำและเลือกแพ็กเกจราคาพิเศษ เติมไวใน 1–3 นาที"}
          </p>

          <div className="trust-row">
            <span className="trust-pill">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
              เติมไวใน 1–3 นาที
            </span>
            <span className="trust-pill">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
              ใช้แค่ UID ไม่ขอรหัสผ่าน
            </span>
            <span className="trust-pill">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
              {settings.open_hours || "เปิดทุกวัน 09:00 – 02:00 น."}
            </span>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="game-toolbar">
          <div className="chip-row" role="tablist" aria-label="หมวดหมู่เกม">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={cat === activeCategory ? "chip is-active" : "chip"}
                onClick={() => setActiveCategory(cat)}
              >
                {cat === "all" ? "🎮 เกมทั้งหมด" : cat}
              </button>
            ))}
          </div>

          <div className="search-wrap">
            <input
              type="search"
              className="input"
              placeholder="ค้นหาชื่อเกม..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <div className="empty-box">
            ไม่พบเกมที่ค้นหา ลองพิมพ์คำอื่นหรือเลือกหมวด &ldquo;เกมทั้งหมด&rdquo;
          </div>
        ) : (
          <div className="games-icon-grid">
            {filteredGames.map((game) => {
              const isPopping = poppingGameId === game.id;
              return (
                <button
                  key={game.id}
                  type="button"
                  className={`game-icon-tile${isPopping ? " is-selected is-popping" : ""}`}
                  onClick={() => handleGameTileClick(game)}
                >
                  {isPopping && (
                    <span className="pkg-selected-check" aria-hidden="true">
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  )}
                  {game.discount_badge && (
                    <span className="game-tile-promo">{game.discount_badge}</span>
                  )}
                  <div className="game-icon-box">
                    <img
                      src={getGameCoverSrc(game)}
                      alt={game.name}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = makeCleanCoverSvg(game);
                      }}
                    />
                  </div>
                  <strong className="game-tile-name">{game.name}</strong>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
