import React from "react";
import { formatMoney } from "../utils/helpers";

export default function ReceiptModal({
  order,
  onClose,
  onCopyText,
  onOpenTrackWithOrder,
}) {
  if (!order) return null;

  const uidDisplay = order.player_server
    ? `${order.player_uid} (${order.player_server})`
    : order.player_uid;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="receiptTitle">
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

        <div className="success-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h3
          id="receiptTitle"
          style={{ textAlign: "center", margin: "0 0 6px", fontSize: "1.3rem" }}
        >
          รับคำสั่งซื้อเรียบร้อยแล้ว!
        </h3>
        <p
          style={{
            textAlign: "center",
            margin: 0,
            fontSize: "0.9rem",
            color: "var(--muted)",
          }}
        >
          ระบบกำลังตรวจสอบสลิปและดำเนินการเติมเงินเข้า UID ของคุณใน 1–3 นาที
        </p>

        <div className="code-box">
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              รหัสออเดอร์ของคุณ
            </div>
            <div className="code-text">{order.order_code}</div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              onCopyText(order.order_code, `คัดลอกรหัสออเดอร์ ${order.order_code} แล้ว`)
            }
          >
            คัดลอกรหัส
          </button>
        </div>

        <div className="summary-list">
          <div className="sum-row">
            <span>เกม</span>
            <strong>{order.game_name}</strong>
          </div>
          <div className="sum-row">
            <span>แพ็กเกจ</span>
            <strong>{order.package_name}</strong>
          </div>
          <div className="sum-row">
            <span>UID ผู้เล่น</span>
            <strong>{uidDisplay}</strong>
          </div>
          <div className="sum-row">
            <span>ยอดชำระ</span>
            <strong style={{ color: "var(--sky-deep)" }}>
              {formatMoney(order.amount)}
            </strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => onOpenTrackWithOrder(order.order_code, order.phone_last4)}
          >
            🔍 ติดตามสถานะออเดอร์นี้
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            เสร็จสิ้น
          </button>
        </div>
      </div>
    </div>
  );
}
