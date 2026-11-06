import React, { useState, useEffect } from "react";
import { STATUS_LABELS, formatMoney, getRecentOrders } from "../utils/helpers";

export default function TrackOrderModal({
  isOpen,
  initialCode = "",
  initialLast4 = "",
  onClose,
}) {
  const [orderCode, setOrderCode] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [recentOrders, setRecentOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [trackedOrder, setTrackedOrder] = useState(null);

  const lookupOrder = async (code, last4) => {
    const cleanCode = String(code || "").trim();
    const cleanLast4 = String(last4 || "").trim();
    if (!cleanCode || !cleanLast4) {
      setErrorMsg("กรุณากรอกรหัสออเดอร์และเลขท้ายเบอร์โทร 4 ตัว");
      return;
    }

    setErrorMsg("");
    setTrackedOrder(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/orders/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          order_code: cleanCode,
          phone_last4: cleanLast4,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ไม่พบข้อมูลออเดอร์ กรุณาตรวจสอบอีกครั้ง");
      }
      setTrackedOrder(data.order);
    } catch (err) {
      setErrorMsg(err.message || "ไม่สามารถตรวจสอบสถานะออเดอร์ได้");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setRecentOrders(getRecentOrders());
    setErrorMsg("");
    setTrackedOrder(null);
    setOrderCode(initialCode || "");
    setPhoneLast4(initialLast4 || "");

    if (initialCode && initialLast4) {
      lookupOrder(initialCode, initialLast4);
    }
  }, [isOpen, initialCode, initialLast4]);

  if (!isOpen) return null;

  const status = trackedOrder?.status || "pending";
  const s1 = status === "pending" ? "is-current" : "is-done";
  const s2 =
    status === "processing"
      ? "is-current"
      : status === "completed"
      ? "is-done"
      : "";
  const s3 = status === "completed" ? "is-done" : "";

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="trackModalTitle">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-dialog">
        <button
          type="button"
          className="modal-close"
          aria-label="ปิดหน้าต่าง"
          onClick={onClose}
        >
          ✕
        </button>

        <h3 id="trackModalTitle" style={{ margin: "0 0 6px", fontSize: "1.25rem" }}>
          🔍 เช็คสถานะคำสั่งซื้อ
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: "0.88rem", color: "var(--muted)" }}>
          กรอกรหัสออเดอร์และเลขท้ายเบอร์โทร 4 ตัวที่ใช้สั่งซื้อ
        </p>

        {recentOrders.length > 0 && (
          <div style={{ marginBottom: "14px" }}>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>
              รายการสั่งซื้อล่าสุดในเครื่องนี้:
            </div>
            <div className="recent-chips">
              {recentOrders.map((item) => (
                <button
                  key={item.order_code}
                  type="button"
                  className="recent-chip"
                  onClick={() => {
                    setOrderCode(item.order_code);
                    setPhoneLast4(item.phone_last4);
                    lookupOrder(item.order_code, item.phone_last4);
                  }}
                >
                  {item.order_code} ({item.game_name})
                </button>
              ))}
            </div>
          </div>
        )}

        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            lookupOrder(orderCode, phoneLast4);
          }}
        >
          <div className="uid-grid">
            <div className="field">
              <label className="field-label" htmlFor="trackCodeInput">
                รหัสออเดอร์
              </label>
              <input
                id="trackCodeInput"
                type="text"
                className="input"
                placeholder="เช่น TP-2026..."
                value={orderCode}
                onChange={(e) => setOrderCode(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="trackLast4Input">
                เลขท้ายเบอร์โทร 4 ตัว
              </label>
              <input
                id="trackLast4Input"
                type="text"
                maxLength={4}
                className="input"
                placeholder="เช่น 5678"
                value={phoneLast4}
                onChange={(e) => setPhoneLast4(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isLoading}
          >
            {isLoading ? "กำลังค้นหาข้อมูล..." : "ตรวจสอบสถานะ"}
          </button>
        </form>

        {errorMsg && (
          <div className="alert-error" style={{ marginTop: "14px" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {trackedOrder && (
          <div
            className="pay-box"
            style={{ marginTop: "18px", marginBottom: 0, background: "#f8fcff" }}
          >
            <div className="pay-box-head" style={{ marginBottom: "8px" }}>
              <span style={{ color: "var(--sky-deep)", fontWeight: 800 }}>
                {trackedOrder.order_code}
              </span>
              <span className={`status-pill status-${status}`}>
                {STATUS_LABELS[status] || status}
              </span>
            </div>

            {status === "cancelled" ? (
              <div className="alert-error" style={{ marginBottom: "12px" }}>
                รายการนี้ถูกยกเลิกแล้ว
              </div>
            ) : (
              <div className="progress-steps">
                <div className={`progress-step ${s1}`}>1. รับสลิปแล้ว</div>
                <div className={`progress-step ${s2}`}>2. กำลังเติม UID</div>
                <div className={`progress-step ${s3}`}>3. เติมสำเร็จ</div>
              </div>
            )}

            <div className="summary-list" style={{ marginBottom: 0, borderBottom: "none", paddingBottom: 0 }}>
              <div className="sum-row">
                <span>รายการ</span>
                <strong>
                  {trackedOrder.game_name} — {trackedOrder.package_name}
                </strong>
              </div>
              <div className="sum-row">
                <span>UID ผู้เล่น</span>
                <strong>
                  {trackedOrder.player_server
                    ? `${trackedOrder.player_uid} (${trackedOrder.player_server})`
                    : trackedOrder.player_uid}
                </strong>
              </div>
              <div className="sum-row">
                <span>ยอดชำระ</span>
                <strong style={{ color: "var(--sky-deep)" }}>
                  {formatMoney(trackedOrder.amount)}
                </strong>
              </div>
              {trackedOrder.admin_note && (
                <div className="alert-info" style={{ marginTop: "8px" }}>
                  <strong>หมายเหตุจากแอดมิน:</strong> {trackedOrder.admin_note}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
