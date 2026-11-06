import React, { useState, useEffect, useCallback } from "react";
import Navbar from "./components/Navbar";
import GameCatalog from "./components/GameCatalog";
import GameTopupPage from "./components/GameTopupPage";
import ReceiptModal from "./components/ReceiptModal";
import TrackOrderModal from "./components/TrackOrderModal";
import Footer from "./components/Footer";

export default function App() {
  const [settings, setSettings] = useState({});
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState(null);

  const [receiptOrder, setReceiptOrder] = useState(null);
  const [trackModal, setTrackModal] = useState({
    isOpen: false,
    code: "",
    last4: "",
  });
  const [toastMsg, setToastMsg] = useState("");

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(""), 2600);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const copyToClipboard = useCallback(
    async (text, successNotice) => {
      try {
        await navigator.clipboard.writeText(String(text || ""));
        showToast(successNotice || "คัดลอกข้อความเรียบร้อยแล้ว");
      } catch {
        showToast("ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาคัดลอกด้วยตนเอง");
      }
    },
    [showToast]
  );

  const syncGameFromUrl = useCallback((gameList) => {
    const params = new URLSearchParams(window.location.search);
    const gameParam = (params.get("game") || "").trim().toLowerCase();
    if (!gameParam) {
      setSelectedGame(null);
      return;
    }
    const found = gameList.find(
      (g) =>
        String(g.slug || "").toLowerCase() === gameParam ||
        String(g.id) === gameParam
    );
    setSelectedGame(found || null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStorefront() {
      try {
        const res = await fetch("/api/storefront");
        const data = await res.json();
        if (cancelled) return;

        const nextSettings = data.settings || {};
        const nextGames = Array.isArray(data.games) ? data.games : [];

        setSettings(nextSettings);
        setGames(nextGames);

        if (nextSettings.store_name) {
          document.title = `${nextSettings.store_name} — เติมเกมไว ใช้แค่ UID`;
        }

        syncGameFromUrl(nextGames);
      } catch {
        if (!cancelled) {
          showToast("โหลดข้อมูลร้านค้าไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadStorefront();
    return () => {
      cancelled = true;
    };
  }, [syncGameFromUrl, showToast]);

  useEffect(() => {
    const onPopState = () => {
      syncGameFromUrl(games);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [games, syncGameFromUrl]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setReceiptOrder(null);
        setTrackModal((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSelectGame = (game) => {
    setSelectedGame(game);
    const slugOrId = game.slug || game.id;
    window.history.pushState(
      { view: "topup", gameId: game.id },
      "",
      `?game=${encodeURIComponent(slugOrId)}`
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleGoHome = () => {
    setSelectedGame(null);
    window.history.pushState({ view: "catalog" }, "", window.location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleOpenTrack = (code = "", last4 = "") => {
    setTrackModal({ isOpen: true, code, last4 });
  };

  return (
    <>
      <Navbar
        settings={settings}
        onGoHome={handleGoHome}
        onOpenTrack={handleOpenTrack}
      />

      <main>
        {isLoading ? (
          <div className="container" style={{ padding: "72px 20px", textAlign: "center" }}>
            <div className="tag" style={{ fontSize: "0.92rem", padding: "8px 18px" }}>
              ⚡ กำลังโหลดข้อมูลร้านค้า...
            </div>
          </div>
        ) : selectedGame ? (
          <GameTopupPage
            game={selectedGame}
            settings={settings}
            onBack={handleGoHome}
            onOrderCreated={(order) => setReceiptOrder(order)}
            onCopyText={copyToClipboard}
          />
        ) : (
          <GameCatalog
            games={games}
            settings={settings}
            onSelectGame={handleSelectGame}
          />
        )}
      </main>

      <Footer
        settings={settings}
        onGoHome={handleGoHome}
        onOpenTrack={handleOpenTrack}
      />

      <ReceiptModal
        order={receiptOrder}
        onClose={() => setReceiptOrder(null)}
        onCopyText={copyToClipboard}
        onOpenTrackWithOrder={(code, last4) => {
          setReceiptOrder(null);
          handleOpenTrack(code, last4);
        }}
      />

      <TrackOrderModal
        isOpen={trackModal.isOpen}
        initialCode={trackModal.code}
        initialLast4={trackModal.last4}
        onClose={() => setTrackModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {toastMsg && (
        <div className="toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </>
  );
}
