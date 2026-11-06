import React from "react";
import { formatMoney, safeUrl } from "../utils/helpers";

export default function CheckoutSidebar({
  game,
  selectedPackage,
  playerUid,
  playerServer,
  settings,
  customerPhone,
  onChangePhone,
  customerLine,
  onChangeLine,
  slipPreview,
  slipStatusText,
  hasSlip,
  isUploadingSlip,
  onSlipFileSelect,
  errorMsg,
  isSubmitting,
  onCopyText,
  popTick,
}) {
  const price = selectedPackage ? Number(selectedPackage.price) || 0 : 0;
  const fullPrice = selectedPackage ? Number(selectedPackage.full_price) || 0 : 0;
  const saved = fullPrice > price ? fullPrice - price : 0;
  const savedPct = saved > 0 ? Math.round((saved / fullPrice) * 100) : 0;

  const qrUrl = safeUrl(settings.promptpay_qr_url);
  const promptpayId = settings.promptpay_id || "089-123-4567";
  const promptpayName = settings.promptpay_name || "ร้าน TopUp Station";

  const uidDisplay = playerUid.trim()
    ? playerServer.trim()
      ? `${playerUid.trim()} (${playerServer.trim()})`
      : playerUid.trim()
    : "ยังไม่ได้กรอก";

  return (
    <aside className="checkout-aside" id="stepPayPanel">
      <div className="panel">
        <div className="step-head">
          <h2 className="step-title">
            <span className="step-num">3</span>
            ตะกร้าสรุปยอด &amp; ชำระเงิน
          </h2>
          <span className="tag">PromptPay</span>
        </div>

        <div className="summary-list">
          <div className="sum-row">
            <span>เกม</span>
            <strong>{game.name}</strong>
          </div>
          <div className="sum-row">
            <span>UID ผู้เล่น</span>
            <strong>{uidDisplay}</strong>
          </div>
          <div className="sum-row">
            <span>แพ็กเกจที่เลือก</span>
            <strong>{selectedPackage ? selectedPackage.name : "ยังไม่ได้เลือก"}</strong>
          </div>
          {saved > 0 && (
            <div className="sum-row">
              <span>ส่วนลดโปรโมชั่น</span>
              <strong style={{ color: "var(--success)" }}>
                -{formatMoney(saved)} (ลด {savedPct}%)
              </strong>
            </div>
          )}
        </div>

        <div className="sum-total">
          <span className="sum-total-label">ยอดโอนสุทธิ</span>
          <strong
            key={popTick}
            className={`sum-total-price${popTick > 0 ? " is-bouncing" : ""}`}
          >
            {formatMoney(price)}
          </strong>
        </div>

        <div className="pay-box">
          <div className="pay-box-head">
            <span>สแกนหรือโอนพร้อมเพย์</span>
            <span className="tag tag-success">ฟรีค่าธรรมเนียม</span>
          </div>

          {qrUrl && (
            <div className="qr-wrap">
              <img src={qrUrl} alt="PromptPay QR Code" />
            </div>
          )}

          <div className="copy-row">
            <div>
              <div className="copy-row-label">เลขพร้อมเพย์ (PromptPay)</div>
              <div className="copy-row-value">{promptpayId}</div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                onCopyText(promptpayId, `คัดลอกเลขพร้อมเพย์ ${promptpayId} แล้ว`)
              }
            >
              คัดลอก
            </button>
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
            ชื่อบัญชี: <strong style={{ color: "var(--text-2)" }}>{promptpayName}</strong>
          </div>
        </div>

        <div className="form-stack">
          <div className="field">
            <span className="field-label">
              แนบสลิปการโอนเงิน <span className="field-req">จำเป็น</span>
            </span>
            <label className={`upload-box${hasSlip ? " has-file" : ""}`}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files && e.target.files[0];
                  if (file) onSlipFileSelect(file);
                }}
              />
              <span className="upload-title">
                {isUploadingSlip
                  ? "⏳ กำลังอัปโหลดสลิป..."
                  : hasSlip
                  ? "✅ แนบสลิปเรียบร้อยแล้ว (แตะเพื่อเปลี่ยนรูป)"
                  : "📤 แตะเพื่ออัปโหลดรูปสลิปโอนเงิน"}
              </span>
              <span className="upload-sub">{slipStatusText}</span>
              {slipPreview && (
                <img src={slipPreview} alt="ตัวอย่างสลิปโอนเงิน" className="upload-preview" />
              )}
            </label>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="customerPhoneInput">
              เบอร์โทรศัพท์ติดต่อ <span className="field-req">จำเป็น</span>
            </label>
            <input
              id="customerPhoneInput"
              type="tel"
              className="input"
              placeholder="เช่น 0812345678 (ใช้ 4 ตัวท้ายเช็คสถานะ)"
              value={customerPhone}
              onChange={(e) => onChangePhone(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="customerLineInput">
              LINE ID (ไม่บังคับ)
            </label>
            <input
              id="customerLineInput"
              type="text"
              className="input"
              placeholder="เผื่อแอดมินติดต่อกรณีข้อมูล UID ไม่ถูกต้อง"
              value={customerLine}
              onChange={(e) => onChangeLine(e.target.value)}
            />
          </div>

          {errorMsg && <div className="alert-error">⚠️ {errorMsg}</div>}

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={isSubmitting || isUploadingSlip}
          >
            {isSubmitting
              ? "กำลังส่งคำสั่งซื้อ..."
              : `⚡ ยืนยันคำสั่งซื้อ (${formatMoney(price)})`}
          </button>
        </div>
      </div>
    </aside>
  );
}
