import React, { useState, useEffect, useRef } from "react";
import {
  formatMoney,
  getGameCoverSrc,
  makeCleanCoverSvg,
  filterFeaturedBundles,
  saveRecentOrder,
} from "../utils/helpers";
import CheckoutSidebar from "./CheckoutSidebar";

function SelectablePackageCard({
  pkg,
  isSelected,
  isPopping,
  onSelect,
  fallbackBadge,
}) {
  const price = Number(pkg.price) || 0;
  const full = Number(pkg.full_price) || 0;
  const discountPct =
    full > price ? Math.round(((full - price) / full) * 100) : 0;

  const badgeText = pkg.badge || fallbackBadge || "";
  const isHotBadge =
    badgeText === "HOT" ||
    badgeText === "VIP" ||
    badgeText === "ขายดี" ||
    badgeText === "คุ้มสุด";

  return (
    <button
      type="button"
      className={`selectable-pkg-card${isSelected ? " is-selected" : ""}${
        isPopping ? " is-popping" : ""
      }`}
      onClick={() => onSelect(pkg)}
    >
      {isSelected && (
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

      {badgeText && (
        <span className={`pkg-badge${isHotBadge ? " is-hot" : ""}`}>
          {badgeText}
        </span>
      )}

      <div>
        <div className="pkg-name">{pkg.name}</div>
        {pkg.bonus_text && <span className="pkg-bonus">✨ {pkg.bonus_text}</span>}
      </div>

      <div className="pkg-price-row">
        <span className="pkg-price">{formatMoney(price)}</span>
        {full > price && <span className="pkg-full">{formatMoney(full)}</span>}
        {discountPct > 0 && (
          <span className="pkg-discount-tag">ลด {discountPct}%</span>
        )}
      </div>
    </button>
  );
}

export default function GameTopupPage({
  game,
  settings,
  onBack,
  onOrderCreated,
  onCopyText,
}) {
  const packages = Array.isArray(game.packages) ? game.packages : [];
  const featuredBundles = filterFeaturedBundles(packages);

  const [selectedPackage, setSelectedPackage] = useState(() => {
    return packages.find((p) => p.badge === "ขายดี") || packages[0] || null;
  });
  const [poppingKey, setPoppingKey] = useState(null);
  const [popTick, setPopTick] = useState(0);
  const popTimerRef = useRef(null);

  const serverOptions = String(game.server_options || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [playerUid, setPlayerUid] = useState("");
  const [playerServer, setPlayerServer] = useState(serverOptions[0] || "");
  const [playerIgn, setPlayerIgn] = useState("");
  const [showUidHint, setShowUidHint] = useState(false);

  const [customerPhone, setCustomerPhone] = useState("");
  const [customerLine, setCustomerLine] = useState("");
  const [uploadedSlipUrl, setUploadedSlipUrl] = useState("");
  const [slipPreview, setSlipPreview] = useState("");
  const [slipStatusText, setSlipStatusText] = useState(
    "รองรับไฟล์ JPG, PNG, WEBP ขนาดไม่เกิน 5 MB"
  );
  const [isUploadingSlip, setIsUploadingSlip] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const pkgs = Array.isArray(game.packages) ? game.packages : [];
    setSelectedPackage(pkgs.find((p) => p.badge === "ขายดี") || pkgs[0] || null);
    const opts = String(game.server_options || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setPlayerServer(game.require_server ? opts[0] || "" : "");
    setShowUidHint(false);
    setErrorMsg("");
  }, [game]);

  useEffect(() => {
    return () => {
      if (popTimerRef.current) clearTimeout(popTimerRef.current);
    };
  }, []);

  const handleSelectPkg = (pkg, zone) => {
    setSelectedPackage(pkg);
    setErrorMsg("");
    setPopTick((t) => t + 1);

    const key = `${zone}-${pkg.id}`;
    setPoppingKey(null);
    requestAnimationFrame(() => {
      setPoppingKey(key);
      if (popTimerRef.current) clearTimeout(popTimerRef.current);
      popTimerRef.current = setTimeout(() => {
        setPoppingKey(null);
      }, 380);
    });
  };

  const handleSlipFileSelect = async (file) => {
    setErrorMsg("");
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("ไฟล์สลิปมีขนาดเกิน 5 MB กรุณาเลือกรูปใหม่");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSlipPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);

    setIsUploadingSlip(true);
    setSlipStatusText("กำลังตรวจสอบและอัปโหลดสลิป...");

    try {
      const res = await fetch("/api/upload-slip", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "อัปโหลดสลิปไม่สำเร็จ");
      }
      setUploadedSlipUrl(data.url);
      setSlipStatusText(`ไฟล์: ${file.name}`);
    } catch (err) {
      setUploadedSlipUrl("");
      setSlipPreview("");
      setSlipStatusText("รองรับไฟล์ JPG, PNG, WEBP ขนาดไม่เกิน 5 MB");
      setErrorMsg(err.message || "ไม่สามารถอัปโหลดสลิปได้");
    } finally {
      setIsUploadingSlip(false);
    }
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!selectedPackage) {
      setErrorMsg("กรุณาเลือกแพ็กเกจหรือบันเดิลที่ต้องการเติมก่อน");
      return;
    }

    if (!playerUid.trim()) {
      setErrorMsg(`กรุณากรอก ${game.uid_label || "UID ผู้เล่น"} ให้ครบถ้วน`);
      document.getElementById("playerUidInput")?.focus();
      return;
    }

    if (game.require_server && !playerServer.trim()) {
      setErrorMsg("กรุณาเลือกหรือระบุเซิร์ฟเวอร์ของตัวละคร");
      return;
    }

    const digitsPhone = customerPhone.replace(/\D/g, "");
    if (digitsPhone.length < 9) {
      setErrorMsg("กรุณากรอกเบอร์โทรศัพท์ติดต่อให้ถูกต้อง (อย่างน้อย 9 หลัก)");
      document.getElementById("customerPhoneInput")?.focus();
      return;
    }

    if (!uploadedSlipUrl) {
      setErrorMsg("กรุณาแนบรูปสลิปการโอนเงินก่อนยืนยันคำสั่งซื้อ");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        package_id: selectedPackage.id,
        player_uid: playerUid.trim(),
        player_server: game.require_server ? playerServer.trim() : "",
        player_ign: playerIgn.trim(),
        customer_phone: customerPhone.trim(),
        customer_line: customerLine.trim(),
        payment_slip_url: uploadedSlipUrl,
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ไม่สามารถสร้างรายการสั่งซื้อได้");
      }

      saveRecentOrder(
        data.order.order_code,
        data.order.phone_last4,
        data.order.game_name
      );

      setUploadedSlipUrl("");
      setSlipPreview("");
      setSlipStatusText("รองรับไฟล์ JPG, PNG, WEBP ขนาดไม่เกิน 5 MB");

      onOrderCreated(data.order);
    } catch (err) {
      setErrorMsg(err.message || "เกิดข้อผิดพลาดในการส่งคำสั่งซื้อ");
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToPayPanel = () => {
    document
      .getElementById("stepPayPanel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="topup-page">
      <div className="container">
        {/* Top Back Button & Breadcrumb */}
        <div className="topup-nav-bar">
          <button type="button" className="topup-back-btn" onClick={onBack}>
            ← กลับไปเลือกเกมอื่น
          </button>

          <nav className="topup-breadcrumb" aria-label="Breadcrumb">
            <button type="button" onClick={onBack}>
              หน้ารวมเกม
            </button>
            <span>/</span>
            <strong style={{ color: "var(--sky-deep)" }}>{game.name}</strong>
          </nav>
        </div>

        {/* Vibrant Game Banner */}
        <div className="topup-game-banner">
          <img
            src={getGameCoverSrc(game)}
            alt={game.name}
            className="topup-game-cover"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = makeCleanCoverSvg(game);
            }}
          />
          <div>
            <div className="topup-game-tags">
              <span className="tag">{game.publisher || "Official Direct"}</span>
              {game.category && (
                <span className="tag tag-ghost">{game.category}</span>
              )}
              {game.discount_badge && (
                <span className="tag tag-danger">🔥 {game.discount_badge}</span>
              )}
            </div>
            <h1 className="topup-game-title">{game.name}</h1>
            <p className="topup-game-sub">
              เลือกแพ็กเกจ <strong>{game.currency_name || "หน่วยเงินในเกม"}</strong>{" "}
              แล้วกรอก {game.uid_label || "UID"} เพื่อรับของเข้าไอดีทันที
            </p>
          </div>
        </div>

        {/* 2-Column Top-Up & Basket Form */}
        <form className="checkout-layout" onSubmit={handleSubmitOrder} noValidate>
          <div className="checkout-main">
            {/* Step 1: Featured Bundles + All Packages */}
            <section className="panel">
              <div className="step-head">
                <h2 className="step-title">
                  <span className="step-num">1</span>
                  เลือกแพ็กเกจ / บันเดิลที่ต้องการเติม
                </h2>
                <span className="tag">แตะเพื่อเลือกแพ็กเกจ</span>
              </div>

              {featuredBundles.length > 0 && (
                <div className="featured-bundle-box">
                  <div className="featured-bundle-header">
                    <strong style={{ color: "var(--sky-deep)", fontSize: "0.96rem" }}>
                      🔥 บันเดิลใหม่ &amp; แพ็กแนะนำสุดคุ้ม
                    </strong>
                    <span className="tag tag-danger">แนะนำพิเศษ</span>
                  </div>
                  <div className="featured-bundle-grid">
                    {featuredBundles.map((pkg) => (
                      <SelectablePackageCard
                        key={`bundle-${pkg.id}`}
                        pkg={pkg}
                        fallbackBadge="แนะนำ"
                        isSelected={selectedPackage?.id === pkg.id}
                        isPopping={poppingKey === `bundle-${pkg.id}`}
                        onSelect={(p) => handleSelectPkg(p, "bundle")}
                      />
                    ))}
                  </div>
                </div>
              )}

              {packages.length === 0 ? (
                <div className="empty-box">
                  ยังไม่มีแพ็กเกจเปิดจำหน่ายสำหรับเกมนี้ในขณะนี้
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: "0.86rem",
                      fontWeight: 700,
                      color: "var(--muted)",
                      marginBottom: "10px",
                    }}
                  >
                    แพ็กเกจ {game.currency_name || "เติมเกม"} ทั้งหมด ({packages.length}{" "}
                    รายการ)
                  </div>
                  <div className="packages-grid">
                    {packages.map((pkg) => (
                      <SelectablePackageCard
                        key={`pkg-${pkg.id}`}
                        pkg={pkg}
                        isSelected={selectedPackage?.id === pkg.id}
                        isPopping={poppingKey === `pkg-${pkg.id}`}
                        onSelect={(p) => handleSelectPkg(p, "pkg")}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Step 2: Player UID & Server */}
            <section className="panel">
              <div className="step-head">
                <h2 className="step-title">
                  <span className="step-num">2</span>
                  กรอกข้อมูลบัญชีในเกม ({game.uid_label || "UID"})
                </h2>
                {game.uid_hint && (
                  <button
                    type="button"
                    className="hint-toggle"
                    onClick={() => setShowUidHint((v) => !v)}
                  >
                    💡 {showUidHint ? "ซ่อนวิธีดู UID" : "วิธีดู UID"}
                  </button>
                )}
              </div>

              {showUidHint && game.uid_hint && (
                <div className="alert-info" style={{ marginBottom: "14px" }}>
                  <strong>วิธีดู {game.uid_label || "UID"}:</strong> {game.uid_hint}
                </div>
              )}

              <div className="uid-grid">
                <div className="field">
                  <label className="field-label" htmlFor="playerUidInput">
                    {game.uid_label || "UID ผู้เล่น"}{" "}
                    <span className="field-req">จำเป็น</span>
                  </label>
                  <input
                    id="playerUidInput"
                    type="text"
                    className="input"
                    placeholder={
                      game.uid_placeholder || "กรอก UID หรือ Riot ID ของคุณ..."
                    }
                    value={playerUid}
                    onChange={(e) => setPlayerUid(e.target.value)}
                  />
                </div>

                {Boolean(game.require_server) && (
                  <div className="field">
                    <label className="field-label" htmlFor="playerServerField">
                      เซิร์ฟเวอร์ (Server) <span className="field-req">จำเป็น</span>
                    </label>
                    {serverOptions.length > 0 ? (
                      <select
                        id="playerServerField"
                        className="select"
                        value={playerServer}
                        onChange={(e) => setPlayerServer(e.target.value)}
                      >
                        {serverOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="playerServerField"
                        type="text"
                        className="input"
                        placeholder="ระบุเซิร์ฟเวอร์ของคุณ"
                        value={playerServer}
                        onChange={(e) => setPlayerServer(e.target.value)}
                      />
                    )}
                  </div>
                )}

                <div className="field">
                  <label className="field-label" htmlFor="playerIgnInput">
                    ชื่อตัวละครในเกม (ไม่บังคับ)
                  </label>
                  <input
                    id="playerIgnInput"
                    type="text"
                    className="input"
                    placeholder="ช่วยให้แอดมินตรวจสอบความถูกต้องได้แม่นยำขึ้น"
                    value={playerIgn}
                    onChange={(e) => setPlayerIgn(e.target.value)}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Step 3: Basket Summary & Payment Sidebar */}
          <CheckoutSidebar
            game={game}
            selectedPackage={selectedPackage}
            playerUid={playerUid}
            playerServer={game.require_server ? playerServer : ""}
            settings={settings}
            customerPhone={customerPhone}
            onChangePhone={setCustomerPhone}
            customerLine={customerLine}
            onChangeLine={setCustomerLine}
            slipPreview={slipPreview}
            slipStatusText={slipStatusText}
            hasSlip={Boolean(uploadedSlipUrl)}
            isUploadingSlip={isUploadingSlip}
            onSlipFileSelect={handleSlipFileSelect}
            errorMsg={errorMsg}
            isSubmitting={isSubmitting}
            onCopyText={onCopyText}
            popTick={popTick}
          />
        </form>
      </div>

      {/* Mobile Sticky Checkout Bar */}
      <div className="mobile-bar">
        <div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
            {selectedPackage ? selectedPackage.name : "เลือกแพ็กเกจด้านบน"}
          </div>
          <strong style={{ fontSize: "1.12rem", color: "var(--sky-deep)" }}>
            {formatMoney(selectedPackage ? selectedPackage.price : 0)}
          </strong>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={scrollToPayPanel}
        >
          ไปหน้าชำระเงิน ↓
        </button>
      </div>
    </div>
  );
}
