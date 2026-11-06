/**
 * Layer: Frontend Admin — Control Room Application (/admin)
 *
 * โครงสร้างไฟล์ (สำหรับทีมพัฒนา):
 *   1. State & Formatting / Escaping Helpers
 *   2. Custom Confirm Dialog & Toast Notification
 *   3. Admin API Client (แนบ X-Requested-With อัตโนมัติ)
 *   4. Screen & Tab Navigation
 *   5. Tab 1: Overview & Quick Promo Controller
 *   6. Tab 2: Orders Fulfillment
 *   7. Tab 3: Games & Packages Pricing Studio
 *   8. Tab 4: Store Settings, Password & Database Health
 *   9. DOM Event Delegation & Bootstrap
 */
(() => {
  "use strict";

  let adminStats = {};
  let storeSettings = {};
  let adminGames = [];
  let adminOrders = [];
  let activeCategory = "all";
  let gameSearchQuery = "";
  let selectedGameId = null;

  const STATUS_LABELS = {
    pending: "รอตรวจสลิป",
    processing: "กำลังเติม UID",
    completed: "เติมสำเร็จแล้ว",
    cancelled: "ยกเลิกรายการ",
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeUrl(raw) {
    const val = String(raw || "").trim();
    if (!val) return "";
    if (val.startsWith("/uploads/") || val.startsWith("/images/")) return val;
    if (/^https?:\/\//i.test(val)) return val;
    return "";
  }

  function safeSlipUrl(raw) {
    const val = String(raw || "").trim();
    if (/^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i.test(val)) {
      return val;
    }
    return "";
  }

  function formatMoney(num) {
    const val = Number(num) || 0;
    return `฿${val.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
  }

  function formatDateTime(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("th-TH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function makeCleanThumbSvg(game) {
    const accent = /^#[0-9a-fA-F]{6}$/.test(game?.accent_color || "")
      ? game.accent_color
      : "#2563eb";
    const rawInitial = (game?.name || "G").trim().charAt(0).toUpperCase();
    const initial = escapeHtml(rawInitial);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90">
      <rect width="120" height="90" fill="#0f172a" rx="8"/>
      <circle cx="60" cy="45" r="28" fill="${accent}" opacity="0.25"/>
      <text x="60" y="54" text-anchor="middle" fill="#ffffff" font-family="Inter, sans-serif" font-weight="700" font-size="24">${initial}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function getGameThumb(game) {
    const clean = safeUrl(game?.image_url);
    if (!clean) return makeCleanThumbSvg(game);
    if (clean.startsWith("/images/")) return `${clean}?v=4`;
    return clean;
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
  }

  function showCustomConfirm(options = {}) {
    const opts = typeof options === "string" ? { message: options } : options;
    const {
      title = "ยืนยันการทำรายการ",
      tag = "CONFIRMATION",
      message = "คุณแน่ใจหรือไม่ว่าต้องการดำเนินการนี้?",
      subtext = "",
      confirmText = "ยืนยัน",
      cancelText = "ยกเลิก",
      type = "warning", // "warning" | "danger" | "info"
    } = opts;

    return new Promise((resolve) => {
      const modal = document.getElementById("confirmDialogModal");
      const backdrop = document.getElementById("confirmDialogBackdrop");
      const iconWrap = document.getElementById("confirmIconWrap");
      const tagEl = document.getElementById("confirmTag");
      const titleEl = document.getElementById("confirmTitle");
      const msgEl = document.getElementById("confirmMessage");
      const subBox = document.getElementById("confirmSubBox");
      const subTextEl = document.getElementById("confirmSubText");
      const okBtn = document.getElementById("confirmOkBtn");
      const cancelBtn = document.getElementById("confirmCancelBtn");
      const actionsEl = document.getElementById("confirmActions");

      if (!modal || !okBtn) {
        resolve(window.confirm(message));
        return;
      }

      let btnClass = "btn-warning-action";
      let tagClass = "tag-warning";
      let iconSvg = "";

      if (type === "warning") {
        btnClass = "btn-warning-action";
        tagClass = "tag-warning";
        iconSvg = `
          <div class="confirm-icon-circle is-warning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
        `;
      } else if (type === "danger") {
        btnClass = "btn-danger-action";
        tagClass = "tag-danger";
        iconSvg = `
          <div class="confirm-icon-circle is-danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </div>
        `;
      } else {
        btnClass = "btn-info-action";
        tagClass = "tag-info";
        iconSvg = `
          <div class="confirm-icon-circle is-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
        `;
      }

      iconWrap.innerHTML = iconSvg;
      tagEl.className = `tag confirm-tag ${tagClass}`;
      tagEl.textContent = tag;
      titleEl.textContent = title;
      msgEl.innerHTML = escapeHtml(message).replace(/\n/g, "<br>");

      if (subtext) {
        subTextEl.textContent = subtext;
        subBox.hidden = false;
      } else {
        subBox.hidden = true;
      }

      okBtn.className = `btn ${btnClass} confirm-btn-ok`;
      okBtn.textContent = confirmText;

      if (cancelText === null) {
        cancelBtn.hidden = true;
        if (actionsEl) actionsEl.classList.add("single-action");
      } else {
        cancelBtn.hidden = false;
        cancelBtn.textContent = cancelText;
        if (actionsEl) actionsEl.classList.remove("single-action");
      }

      modal.hidden = false;
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      okBtn.focus();

      function cleanup(result) {
        modal.hidden = true;
        document.body.style.overflow = prevOverflow;
        window.removeEventListener("keydown", onKeyDown);
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        backdrop.onclick = null;
        resolve(result);
      }

      function onKeyDown(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          cleanup(false);
        } else if (e.key === "Enter" && document.activeElement !== cancelBtn) {
          e.preventDefault();
          cleanup(true);
        }
      }

      okBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
      backdrop.onclick = () => cleanup(false);
      window.addEventListener("keydown", onKeyDown);
    });
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.textContent = val;
  }

  async function apiFetch(url, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (method !== "GET" && method !== "HEAD") {
      headers["X-Requested-With"] = "XMLHttpRequest";
    }
    if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.json);
      delete options.json;
    }

    const res = await fetch(url, {
      credentials: "same-origin",
      ...options,
      method,
      headers,
    });

    let data = {};
    try {
      data = await res.json();
    } catch {}

    if (!res.ok) {
      if (res.status === 401 && url !== "/api/admin/login") {
        showLoginScreen();
      }
      throw new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
    }
    return data;
  }

  // ---------------------------------------------------------------------------
  // Screen & Tab Navigation
  // ---------------------------------------------------------------------------
  function showLoginScreen() {
    document.getElementById("adminLoginView").hidden = false;
    document.getElementById("adminAppView").hidden = true;
  }

  function showDashboardScreen(admin) {
    document.getElementById("adminLoginView").hidden = true;
    document.getElementById("adminAppView").hidden = false;
    if (admin?.username) {
      setText("adminUserLabel", admin.username);
    }
  }

  function switchTab(tabName) {
    document.querySelectorAll(".admin-nav-btn[data-tab]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-tab") === tabName);
    });
    ["overview", "orders", "games", "settings"].forEach((t) => {
      const sec = document.getElementById(`tab-${t}`);
      if (sec) sec.hidden = t !== tabName;
    });
    if (tabName === "settings") {
      loadDatabaseHealth();
    }
  }

  // ---------------------------------------------------------------------------
  // Load & Render Admin Data
  // ---------------------------------------------------------------------------
  async function loadOverviewData() {
    const data = await apiFetch("/api/admin/overview");
    if (data.admin) showDashboardScreen(data.admin);

    adminStats = data.stats || {};
    storeSettings = data.settings || {};
    adminGames = Array.isArray(data.games) ? data.games : [];
    adminOrders = Array.isArray(data.orders) ? data.orders : [];

    setText("adminBrandName", storeSettings.store_name || "TopUp Station");
    setText("navGamesBadge", String(adminGames.length));

    const pendingBadge = document.getElementById("navPendingBadge");
    const pendingCnt = Number(adminStats.pending_orders) || 0;
    pendingBadge.textContent = String(pendingCnt);
    pendingBadge.hidden = pendingCnt <= 0;

    if (adminGames.length > 0) {
      if (
        !selectedGameId ||
        (selectedGameId !== "all" && !adminGames.some((g) => g.id === Number(selectedGameId)))
      ) {
        selectedGameId = adminGames[0].id;
      }
    }

    renderOverviewTab();
    renderOrdersTab();
    renderGamesTab();
    populateSettingsForm();
  }

  function renderOverviewPromo() {
    const grid = document.getElementById("overviewPromoGamesGrid");
    if (!grid) return;
    if (adminGames.length === 0) {
      grid.innerHTML = `<div class="muted">ยังไม่มีเกมในระบบ</div>`;
      return;
    }
    grid.innerHTML = adminGames
      .map((g) => {
        const hasDiscount = Boolean(g.discount_badge);
        return `
          <div class="promo-game-item">
            <div style="display:flex; align-items:center; gap:10px; min-width:0;">
              <img src="${escapeHtml(getGameThumb(g))}" alt="" style="width:38px; height:28px; object-fit:cover; border-radius:4px; flex-shrink:0; background:#f1f5f9;" />
              <div style="min-width:0;">
                <strong style="font-size:0.88rem; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(g.name)}</strong>
                <span style="font-size:0.75rem; color:${hasDiscount ? "var(--danger)" : "var(--muted)"}; font-weight:${hasDiscount ? "700" : "400"};">
                  ${escapeHtml(g.discount_badge || "ราคาปกติ (ไม่มีส่วนลด)")}
                </span>
              </div>
            </div>
            <div style="display:flex; gap:3px; flex-shrink:0;">
              <button type="button" class="btn-micro" data-apply-game-pct="${g.id}" data-pct="0" title="คืนราคาปกติ">0%</button>
              <button type="button" class="btn-micro" data-apply-game-pct="${g.id}" data-pct="10" title="ลด 10%">10%</button>
              <button type="button" class="btn-micro" data-apply-game-pct="${g.id}" data-pct="15" title="ลด 15%">15%</button>
              <button type="button" class="btn-micro" data-apply-game-pct="${g.id}" data-pct="20" title="ลด 20%">20%</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function syncCatalogKpiFromGames() {
    let activeGames = 0;
    let activePkgs = 0;
    let totalPkgs = 0;
    for (const g of adminGames) {
      if (g.is_active) activeGames += 1;
      const pkgs = Array.isArray(g.packages) ? g.packages : [];
      totalPkgs += pkgs.length;
      for (const p of pkgs) {
        if (p.is_active) activePkgs += 1;
      }
    }
    adminStats.total_games = adminGames.length;
    adminStats.active_games = activeGames;
    adminStats.total_packages = totalPkgs;
    adminStats.active_packages = activePkgs;
    setText("navGamesBadge", String(adminGames.length));
    setText("kpiCatalog", `${activeGames} เกม / ${activePkgs} แพ็ก`);
  }

  function renderOverviewTab() {
    setText("kpiRevenue", formatMoney(adminStats.revenue));
    setText("kpiPending", String(adminStats.pending_orders || 0));
    setText("kpiCompleted", String(adminStats.completed_orders || 0));
    setText(
      "kpiCatalog",
      `${adminStats.active_games || 0} เกม / ${adminStats.active_packages || 0} แพ็ก`
    );

    renderOverviewPromo();

    const recentBox = document.getElementById("recentOrdersBox");
    const recent = adminOrders.slice(0, 6);
    if (recent.length === 0) {
      recentBox.innerHTML = `
        <p class="muted" style="margin:8px 0;">
          ยังไม่มีรายการแจ้งเติมเกม เมื่อลูกค้าส่งสลิปหน้าร้าน ออเดอร์จะแสดงที่นี่ทันที
        </p>
      `;
      return;
    }

    recentBox.innerHTML = recent
      .map((o) => {
        const st = escapeHtml(o.status || "pending");
        const stLabel = escapeHtml(STATUS_LABELS[o.status] || o.status);
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:10px 0; border-bottom:1px solid var(--border);">
            <div>
              <strong style="font-size:0.9rem;">${escapeHtml(o.order_code)}</strong>
              <span style="margin-left:8px; font-weight:600;">${escapeHtml(o.game_name)} · ${escapeHtml(o.package_name)}</span>
              <div class="muted" style="font-size:0.82rem;">
                UID: <strong style="color:var(--text);">${escapeHtml(o.player_uid)}</strong> ${o.player_server ? `(${escapeHtml(o.player_server)})` : ""} · ${escapeHtml(formatDateTime(o.created_at))}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
              <strong class="num">${formatMoney(o.amount)}</strong>
              <span class="status-pill status-${st}">${stLabel}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // ---------------------------------------------------------------------------
  // Tab 2: Orders Fulfillment
  // ---------------------------------------------------------------------------
  function renderOrdersTab() {
    const listEl = document.getElementById("adminOrdersList");
    const filter = document.getElementById("adminOrderFilter").value || "all";

    const filtered = adminOrders.filter((o) => filter === "all" || o.status === filter);
    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="card" style="padding:36px; text-align:center; color:var(--muted);">
          ไม่มีรายการในสถานะนี้
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered
      .map((o) => {
        const st = escapeHtml(o.status || "pending");
        const stLabel = escapeHtml(STATUS_LABELS[o.status] || o.status);
        const slipUrl = safeSlipUrl(o.payment_slip_url);
        const slipBtn = slipUrl
          ? `<a href="${escapeHtml(slipUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="margin-top:6px;">
               ดูสลิปโอนเงิน ↗
             </a>`
          : `<span class="muted" style="font-size:0.84rem;">ไม่พบรูปสลิป</span>`;

        const statusOptions = Object.entries(STATUS_LABELS)
          .map(
            ([val, label]) =>
              `<option value="${escapeHtml(val)}" ${o.status === val ? "selected" : ""}>${escapeHtml(label)}</option>`
          )
          .join("");

        return `
          <article class="card admin-order-card">
            <div class="order-card-head">
              <div>
                <strong style="font-size:1.02rem;">${escapeHtml(o.order_code)}</strong>
                <span class="muted" style="margin-left:10px; font-size:0.84rem;">
                  สั่งเมื่อ ${escapeHtml(formatDateTime(o.created_at))}
                </span>
              </div>
              <span class="status-pill status-${st}">${stLabel}</span>
            </div>

            <div class="order-card-grid">
              <div>
                <div class="muted" style="font-size:0.82rem;">ไอดีผู้เล่น:</div>
                <div class="uid-copy-strip">
                  <strong class="uid-copy-text">${escapeHtml(o.player_uid)}</strong>
                  <button type="button" class="btn btn-secondary btn-sm" data-copy-uid="${escapeHtml(o.player_uid)}">
                    คัดลอก UID
                  </button>
                </div>
                ${
                  o.player_server
                    ? `<div style="font-size:0.88rem;"><strong>Server:</strong> ${escapeHtml(o.player_server)}</div>`
                    : ""
                }
                ${
                  o.player_ign
                    ? `<div style="font-size:0.88rem;"><strong>ชื่อในเกม:</strong> ${escapeHtml(o.player_ign)}</div>`
                    : ""
                }
                <div class="muted" style="font-size:0.84rem; margin-top:4px;">
                  โทร: <strong style="color:var(--text);">${escapeHtml(o.customer_phone)}</strong>
                  ${o.customer_line ? ` · LINE/หมายเหตุ: ${escapeHtml(o.customer_line)}` : ""}
                </div>
              </div>

              <div>
                <div class="muted" style="font-size:0.8rem;">
                  ${escapeHtml(o.game_name)}
                </div>
                <div style="font-size:1.05rem; font-weight:700; margin:2px 0;">
                  ${escapeHtml(o.package_name)}
                </div>
                <div class="num" style="font-size:1.15rem; font-weight:700; color:var(--primary); margin-bottom:6px;">
                  ${formatMoney(o.amount)}
                </div>
                ${slipBtn}
              </div>

              <div class="order-action-box">
                <label class="field-label" style="font-size:0.82rem;">
                  สถานะออเดอร์
                </label>
                <select class="select" data-order-status="${o.id}">
                  ${statusOptions}
                </select>

                <label class="field-label" style="font-size:0.82rem; margin-top:2px;">
                  ข้อความแจ้งลูกค้า (แสดงในหน้าเช็คสถานะ)
                </label>
                <input
                  type="text"
                  class="input"
                  data-order-note="${o.id}"
                  placeholder="เช่น เติมเรียบร้อย ขอบคุณครับ"
                  value="${escapeHtml(o.admin_note || "")}"
                />

                <button type="button" class="btn btn-primary btn-block" data-save-order="${o.id}">
                  บันทึกสถานะ
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function saveOrderUpdate(orderId, btn) {
    const statusSel = document.querySelector(`select[data-order-status="${orderId}"]`);
    const noteIn = document.querySelector(`input[data-order-note="${orderId}"]`);
    if (!statusSel || !noteIn) return;

    btn.disabled = true;
    try {
      const res = await apiFetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: "PUT",
        json: {
          status: statusSel.value,
          admin_note: noteIn.value.trim(),
        },
      });
      await loadOverviewData();
      showToast(`บันทึกออเดอร์ ${res.order?.order_code || ""} เรียบร้อย`);
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Tab 3: Games & Packages Master-Detail Manager & Pricing Studio
  // ---------------------------------------------------------------------------
  function calcSellingFromFullAndPct(full, pct) {
    const f = Math.max(0, Number(full) || 0);
    const p = Math.max(0, Math.min(99, Number(pct) || 0));
    if (p === 0) return f;
    return Math.max(0, Math.round(f * (1 - p / 100)));
  }

  function calcPctFromFullAndSelling(full, selling) {
    const f = Math.max(0, Number(full) || 0);
    const s = Math.max(0, Number(selling) || 0);
    if (f <= 0 || s >= f) return 0;
    const pct = Math.round((1 - s / f) * 100);
    return Math.max(0, Math.min(99, pct));
  }

  function renderCategoryTabs() {
    const container = document.getElementById("adminCategoryTabs");
    if (!container) return;
    const cats = ["all"];
    for (const g of adminGames) {
      if (g.category && !cats.includes(g.category)) {
        cats.push(g.category);
      }
    }
    container.innerHTML = cats
      .map((c) => {
        const label = c === "all" ? "ทุกหมวด" : c;
        const activeClass = c === activeCategory ? "chip is-active" : "chip";
        return `<button type="button" class="${activeClass}" data-admin-cat="${escapeHtml(c)}">${escapeHtml(label)}</button>`;
      })
      .join("");
  }

  function renderGameNavList(filteredGames) {
    const navEl = document.getElementById("gameSelectorList");
    if (!navEl) return;

    const countEl = document.getElementById("sidebarGameCount");
    if (countEl) countEl.textContent = `${adminGames.length} เกม`;

    if (adminGames.length === 0) {
      navEl.innerHTML = `<div class="muted" style="font-size:0.82rem; padding:12px; text-align:center;">ยังไม่มีเกมในระบบ</div>`;
      return;
    }

    const totalPkgs = adminGames.reduce(
      (acc, g) => acc + (Array.isArray(g.packages) ? g.packages.length : 0),
      0
    );
    const isAllActive = selectedGameId === "all";

    let html = `
      <button type="button" class="game-nav-item ${isAllActive ? "is-active" : ""}" data-select-game-nav="all">
        <div style="width:40px; height:30px; border-radius:4px; background:#0f172a; color:#38bdf8; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">
          🎮
        </div>
        <div class="game-nav-info">
          <strong class="game-nav-title">ดูทุกเกมพร้อมกัน</strong>
          <span class="game-nav-sub">${adminGames.length} เกม · ${totalPkgs} แพ็กเกจ</span>
        </div>
      </button>
    `;

    if (filteredGames.length === 0) {
      html += `<div class="muted" style="font-size:0.8rem; padding:12px 6px; text-align:center;">ไม่พบเกมตามเงื่อนไข</div>`;
    } else {
      html += filteredGames
        .map((g) => {
          const isSelected = String(selectedGameId) === String(g.id);
          const pkgCount = Array.isArray(g.packages) ? g.packages.length : 0;
          const discountHtml = g.discount_badge
            ? `<span style="color:var(--danger); font-weight:700;">${escapeHtml(g.discount_badge)}</span>`
            : "ราคาปกติ";
          const activeDot = `<span style="width:8px; height:8px; border-radius:50%; background:${g.is_active ? "var(--success)" : "var(--border-strong)"}; flex-shrink:0;" title="${g.is_active ? "เปิดขาย" : "ซ่อน"}"></span>`;

          return `
            <button type="button" class="game-nav-item ${isSelected ? "is-active" : ""}" data-select-game-nav="${g.id}">
              <img src="${escapeHtml(getGameThumb(g))}" alt="" class="game-nav-thumb" />
              <div class="game-nav-info">
                <strong class="game-nav-title">${escapeHtml(g.name)}</strong>
                <span class="game-nav-sub">${pkgCount} แพ็ก · ${discountHtml}</span>
              </div>
              ${activeDot}
            </button>
          `;
        })
        .join("");
    }

    navEl.innerHTML = html;
  }

  function renderGameAdminBlock(g) {
    const pkgs = Array.isArray(g.packages) ? g.packages : [];
    const activeTag = g.is_active
      ? `<span class="tag tag-success">เปิดขาย</span>`
      : `<span class="tag tag-neutral">ซ่อนชั่วคราว</span>`;

    const pkgsTableHtml =
      pkgs.length === 0
        ? `
          <div class="muted" style="font-size:0.88rem; padding:24px 16px; text-align:center; background:var(--surface-alt); border-radius:var(--radius-sm); border:1px dashed var(--border);">
            ยังไม่มีแพ็กเกจราคาสำหรับเกมนี้ — กดปุ่ม <strong>"+ เพิ่มแพ็กเกจ"</strong> ด้านบนเพื่อสร้างตัวเลือกเติมเงิน
          </div>
        `
        : `
          <div class="pricing-table-wrap">
            <table class="pricing-table">
              <thead>
                <tr>
                  <th style="min-width:180px;">แพ็กเกจ / SKU</th>
                  <th style="width:125px;">ราคาเต็ม (฿)</th>
                  <th style="width:235px;">% ส่วนลด (คำนวณอัตโนมัติ)</th>
                  <th style="width:140px;">ราคาขายจริง (฿)</th>
                  <th style="width:115px;">ป้ายกำกับ</th>
                  <th style="width:70px; text-align:center;">เปิดขาย</th>
                  <th style="width:145px; text-align:right;">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${pkgs
                  .map((p) => {
                    const fullPrice = p.full_price > 0 ? p.full_price : p.price;
                    const discountPct =
                      p.full_price > p.price && p.full_price > 0
                        ? Math.round((1 - p.price / p.full_price) * 100)
                        : 0;
                    return `
                      <tr class="pkg-row" data-pkg-id="${p.id}" data-game-id="${g.id}">
                        <td>
                          <strong style="font-size:0.92rem; display:block;">${escapeHtml(p.name)}</strong>
                          <span class="muted" style="font-size:0.76rem;">SKU: ${escapeHtml(p.sku)} ${p.bonus_text ? `· ${escapeHtml(p.bonus_text)}` : ""}</span>
                        </td>
                        <td>
                          <div class="price-cell-wrap">
                            <span class="muted" style="font-size:0.8rem;">฿</span>
                            <input type="number" class="table-input row-full-price" data-id="${p.id}" value="${fullPrice}" min="0" step="1" title="ราคาเต็มในเกม (ขีดฆ่า)" />
                          </div>
                        </td>
                        <td>
                          <div class="pct-cell-wrap">
                            <input type="number" class="table-input row-pct" data-id="${p.id}" value="${discountPct}" min="0" max="99" step="1" style="width:50px; font-weight:700;" title="% ส่วนลด" />
                            <span class="muted" style="font-size:0.8rem; font-weight:700;">%</span>
                            <div class="pct-quick-btns">
                              <button type="button" class="btn-micro" data-set-row-pct="0" data-id="${p.id}" title="ราคาปกติ (ไม่ลด)">0%</button>
                              <button type="button" class="btn-micro" data-set-row-pct="5" data-id="${p.id}" title="ลด 5%">5%</button>
                              <button type="button" class="btn-micro" data-set-row-pct="10" data-id="${p.id}" title="ลด 10%">10%</button>
                              <button type="button" class="btn-micro" data-set-row-pct="15" data-id="${p.id}" title="ลด 15%">15%</button>
                              <button type="button" class="btn-micro" data-set-row-pct="20" data-id="${p.id}" title="ลด 20%">20%</button>
                              <button type="button" class="btn-micro" data-set-row-pct="25" data-id="${p.id}" title="ลด 25%">25%</button>
                              <button type="button" class="btn-micro" data-set-row-pct="30" data-id="${p.id}" title="ลด 30%">30%</button>
                              <button type="button" class="btn-micro" data-set-row-pct="50" data-id="${p.id}" title="ลด 50%">50%</button>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div class="price-cell-wrap">
                            <span style="font-size:0.85rem; font-weight:700; color:var(--primary);">฿</span>
                            <input type="number" class="table-input is-selling row-price" data-id="${p.id}" value="${p.price}" min="0" step="1" title="ราคาที่ลูกค้าต้องจ่ายจริง" />
                          </div>
                        </td>
                        <td>
                          <input type="text" class="table-input row-badge" data-id="${p.id}" value="${escapeHtml(p.badge || "")}" placeholder="เช่น HOT" />
                        </td>
                        <td style="text-align:center;">
                          <input type="checkbox" class="row-active" data-id="${p.id}" ${p.is_active ? "checked" : ""} style="cursor:pointer; width:17px; height:17px;" title="เปิด/ปิดการขายแพ็กเกจนี้" />
                        </td>
                        <td style="text-align:right; white-space:nowrap;">
                          <button type="button" class="btn btn-primary btn-xs btn-row-save" data-id="${p.id}">💾 บันทึก</button>
                          <button type="button" class="btn btn-ghost btn-xs" data-edit-pkg="${p.id}" data-pkg-game="${g.id}" title="แก้ไขข้อมูลเพิ่มเติม">⚙️</button>
                          <button type="button" class="btn btn-ghost-danger btn-xs" data-del-pkg="${p.id}" title="ลบแพ็กเกจ">🗑</button>
                          <span class="save-indicator" data-id="${p.id}"></span>
                        </td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        `;

    return `
      <div class="card game-admin-block" data-game-block="${g.id}">
        <div class="game-admin-top">
          <div class="game-admin-meta">
            <img src="${escapeHtml(getGameThumb(g))}" alt="" class="game-admin-thumb" />
            <div style="min-width:0;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <strong style="font-size:1.15rem;">${escapeHtml(g.name)}</strong>
                ${activeTag}
              </div>
              <div class="muted" style="font-size:0.82rem; margin:2px 0 6px;">
                ${escapeHtml(g.category)} · ค่าย: <strong>${escapeHtml(g.publisher || "-")}</strong> · หน่วยเงิน: <strong>${escapeHtml(g.currency_name)}</strong>
                · ช่องกรอก: ${escapeHtml(g.uid_label)} ${g.require_server ? "(+ Server)" : ""}
              </div>
              <div class="game-discount-bar">
                <span style="font-size:0.8rem; font-weight:600; color:var(--text);">🏷️ ป้ายลดราคาเกม:</span>
                <input
                  type="text"
                  class="table-input inline-game-badge"
                  data-game-id="${g.id}"
                  value="${escapeHtml(g.discount_badge || "")}"
                  placeholder="เช่น ลดสูงสุด 15%"
                  style="width:130px; font-size:0.82rem; padding:4px 8px;"
                />
                <button type="button" class="btn btn-secondary btn-xs btn-save-game-badge" data-game-id="${g.id}">
                  บันทึกป้าย
                </button>
                <div style="display:flex; align-items:center; gap:4px; margin-left:auto; flex-wrap:wrap;">
                  <span class="muted" style="font-size:0.75rem;">ปรับลดทั้งเกม:</span>
                  <button type="button" class="chip-xs" data-apply-game-pct="${g.id}" data-pct="0">ปกติ (0%)</button>
                  <button type="button" class="chip-xs" data-apply-game-pct="${g.id}" data-pct="5">-5%</button>
                  <button type="button" class="chip-xs" data-apply-game-pct="${g.id}" data-pct="10">-10%</button>
                  <button type="button" class="chip-xs" data-apply-game-pct="${g.id}" data-pct="15">-15%</button>
                  <button type="button" class="chip-xs" data-apply-game-pct="${g.id}" data-pct="20">-20%</button>
                  <button type="button" class="chip-xs" data-apply-game-pct="${g.id}" data-pct="25">-25%</button>
                  <button type="button" class="chip-xs" data-apply-game-pct="${g.id}" data-pct="30">-30%</button>
                  <button type="button" class="chip-xs" data-apply-game-pct="${g.id}" data-pct="50">-50%</button>
                </div>
              </div>
            </div>
          </div>

          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            <button type="button" class="btn btn-primary btn-sm btn-save-game-pkgs" data-game-id="${g.id}">
              💾 บันทึกราคาทุกแพ็กเกจ
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-add-pkg="${g.id}">
              + เพิ่มแพ็กเกจ
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-edit-game="${g.id}">
              ⚙️ ตั้งค่าเกม
            </button>
            <button type="button" class="btn btn-danger btn-sm" data-del-game="${g.id}">
              🗑 ลบเกม
            </button>
          </div>
        </div>

        ${pkgsTableHtml}
      </div>
    `;
  }

  function renderGamesTab() {
    renderCategoryTabs();

    const filteredGames = adminGames.filter((g) => {
      if (activeCategory !== "all" && g.category !== activeCategory) return false;
      if (!gameSearchQuery) return true;
      const q = gameSearchQuery.toLowerCase();
      const matchGame =
        String(g.name || "").toLowerCase().includes(q) ||
        String(g.publisher || "").toLowerCase().includes(q) ||
        String(g.category || "").toLowerCase().includes(q);
      if (matchGame) return true;
      if (Array.isArray(g.packages)) {
        return g.packages.some(
          (p) =>
            String(p.name || "").toLowerCase().includes(q) ||
            String(p.sku || "").toLowerCase().includes(q)
        );
      }
      return false;
    });

    renderGameNavList(filteredGames);

    const workspace = document.getElementById("gameDetailWorkspace");
    if (!workspace) return;

    if (adminGames.length === 0) {
      workspace.innerHTML = `
        <div class="card" style="padding:48px 20px; text-align:center; color:var(--muted);">
          <div style="font-size:2.4rem; margin-bottom:8px;">🎮</div>
          <h3 style="font-size:1.1rem; color:var(--text); margin:0 0 6px;">ยังไม่มีเกมในระบบ</h3>
          <p style="margin:0 0 16px; font-size:0.88rem;">เริ่มต้นโดยการเพิ่มเกมแรกของคุณ พร้อมสร้างแพ็กเกจราคาเริ่มต้นอัตโนมัติ</p>
          <button type="button" class="btn btn-primary btn-sm" id="emptyAddGameBtn">+ เพิ่มเกมแรก</button>
        </div>
      `;
      const emptyBtn = document.getElementById("emptyAddGameBtn");
      if (emptyBtn) emptyBtn.addEventListener("click", () => openGameModal(null));
      return;
    }

    if (selectedGameId === "all") {
      if (filteredGames.length === 0) {
        workspace.innerHTML = `
          <div class="card" style="padding:36px 20px; text-align:center; color:var(--muted);">
            ไม่พบเกมที่ค้นหา ลองเปลี่ยนคำค้นหา หรือเลือก "ทุกหมวด"
          </div>
        `;
        return;
      }
      workspace.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; background:var(--surface); border:1px solid var(--border); padding:10px 16px; border-radius:var(--radius-sm); flex-wrap:wrap; gap:8px;">
          <span style="font-size:0.88rem; font-weight:600;">
            🌐 กำลังแสดงภาพรวมทุกเกม (${filteredGames.length} เกม)
          </span>
          <span class="muted" style="font-size:0.8rem;">
            คลิกเลือกเกมในเมนูซ้ายเพื่อเลือกจัดการทีละเกม
          </span>
        </div>
        <div style="display:flex; flex-direction:column; gap:16px;">
          ${filteredGames.map((g) => renderGameAdminBlock(g)).join("")}
        </div>
      `;
      return;
    }

    // Specific game selected
    let selectedGame = adminGames.find((g) => String(g.id) === String(selectedGameId));
    if (!selectedGame) {
      selectedGame = adminGames[0];
      selectedGameId = selectedGame ? selectedGame.id : "all";
    }

    if (!selectedGame) {
      workspace.innerHTML = `<div class="card" style="padding:32px; text-align:center;">ไม่พบเกมที่เลือก</div>`;
      return;
    }

    workspace.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; background:var(--surface); border:1px solid var(--border); padding:10px 16px; border-radius:var(--radius-sm); flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="muted" style="font-size:0.85rem;">เกมที่กำลังจัดการ:</span>
          <strong style="font-size:1.05rem; color:var(--primary);">${escapeHtml(selectedGame.name)}</strong>
          <span class="tag" style="font-size:0.75rem;">${escapeHtml(selectedGame.category)}</span>
        </div>
        <button type="button" class="btn btn-secondary btn-xs" data-select-game-nav="all">
          ดูทุกเกมพร้อมกัน →
        </button>
      </div>
      ${renderGameAdminBlock(selectedGame)}
    `;
  }

  // ---------------------------------------------------------------------------
  // Pricing & Discounts Inline Editing Handlers
  // ---------------------------------------------------------------------------
  async function savePackageRow(pkgId, buttonEl = null) {
    const tr = document.querySelector(`.pkg-row[data-pkg-id="${pkgId}"]`);
    if (!tr) return;

    const price = Math.max(0, Number(tr.querySelector(".row-price").value) || 0);
    const fullPrice = Math.max(0, Number(tr.querySelector(".row-full-price").value) || 0);
    const badge = String(tr.querySelector(".row-badge").value || "").trim();
    const isActive = tr.querySelector(".row-active").checked ? 1 : 0;

    const indicator = tr.querySelector(`.save-indicator[data-id="${pkgId}"]`);
    if (buttonEl) buttonEl.disabled = true;

    try {
      await apiFetch(`/api/admin/packages/${pkgId}`, {
        method: "PUT",
        json: { price, full_price: fullPrice, badge, is_active: isActive },
      });

      for (const gm of adminGames) {
        if (!Array.isArray(gm.packages)) continue;
        const found = gm.packages.find((p) => p.id === Number(pkgId));
        if (found) {
          found.price = price;
          found.full_price = fullPrice;
          found.badge = badge;
          found.is_active = isActive;
          break;
        }
      }

      syncCatalogKpiFromGames();
      tr.classList.remove("is-dirty");
      if (indicator) {
        indicator.textContent = "✓ บันทึกแล้ว";
        indicator.classList.add("is-visible");
        setTimeout(() => indicator.classList.remove("is-visible"), 2000);
      }
      showToast(`บันทึกราคาแพ็กเกจเรียบร้อย (฿${price.toLocaleString()})`);
    } catch (err) {
      showToast(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      if (buttonEl) buttonEl.disabled = false;
    }
  }

  async function saveGamePackagesBatch(gameId, buttonEl = null) {
    const rows = document.querySelectorAll(`.pkg-row[data-game-id="${gameId}"]`);
    if (rows.length === 0) return;

    const packages = [];
    rows.forEach((tr) => {
      const id = Number(tr.getAttribute("data-pkg-id"));
      const price = Math.max(0, Number(tr.querySelector(".row-price").value) || 0);
      const fullPrice = Math.max(0, Number(tr.querySelector(".row-full-price").value) || 0);
      const badge = String(tr.querySelector(".row-badge").value || "").trim();
      const isActive = tr.querySelector(".row-active").checked ? 1 : 0;
      packages.push({ id, price, full_price: fullPrice, badge, is_active: isActive });
    });

    if (buttonEl) buttonEl.disabled = true;

    try {
      const res = await apiFetch("/api/admin/packages/batch", {
        method: "PUT",
        json: { packages },
      });
      if (Array.isArray(res.games)) {
        adminGames = res.games;
      }
      syncCatalogKpiFromGames();
      rows.forEach((tr) => {
        tr.classList.remove("is-dirty");
        const ind = tr.querySelector(".save-indicator");
        if (ind) {
          ind.textContent = "✓ บันทึกแล้ว";
          ind.classList.add("is-visible");
          setTimeout(() => ind.classList.remove("is-visible"), 2200);
        }
      });
      showToast(`บันทึกราคาทุกแพ็กเกจในเกมสำเร็จ (${packages.length} รายการ)`);
    } catch (err) {
      showToast(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      if (buttonEl) buttonEl.disabled = false;
    }
  }

  async function saveGameBadgeOnly(gameId, buttonEl = null) {
    const input = document.querySelector(`.inline-game-badge[data-game-id="${gameId}"]`);
    if (!input) return;
    const badge = input.value.trim();
    if (buttonEl) buttonEl.disabled = true;

    try {
      await apiFetch(`/api/admin/games/${gameId}`, {
        method: "PUT",
        json: { discount_badge: badge },
      });
      const gm = adminGames.find((g) => g.id === Number(gameId));
      if (gm) gm.discount_badge = badge;
      renderOverviewPromo();
      showToast("บันทึกป้ายส่วนลดของเกมแล้ว");
    } catch (err) {
      showToast(err.message);
    } finally {
      if (buttonEl) buttonEl.disabled = false;
    }
  }

  async function applyGameDiscountPercent(gameId, percent) {
    const pct = Number(percent) || 0;
    const gm = adminGames.find((g) => g.id === Number(gameId));
    if (!gm) return;

    let confirmed = false;
    if (pct === 0) {
      confirmed = await showCustomConfirm({
        title: "คืนราคาเต็มปกติ (ยกเลิกส่วนลด)",
        tag: "RESET DISCOUNT",
        message: `ต้องการคืนราคาเต็มปกติ (ยกเลิกส่วนลด) ให้กับเกม "${gm.name}" ทั้งหมด?`,
        subtext: "ทุกแพ็กเกจในเกมนี้จะกลับมาแสดงราคาเต็มปกติ และลบป้ายส่วนลดของเกมออกทันที",
        confirmText: "คืนราคาเต็มปกติ",
        cancelText: "ยกเลิก",
        type: "warning",
      });
    } else {
      confirmed = await showCustomConfirm({
        title: `จัดโปรโมชั่นลด ${pct}%`,
        tag: "GAME PROMOTION",
        message: `ต้องการปรับลดราคาทุกแพ็กเกจในเกม "${gm.name}" เป็นลด ${pct}% ทันที?`,
        subtext: `ระบบจะคำนวณราคาขายใหม่อัตโนมัติ (ลด ${pct}% จากราคาเต็ม) และตั้งป้าย "ลดสูงสุด ${pct}%" ให้ทันที`,
        confirmText: `⚡ ยืนยันปรับลด ${pct}%`,
        cancelText: "ยกเลิก",
        type: "info",
      });
    }

    if (!confirmed) return;

    try {
      const res = await apiFetch(`/api/admin/games/${gameId}/discount`, {
        method: "POST",
        json: { percent: pct },
      });
      if (res.game) {
        const idx = adminGames.findIndex((g) => g.id === Number(gameId));
        if (idx !== -1) adminGames[idx] = res.game;
      }
      renderGamesTab();
      renderOverviewTab();
      showToast(`ปรับลดราคาเกม "${gm?.name}" เป็น ${pct}% เรียบร้อยแล้ว`);
    } catch (err) {
      showToast(err.message);
    }
  }

  async function applyStorewideDiscountPercent(percent) {
    const pct = Number(percent) || 0;
    let confirmed = false;
    if (pct === 0) {
      confirmed = await showCustomConfirm({
        title: "คืนราคาปกติทั้งร้าน",
        tag: "STOREWIDE RESET",
        message: "ยืนยันการคืนราคาเต็มปกติ (ยกเลิกส่วนลด) ให้ทุกเกมในร้าน?",
        subtext: "ทุกแพ็กเกจของทุกเกมในร้านจะถูกรีเซ็ตราคาขายให้เท่ากับราคาเต็มเดิม",
        confirmText: "คืนราคาทั้งร้าน",
        cancelText: "ยกเลิก",
        type: "warning",
      });
    } else {
      confirmed = await showCustomConfirm({
        title: `จัดโปรลดทั้งร้าน ${pct}%`,
        tag: "STOREWIDE PROMOTION",
        message: `ยืนยันการจัดโปรโมชั่นลด ${pct}% ให้กับทุกแพ็กเกจของทุกเกมในร้าน?`,
        subtext: `ทุกเกมในร้านจะได้รับส่วนลด ${pct}% ทันที พร้อมติดป้ายโปรโมชั่นหน้าเว็บ`,
        confirmText: `⚡ ยืนยันปรับลด ${pct}% ทั้งร้าน`,
        cancelText: "ยกเลิก",
        type: "info",
      });
    }

    if (!confirmed) return;

    try {
      const res = await apiFetch("/api/admin/store/discount", {
        method: "POST",
        json: { percent: pct },
      });
      if (Array.isArray(res.games)) {
        adminGames = res.games;
      }
      closeStorewidePromoModal();
      renderGamesTab();
      renderOverviewTab();
      showToast(`ปรับใช้ส่วนลด ${pct}% กับทุกเกมในร้านเรียบร้อยแล้ว!`);
    } catch (err) {
      showToast(err.message);
    }
  }

  function openStorewidePromoModal() {
    document.getElementById("storewidePromoModal").hidden = false;
  }

  function closeStorewidePromoModal() {
    document.getElementById("storewidePromoModal").hidden = true;
  }

  function openGameModal(game = null) {
    const isEdit = Boolean(game && game.id);
    setText("gameModalKicker", isEdit ? `EDIT: ${game.slug}` : "NEW GAME");
    setText("gameModalTitle", isEdit ? `แก้ไข: ${game.name}` : "เพิ่มเกมใหม่");
    document.getElementById("gameFormError").hidden = true;
    document.getElementById("gameCoverFile").value = "";

    document.getElementById("editGameId").value = isEdit ? String(game.id) : "";
    document.getElementById("editGameName").value = isEdit ? game.name || "" : "";
    document.getElementById("editGameSlug").value = isEdit ? game.slug || "" : "";
    document.getElementById("editGamePublisher").value = isEdit ? game.publisher || "" : "";
    document.getElementById("editGameCategory").value = isEdit ? game.category || "MOBA / FPS" : "MOBA / FPS";
    document.getElementById("editGameCurrency").value = isEdit ? game.currency_name || "คูปอง" : "คูปอง";
    document.getElementById("editGameDiscount").value = isEdit ? game.discount_badge || "" : "";
    document.getElementById("editGameUidLabel").value = isEdit ? game.uid_label || "UID ผู้เล่น" : "UID ผู้เล่น";
    document.getElementById("editGameUidPlaceholder").value = isEdit ? game.uid_placeholder || "" : "";
    document.getElementById("editGameUidHint").value = isEdit ? game.uid_hint || "" : "";
    document.getElementById("editGameReqServer").checked = isEdit ? Boolean(game.require_server) : false;
    document.getElementById("editGameServers").value = isEdit ? game.server_options || "" : "";
    document.getElementById("editGameIconKey").value = isEdit ? game.icon_key || "gamepad" : "gamepad";
    document.getElementById("editGameColor").value = isEdit ? game.accent_color || "#2563eb" : "#2563eb";
    document.getElementById("editGameImageUrl").value = isEdit ? game.image_url || "" : "";
    document.getElementById("editGameActive").checked = isEdit ? Boolean(game.is_active) : true;

    const starterWrap = document.getElementById("starterPkgsWrap");
    if (starterWrap) starterWrap.hidden = isEdit;
    const starterBox = document.getElementById("editGameStarterPkgs");
    if (starterBox) starterBox.checked = !isEdit;

    document.getElementById("gameModal").hidden = false;
  }

  function closeGameModal() {
    document.getElementById("gameModal").hidden = true;
  }

  function openPackageModal(gameId, pkg = null) {
    const isEdit = Boolean(pkg && pkg.id);
    const gm = adminGames.find((g) => g.id === Number(gameId));
    setText("pkgModalKicker", gm ? gm.name : "PACKAGE");
    setText("pkgModalTitle", isEdit ? "แก้ไขแพ็กเกจราคา" : `เพิ่มแพ็กเกจ (${gm?.currency_name || ""})`);
    document.getElementById("pkgFormError").hidden = true;

    document.getElementById("editPkgId").value = isEdit ? String(pkg.id) : "";
    document.getElementById("editPkgGameId").value = String(gameId);
    document.getElementById("editPkgName").value = isEdit ? pkg.name || "" : "";
    document.getElementById("editPkgBonus").value = isEdit ? pkg.bonus_text || "" : "";

    const fullPrice = isEdit && Number(pkg.full_price) > 0 ? Number(pkg.full_price) : (isEdit ? Number(pkg.price) : "");
    const sellingPrice = isEdit ? Number(pkg.price) : "";
    const pct = isEdit && fullPrice > 0 ? calcPctFromFullAndSelling(fullPrice, sellingPrice) : 10;

    document.getElementById("editPkgFullPrice").value = fullPrice !== "" ? String(fullPrice) : "";
    const pctField = document.getElementById("editPkgPct");
    if (pctField) pctField.value = isEdit ? String(pct) : "10";
    document.getElementById("editPkgPrice").value = sellingPrice !== "" ? String(sellingPrice) : "";

    document.getElementById("editPkgBadge").value = isEdit ? pkg.badge || "" : "";
    document.getElementById("editPkgSku").value = isEdit ? pkg.sku || "" : "";
    document.getElementById("editPkgActive").checked = isEdit ? Boolean(pkg.is_active) : true;

    document.getElementById("packageModal").hidden = false;
  }

  function closePackageModal() {
    document.getElementById("packageModal").hidden = true;
  }

  async function uploadImageToInput(file, targetInputId) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("ขนาดไฟล์รูปต้องไม่เกิน 5 MB");
      return;
    }
    try {
      showToast("กำลังอัปโหลดรูปภาพ...");
      const res = await apiFetch("/api/admin/upload", {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      document.getElementById(targetInputId).value = res.url;
      showToast("อัปโหลดรูปภาพเรียบร้อยแล้ว");
    } catch (err) {
      showToast(err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Tab 4: Store Settings & Password
  // ---------------------------------------------------------------------------
  function populateSettingsForm() {
    const map = {
      setStoreName: "store_name",
      setStoreTagline: "store_tagline",
      setAnnouncement: "announcement_bar",
      setHeroKicker: "hero_kicker",
      setOpenHours: "open_hours",
      setHeroHeading: "hero_heading",
      setHeroSubtext: "hero_subtext",
      setPromptpayId: "promptpay_id",
      setPromptpayName: "promptpay_name",
      setPromptpayQrUrl: "promptpay_qr_url",
      setLine: "contact_line",
      setFb: "contact_facebook",
    };
    for (const [id, key] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) el.value = storeSettings[key] ?? "";
    }
  }

  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function loadDatabaseHealth() {
    try {
      const health = await apiFetch("/api/admin/database/health");
      const dot = document.getElementById("dbStatusDot");
      const statusText = document.getElementById("dbHealthStatus");
      const sizeText = document.getElementById("dbSizeText");
      const lastBackup = document.getElementById("dbLastBackupText");
      const backupCount = document.getElementById("dbBackupCountText");
      const backupList = document.getElementById("dbBackupList");

      if (dot && statusText) {
        if (health.isHealthy) {
          dot.className = "status-dot is-healthy";
          statusText.textContent = "ปกติ (Healthy)";
          statusText.style.color = "#16a34a";
        } else {
          dot.className = "status-dot is-degraded";
          statusText.textContent = `ผิดปกติ (${health.integrity})`;
          statusText.style.color = "#dc2626";
        }
      }

      if (sizeText) {
        sizeText.textContent = `${formatBytes(health.dbSizeBytes)} (WAL: ${formatBytes(health.walSizeBytes)})`;
      }

      if (lastBackup) {
        lastBackup.textContent = health.lastBackupTime ? formatDateTime(health.lastBackupTime) : "ยังไม่มี";
      }

      if (backupCount) {
        backupCount.textContent = `${health.backupCount || 0} ไฟล์`;
      }

      if (backupList) {
        if (!health.backups || health.backups.length === 0) {
          backupList.innerHTML = `<span class="muted" style="font-size:0.84rem; padding:6px;">ยังไม่มีไฟล์สำรองข้อมูล กดปุ่ม "สำรองข้อมูลทันที" เพื่อสร้าง Snapshot แรก</span>`;
        } else {
          backupList.innerHTML = health.backups
            .map(
              (b) => `
              <div class="db-backup-item">
                <div>
                  <strong style="color:var(--text);">${escapeHtml(b.filename)}</strong>
                  <div class="db-backup-meta">
                    <span>📅 ${escapeHtml(formatDateTime(b.createdAt))}</span>
                  </div>
                </div>
                <span class="tag tag-neutral" style="font-size:0.75rem;">${formatBytes(b.sizeBytes)}</span>
              </div>
            `
            )
            .join("");
        }
      }
    } catch (err) {
      console.error("Failed to load database health:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Event Binding
  // ---------------------------------------------------------------------------
  function bindEvents() {
    document.getElementById("adminLoginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("loginErrorMsg");
      errEl.hidden = true;
      try {
        const res = await apiFetch("/api/admin/login", {
          method: "POST",
          json: {
            username: document.getElementById("loginUsername").value.trim(),
            password: document.getElementById("loginPassword").value,
          },
        });
        document.getElementById("loginPassword").value = "";
        showDashboardScreen(res.admin);
        await loadOverviewData();
        showToast("เข้าสู่ระบบเรียบร้อยแล้ว");
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    });

    document.getElementById("adminLogoutBtn").addEventListener("click", async () => {
      try {
        await apiFetch("/api/admin/logout", { method: "POST" });
      } catch {}
      showLoginScreen();
      showToast("ออกจากระบบแล้ว");
    });

    document.querySelectorAll(".admin-nav-btn[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
    });

    document.querySelectorAll("[data-jump-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.getAttribute("data-jump-tab")));
    });

    document.getElementById("refreshAdminBtn").addEventListener("click", async () => {
      await loadOverviewData();
      showToast("อัปเดตข้อมูลล่าสุดแล้ว");
    });

    document.getElementById("adminOrderFilter").addEventListener("change", renderOrdersTab);
    document.getElementById("openNewGameBtn").addEventListener("click", () => openGameModal(null));

    // Storewide Promo Modal Trigger & Buttons
    const openStorePromo = document.getElementById("openStorePromoBtn");
    if (openStorePromo) openStorePromo.addEventListener("click", openStorewidePromoModal);
    const overviewOpenPromo = document.getElementById("overviewOpenPromoBtn");
    if (overviewOpenPromo) overviewOpenPromo.addEventListener("click", openStorewidePromoModal);

    ["closePromoModalBtn", "cancelPromoModalBtn", "closePromoBackdrop"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", closeStorewidePromoModal);
    });

    document.querySelectorAll(".promo-pct-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".promo-pct-chip").forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        const pct = chip.getAttribute("data-pct");
        const customInp = document.getElementById("customPromoPct");
        if (customInp) customInp.value = pct;
      });
    });

    const promoForm = document.getElementById("storewidePromoForm");
    if (promoForm) {
      promoForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const pct = Number(document.getElementById("customPromoPct")?.value) || 0;
        await applyStorewideDiscountPercent(pct);
      });
    }

    // Search games & packages
    const searchInput = document.getElementById("adminGameSearch");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        gameSearchQuery = e.target.value.trim();
        renderGamesTab();
      });
    }

    // Real-time Pricing Table Interactive Calculations & Enter-to-Save
    const workspaceEl = document.getElementById("gameDetailWorkspace");
    if (workspaceEl) {
      workspaceEl.addEventListener("input", (e) => {
        const tr = e.target.closest(".pkg-row");
        if (!tr) return;
        tr.classList.add("is-dirty");

        if (e.target.classList.contains("row-pct")) {
          let full = Math.max(0, Number(tr.querySelector(".row-full-price")?.value) || 0);
          const pct = Math.max(0, Math.min(99, Number(e.target.value) || 0));
          if (full <= 0) {
            full = Math.max(0, Number(tr.querySelector(".row-price")?.value) || 0);
            if (full > 0 && tr.querySelector(".row-full-price")) {
              tr.querySelector(".row-full-price").value = full;
            }
          }
          const newPrice = calcSellingFromFullAndPct(full, pct);
          const priceInput = tr.querySelector(".row-price");
          if (priceInput) priceInput.value = newPrice;
        } else if (e.target.classList.contains("row-price")) {
          const selling = Math.max(0, Number(e.target.value) || 0);
          let full = Math.max(0, Number(tr.querySelector(".row-full-price")?.value) || 0);
          if (full <= 0 && selling > 0) {
            full = selling;
            if (tr.querySelector(".row-full-price")) {
              tr.querySelector(".row-full-price").value = full;
            }
          }
          const newPct = calcPctFromFullAndSelling(full, selling);
          const pctInput = tr.querySelector(".row-pct");
          if (pctInput) pctInput.value = newPct;
        } else if (e.target.classList.contains("row-full-price")) {
          const full = Math.max(0, Number(e.target.value) || 0);
          const pctInput = tr.querySelector(".row-pct");
          const pct = pctInput ? Math.max(0, Math.min(99, Number(pctInput.value) || 0)) : 0;
          const priceInput = tr.querySelector(".row-price");
          if (priceInput) {
            if (pct > 0) {
              priceInput.value = calcSellingFromFullAndPct(full, pct);
            } else {
              priceInput.value = full;
            }
          }
        }
      });

      workspaceEl.addEventListener("keydown", (e) => {
        if (
          e.key === "Enter" &&
          (e.target.classList.contains("table-input") ||
            e.target.classList.contains("row-pct") ||
            e.target.classList.contains("row-price") ||
            e.target.classList.contains("row-full-price") ||
            e.target.classList.contains("row-badge"))
        ) {
          e.preventDefault();
          const tr = e.target.closest(".pkg-row");
          if (tr) {
            const id = tr.getAttribute("data-pkg-id");
            savePackageRow(id, tr.querySelector(".btn-row-save"));
          }
        }
      });
    }

    // Package Modal Real-time Calculation Inputs
    const pkgFullInp = document.getElementById("editPkgFullPrice");
    const pkgPctInp = document.getElementById("editPkgPct");
    const pkgPriceInp = document.getElementById("editPkgPrice");

    if (pkgFullInp) {
      pkgFullInp.addEventListener("input", (e) => {
        const full = Math.max(0, Number(e.target.value) || 0);
        const pct = pkgPctInp ? Math.max(0, Math.min(99, Number(pkgPctInp.value) || 0)) : 0;
        if (pkgPriceInp) {
          if (pct > 0) {
            pkgPriceInp.value = calcSellingFromFullAndPct(full, pct);
          } else if (!pkgPriceInp.value || Number(pkgPriceInp.value) <= 0) {
            pkgPriceInp.value = full;
          }
        }
      });
    }

    if (pkgPctInp) {
      pkgPctInp.addEventListener("input", (e) => {
        let full = Math.max(0, Number(pkgFullInp?.value) || 0);
        const pct = Math.max(0, Math.min(99, Number(e.target.value) || 0));
        if (full <= 0 && pkgPriceInp && Number(pkgPriceInp.value) > 0) {
          full = Number(pkgPriceInp.value);
          if (pkgFullInp) pkgFullInp.value = full;
        }
        if (pkgPriceInp) {
          pkgPriceInp.value = calcSellingFromFullAndPct(full, pct);
        }
      });
    }

    if (pkgPriceInp) {
      pkgPriceInp.addEventListener("input", (e) => {
        const selling = Math.max(0, Number(e.target.value) || 0);
        let full = Math.max(0, Number(pkgFullInp?.value) || 0);
        if (full <= 0 && selling > 0) {
          full = selling;
          if (pkgFullInp) pkgFullInp.value = full;
        }
        if (pkgPctInp) {
          pkgPctInp.value = calcPctFromFullAndSelling(full, selling);
        }
      });
    }

    ["closeGameModalBtn", "cancelGameModalBtn", "closeGameBackdrop"].forEach((id) => {
      document.getElementById(id).addEventListener("click", closeGameModal);
    });
    ["closePkgModalBtn", "cancelPkgModalBtn", "closePkgBackdrop"].forEach((id) => {
      document.getElementById(id).addEventListener("click", closePackageModal);
    });

    document.getElementById("gameCoverFile").addEventListener("change", (e) => {
      if (e.target.files?.[0]) uploadImageToInput(e.target.files[0], "editGameImageUrl");
    });
    document.getElementById("qrUploadFile").addEventListener("change", (e) => {
      if (e.target.files?.[0]) uploadImageToInput(e.target.files[0], "setPromptpayQrUrl");
    });

    document.addEventListener("click", async (e) => {
      // Game nav item clicked in master-detail sidebar
      const navBtn = e.target.closest("[data-select-game-nav]");
      if (navBtn) {
        const targetVal = navBtn.getAttribute("data-select-game-nav");
        selectedGameId = targetVal === "all" ? "all" : Number(targetVal);
        renderGamesTab();
        return;
      }

      // Sidebar new game button
      if (e.target.closest("#sidebarNewGameBtn")) {
        openGameModal(null);
        return;
      }

      // Category filter chip
      const catBtn = e.target.closest("[data-admin-cat]");
      if (catBtn) {
        activeCategory = catBtn.getAttribute("data-admin-cat");
        renderGamesTab();
        return;
      }

      // Quick currency / UID presets in game modal
      const fillCurBtn = e.target.closest("[data-fill-cur]");
      if (fillCurBtn) {
        const curVal = fillCurBtn.getAttribute("data-fill-cur");
        const inp = document.getElementById("editGameCurrency");
        if (inp) inp.value = curVal;
        return;
      }
      const fillUidBtn = e.target.closest("[data-fill-uid]");
      if (fillUidBtn) {
        const uidVal = fillUidBtn.getAttribute("data-fill-uid");
        const inp = document.getElementById("editGameUidLabel");
        if (inp) inp.value = uidVal;
        return;
      }

      // Quick % button in package modal
      const pkgModalPctBtn = e.target.closest("[data-pkg-modal-pct]");
      if (pkgModalPctBtn) {
        const pct = Number(pkgModalPctBtn.getAttribute("data-pkg-modal-pct")) || 0;
        const pctInp = document.getElementById("editPkgPct");
        const fullInp = document.getElementById("editPkgFullPrice");
        const priceInp = document.getElementById("editPkgPrice");
        if (pctInp) pctInp.value = pct;
        let full = Math.max(0, Number(fullInp?.value) || 0);
        if (full <= 0 && priceInp && Number(priceInp.value) > 0) {
          full = Number(priceInp.value);
          if (fullInp) fullInp.value = full;
        }
        if (priceInp) priceInp.value = calcSellingFromFullAndPct(full, pct);
        return;
      }

      // Quick micro % button on table row
      const setRowPctBtn = e.target.closest("[data-set-row-pct]");
      if (setRowPctBtn) {
        const pct = Number(setRowPctBtn.getAttribute("data-set-row-pct")) || 0;
        const pId = setRowPctBtn.getAttribute("data-id");
        const tr = document.querySelector(`.pkg-row[data-pkg-id="${pId}"]`);
        if (tr) {
          let full = Math.max(0, Number(tr.querySelector(".row-full-price")?.value) || 0);
          if (full <= 0) {
            full = Math.max(0, Number(tr.querySelector(".row-price")?.value) || 0);
            if (full > 0 && tr.querySelector(".row-full-price")) {
              tr.querySelector(".row-full-price").value = full;
            }
          }
          tr.querySelector(".row-pct").value = pct;
          const newPrice = calcSellingFromFullAndPct(full, pct);
          tr.querySelector(".row-price").value = newPrice;
          tr.classList.add("is-dirty");
        }
        return;
      }

      // Inline save single package row
      const saveRowBtn = e.target.closest(".btn-row-save");
      if (saveRowBtn) {
        const pId = saveRowBtn.getAttribute("data-id");
        await savePackageRow(pId, saveRowBtn);
        return;
      }

      // Save all packages in game
      const saveAllPkgsBtn = e.target.closest(".btn-save-game-pkgs");
      if (saveAllPkgsBtn) {
        const gId = saveAllPkgsBtn.getAttribute("data-game-id");
        await saveGamePackagesBatch(gId, saveAllPkgsBtn);
        return;
      }

      // Save game discount badge
      const saveBadgeBtn = e.target.closest(".btn-save-game-badge");
      if (saveBadgeBtn) {
        const gId = saveBadgeBtn.getAttribute("data-game-id");
        await saveGameBadgeOnly(gId, saveBadgeBtn);
        return;
      }

      // Apply % discount to all packages of a game
      const applyGamePctBtn = e.target.closest("[data-apply-game-pct]");
      if (applyGamePctBtn) {
        const gId = applyGamePctBtn.getAttribute("data-apply-game-pct");
        const pct = applyGamePctBtn.getAttribute("data-pct");
        await applyGameDiscountPercent(gId, pct);
        return;
      }

      const copyUidBtn = e.target.closest("[data-copy-uid]");
      if (copyUidBtn) {
        const uid = copyUidBtn.getAttribute("data-copy-uid");
        try {
          await navigator.clipboard.writeText(uid);
          showToast(`คัดลอก UID: ${uid} แล้ว`);
        } catch {
          showToast("คัดลอกแล้ว");
        }
        return;
      }

      const saveOrdBtn = e.target.closest("[data-save-order]");
      if (saveOrdBtn) {
        saveOrderUpdate(saveOrdBtn.getAttribute("data-save-order"), saveOrdBtn);
        return;
      }

      const editGameBtn = e.target.closest("[data-edit-game]");
      if (editGameBtn) {
        const gm = adminGames.find((g) => g.id === Number(editGameBtn.getAttribute("data-edit-game")));
        if (gm) openGameModal(gm);
        return;
      }

      const delGameBtn = e.target.closest("[data-del-game]");
      if (delGameBtn) {
        const gm = adminGames.find((g) => g.id === Number(delGameBtn.getAttribute("data-del-game")));
        if (!gm) return;
        const ok = await showCustomConfirm({
          title: `ยืนยันการลบเกม "${gm.name}"`,
          tag: "DELETE GAME",
          message: `คุณแน่ใจหรือไม่ว่าต้องการลบเกม "${gm.name}" ออกจากระบบ?`,
          subtext: "แพ็กเกจและข้อมูลที่เกี่ยวข้องทั้งหมดของเกมนี้จะถูกลบถาวร และไม่สามารถกู้คืนได้",
          confirmText: "🗑️ ยืนยันการลบเกม",
          cancelText: "ยกเลิก",
          type: "danger",
        });
        if (!ok) return;
        try {
          await apiFetch(`/api/admin/games/${gm.id}`, { method: "DELETE" });
          await loadOverviewData();
          showToast(`ลบเกม "${gm.name}" แล้ว`);
        } catch (err) {
          showToast(err.message);
        }
        return;
      }

      const addPkgBtn = e.target.closest("[data-add-pkg]");
      if (addPkgBtn) {
        openPackageModal(Number(addPkgBtn.getAttribute("data-add-pkg")), null);
        return;
      }

      const editPkgBtn = e.target.closest("[data-edit-pkg]");
      if (editPkgBtn) {
        const gid = Number(editPkgBtn.getAttribute("data-pkg-game"));
        const pid = Number(editPkgBtn.getAttribute("data-edit-pkg"));
        const gm = adminGames.find((g) => g.id === gid);
        const pk = gm?.packages?.find((p) => p.id === pid);
        if (pk) openPackageModal(gid, pk);
        return;
      }

      const delPkgBtn = e.target.closest("[data-del-pkg]");
      if (delPkgBtn) {
        const pid = Number(delPkgBtn.getAttribute("data-del-pkg"));
        const ok = await showCustomConfirm({
          title: "ยืนยันการลบแพ็กเกจ",
          tag: "DELETE PACKAGE",
          message: "คุณแน่ใจหรือไม่ว่าต้องการลบแพ็กเกจเติมเกมรายการนี้?",
          subtext: "เมื่อลบแล้ว แพ็กเกจนี้จะไม่ปรากฏให้ลูกค้าเลือกเติมในหน้าร้านอีกต่อไป",
          confirmText: "🗑️ ยืนยันการลบ",
          cancelText: "ยกเลิก",
          type: "danger",
        });
        if (!ok) return;
        try {
          await apiFetch(`/api/admin/packages/${pid}`, { method: "DELETE" });
          await loadOverviewData();
          showToast("ลบแพ็กเกจเรียบร้อยแล้ว");
        } catch (err) {
          showToast(err.message);
        }
      }
    });

    // Save Game Form
    document.getElementById("gameEditorForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = document.getElementById("gameFormError");
      errBox.hidden = true;
      const id = document.getElementById("editGameId").value.trim();
      const isNew = !id;

      const payload = {
        name: document.getElementById("editGameName").value.trim(),
        slug: document.getElementById("editGameSlug").value.trim(),
        publisher: document.getElementById("editGamePublisher").value.trim(),
        category: document.getElementById("editGameCategory").value.trim(),
        currency_name: document.getElementById("editGameCurrency").value.trim(),
        discount_badge: document.getElementById("editGameDiscount").value.trim(),
        uid_label: document.getElementById("editGameUidLabel").value.trim(),
        uid_placeholder: document.getElementById("editGameUidPlaceholder").value.trim(),
        uid_hint: document.getElementById("editGameUidHint").value.trim(),
        require_server: document.getElementById("editGameReqServer").checked ? 1 : 0,
        server_options: document.getElementById("editGameServers").value.trim(),
        icon_key: document.getElementById("editGameIconKey").value,
        accent_color: document.getElementById("editGameColor").value,
        image_url: document.getElementById("editGameImageUrl").value.trim(),
        is_active: document.getElementById("editGameActive").checked ? 1 : 0,
      };

      if (isNew) {
        payload.create_starter_packages = document.getElementById("editGameStarterPkgs")?.checked ? 1 : 0;
      }

      try {
        if (id) {
          await apiFetch(`/api/admin/games/${encodeURIComponent(id)}`, { method: "PUT", json: payload });
          showToast("บันทึกข้อมูลเกมเรียบร้อย");
        } else {
          const res = await apiFetch("/api/admin/games", { method: "POST", json: payload });
          if (res.game?.id) {
            selectedGameId = res.game.id;
          }
          showToast("เพิ่มเกมใหม่เรียบร้อยแล้ว");
        }
        closeGameModal();
        await loadOverviewData();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });

    // Save Package Form
    document.getElementById("packageEditorForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = document.getElementById("pkgFormError");
      errBox.hidden = true;
      const id = document.getElementById("editPkgId").value.trim();

      const payload = {
        game_id: Number(document.getElementById("editPkgGameId").value),
        name: document.getElementById("editPkgName").value.trim(),
        bonus_text: document.getElementById("editPkgBonus").value.trim(),
        price: Number(document.getElementById("editPkgPrice").value),
        full_price: Number(document.getElementById("editPkgFullPrice").value || 0),
        badge: document.getElementById("editPkgBadge").value.trim(),
        sku: document.getElementById("editPkgSku").value.trim(),
        is_active: document.getElementById("editPkgActive").checked ? 1 : 0,
      };

      try {
        if (id) {
          await apiFetch(`/api/admin/packages/${encodeURIComponent(id)}`, { method: "PUT", json: payload });
          showToast("อัปเดตแพ็กเกจเรียบร้อย");
        } else {
          await apiFetch("/api/admin/packages", { method: "POST", json: payload });
          showToast("เพิ่มแพ็กเกจใหม่เรียบร้อยแล้ว");
        }
        closePackageModal();
        await loadOverviewData();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });

    // Save Settings Form
    document.getElementById("storeSettingsForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        store_name: document.getElementById("setStoreName").value.trim(),
        store_tagline: document.getElementById("setStoreTagline").value.trim(),
        announcement_bar: document.getElementById("setAnnouncement").value.trim(),
        hero_kicker: document.getElementById("setHeroKicker").value.trim(),
        open_hours: document.getElementById("setOpenHours").value.trim(),
        hero_heading: document.getElementById("setHeroHeading").value.trim(),
        hero_subtext: document.getElementById("setHeroSubtext").value.trim(),
        promptpay_id: document.getElementById("setPromptpayId").value.trim(),
        promptpay_name: document.getElementById("setPromptpayName").value.trim(),
        promptpay_qr_url: document.getElementById("setPromptpayQrUrl").value.trim(),
        contact_line: document.getElementById("setLine").value.trim(),
        contact_facebook: document.getElementById("setFb").value.trim(),
      };
      try {
        await apiFetch("/api/admin/settings", { method: "PUT", json: payload });
        await loadOverviewData();
        showToast("บันทึกการตั้งค่าร้านค้าเรียบร้อยแล้ว");
      } catch (err) {
        showToast(err.message);
      }
    });

    // Change Password Form
    document.getElementById("changePasswordForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const cur = document.getElementById("curAdminPass");
      const next = document.getElementById("newAdminPass");
      try {
        await apiFetch("/api/admin/password", {
          method: "POST",
          json: { current_password: cur.value, new_password: next.value },
        });
        cur.value = "";
        next.value = "";
        showToast("อัปเดตรหัสผ่านใหม่เรียบร้อยแล้ว");
      } catch (err) {
        showToast(err.message);
      }
    });

    // Database Resilience & Backup Controls
    const backupDbBtn = document.getElementById("backupDbBtn");
    if (backupDbBtn) {
      backupDbBtn.addEventListener("click", async () => {
        backupDbBtn.disabled = true;
        try {
          const res = await apiFetch("/api/admin/database/backup", { method: "POST" });
          showToast(`สำรองข้อมูลสำเร็จ (${res.backup?.filename})`);
          await loadDatabaseHealth();
        } catch (err) {
          showToast(err.message);
        } finally {
          backupDbBtn.disabled = false;
        }
      });
    }

    const checkpointDbBtn = document.getElementById("checkpointDbBtn");
    if (checkpointDbBtn) {
      checkpointDbBtn.addEventListener("click", async () => {
        checkpointDbBtn.disabled = true;
        try {
          await apiFetch("/api/admin/database/checkpoint", { method: "POST" });
          showToast("Flush & Checkpoint WAL สำเร็จ");
          await loadDatabaseHealth();
        } catch (err) {
          showToast(err.message);
        } finally {
          checkpointDbBtn.disabled = false;
        }
      });
    }

    const refreshDbHealthBtn = document.getElementById("refreshDbHealthBtn");
    if (refreshDbHealthBtn) {
      refreshDbHealthBtn.addEventListener("click", async () => {
        await loadDatabaseHealth();
        showToast("อัปเดตสถานะฐานข้อมูลล่าสุดแล้ว");
      });
    }
  }

  async function init() {
    bindEvents();
    try {
      const me = await apiFetch("/api/admin/me");
      if (me && me.authenticated) {
        showDashboardScreen(me.admin);
        await loadOverviewData();
      } else {
        showLoginScreen();
      }
    } catch {
      showLoginScreen();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
