"use strict";

/**
 * Clean Game Top-Up Store — Automated API & Integration Test Suite
 * Run with: npm test (node --test tests/api.test.js)
 */

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

// แยกฐานข้อมูลและโฟลเดอร์อัปโหลดของการทดสอบออกจากข้อมูลจริง 100%
const TEST_SANDBOX_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "topup-store-test-"));
process.env.STORE_DATA_DIR = path.join(TEST_SANDBOX_DIR, "data");
process.env.STORE_UPLOADS_DIR = path.join(TEST_SANDBOX_DIR, "uploads");
process.env.DATABASE_URL = "";

const storeDb = require("../backend/database");
const { server } = require("../backend/app");

after(async () => {
  try {
    await storeDb.closeDatabaseCleanly();
  } catch {}
  try {
    fs.rmSync(TEST_SANDBOX_DIR, { recursive: true, force: true });
  } catch {}
});

function request(options, bodyBuffer = null) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = options.method || "GET";
    req.url = options.url || "/";
    req.headers = {
      host: "localhost:3000",
      ...(options.headers || {}),
    };
    req.socket = { remoteAddress: options.remoteAddress || "127.0.0.1" };

    const headers = {};
    let statusCode = 200;
    const chunks = [];

    const res = {
      setHeader(k, v) {
        headers[k.toLowerCase()] = v;
      },
      writeHead(code, hdrs = {}) {
        statusCode = code;
        for (const [k, v] of Object.entries(hdrs)) {
          headers[k.toLowerCase()] = v;
        }
      },
      end(data) {
        if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
        const body = Buffer.concat(chunks);
        resolve({
          statusCode,
          headers,
          body,
          json: () => {
            try {
              return JSON.parse(body.toString("utf8"));
            } catch {
              return null;
            }
          },
        });
      },
    };

    server.emit("request", req, res);

    setImmediate(() => {
      if (bodyBuffer) {
        req.emit("data", bodyBuffer);
      }
      req.emit("end");
    });
  });
}

describe("Storefront & Public API", () => {
  let sampleGame;
  let samplePkg;
  let validSlipUrl;
  let createdOrderCode;

  test("GET / serves built React HTML with id='root'", async () => {
    const res = await request({ method: "GET", url: "/" });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-type"], /text\/html/);
    assert.ok(res.body.toString("utf8").includes('id="root"'));
  });

  test("GET /api/storefront returns store settings and active games", async () => {
    const res = await request({ method: "GET", url: "/api/storefront" });
    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.ok(data.settings);
    assert.ok(Array.isArray(data.games));
    assert.ok(data.games.length > 0);

    sampleGame = data.games[0];
    samplePkg = sampleGame.packages[0];
    assert.ok(samplePkg);
  });

  test("POST /api/upload-slip rejects requests without CSRF header (403)", async () => {
    const res = await request({
      method: "POST",
      url: "/api/upload-slip",
    });
    assert.equal(res.statusCode, 403);
  });

  test("POST /api/upload-slip rejects non-image formats (415)", async () => {
    const res = await request(
      {
        method: "POST",
        url: "/api/upload-slip",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "content-type": "text/plain",
        },
      },
      Buffer.from("not an image")
    );
    assert.equal(res.statusCode, 415);
  });

  test("POST /api/upload-slip accepts valid PNG magic bytes (201)", async () => {
    const pngHeader = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
      Buffer.alloc(64),
    ]);
    const res = await request(
      {
        method: "POST",
        url: "/api/upload-slip",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "content-type": "image/png",
        },
        remoteAddress: "127.0.0.120",
      },
      pngHeader
    );
    assert.equal(res.statusCode, 201);
    const data = res.json();
    assert.ok(String(data.url).startsWith("/uploads/"));
    validSlipUrl = data.url;
  });

  test("POST /api/orders rejects invalid/empty payload (400)", async () => {
    const res = await request(
      {
        method: "POST",
        url: "/api/orders",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/json",
        },
        remoteAddress: "127.0.0.121",
      },
      Buffer.from(JSON.stringify({}))
    );
    assert.equal(res.statusCode, 400);
  });

  test("POST /api/orders creates topup order with valid inputs (201)", async () => {
    const payload = {
      package_id: samplePkg.id,
      player_uid: "TEST_UID_9999",
      player_server: sampleGame.require_server ? "Asia" : "",
      player_ign: "UnitTester",
      customer_phone: "0812345678",
      customer_line: "@unittester",
      payment_slip_url: validSlipUrl,
    };
    const res = await request(
      {
        method: "POST",
        url: "/api/orders",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/json",
        },
        remoteAddress: "127.0.0.122",
      },
      Buffer.from(JSON.stringify(payload))
    );
    assert.equal(res.statusCode, 201);
    const data = res.json();
    assert.ok(data.order);
    assert.match(data.order.order_code, /^TOP-\d{8}-[A-F0-9]{8}$/);
    assert.equal(data.order.phone_last4, "5678");
    createdOrderCode = data.order.order_code;
  });

  test("POST /api/orders prevents slip replay attack (409)", async () => {
    const payload = {
      package_id: samplePkg.id,
      player_uid: "TEST_UID_9999",
      player_server: sampleGame.require_server ? "Asia" : "",
      player_ign: "UnitTester",
      customer_phone: "0812345678",
      customer_line: "@unittester",
      payment_slip_url: validSlipUrl,
    };
    const res = await request(
      {
        method: "POST",
        url: "/api/orders",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/json",
        },
        remoteAddress: "127.0.0.123",
      },
      Buffer.from(JSON.stringify(payload))
    );
    assert.equal(res.statusCode, 409);
  });

  test("POST /api/orders/track rejects wrong phone_last4 (404)", async () => {
    const res = await request(
      {
        method: "POST",
        url: "/api/orders/track",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/json",
        },
        remoteAddress: "127.0.0.124",
      },
      Buffer.from(JSON.stringify({ order_code: createdOrderCode, phone_last4: "0000" }))
    );
    assert.equal(res.statusCode, 404);
  });

  test("POST /api/orders/track returns order details on valid match (200)", async () => {
    const res = await request(
      {
        method: "POST",
        url: "/api/orders/track",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/json",
        },
        remoteAddress: "127.0.0.125",
      },
      Buffer.from(JSON.stringify({ order_code: createdOrderCode, phone_last4: "5678" }))
    );
    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.equal(data.order.order_code, createdOrderCode);
    assert.equal(data.order.status, "pending");
  });
});

describe("Admin Authentication & Protected Endpoints", () => {
  let adminSid = "";

  test("POST /api/admin/login rejects wrong credentials (401)", async () => {
    const res = await request(
      {
        method: "POST",
        url: "/api/admin/login",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/json",
        },
        remoteAddress: "127.0.0.130",
      },
      Buffer.from(JSON.stringify({ username: "admin", password: "invalidpassword" }))
    );
    assert.equal(res.statusCode, 401);
  });

  test("POST /api/admin/login grants session cookie on valid credentials (200)", async () => {
    const res = await request(
      {
        method: "POST",
        url: "/api/admin/login",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/json",
        },
        remoteAddress: "127.0.0.131",
      },
      Buffer.from(JSON.stringify({ username: "admin", password: "admin1234" }))
    );
    assert.equal(res.statusCode, 200);
    const setCookie = res.headers["set-cookie"];
    assert.ok(setCookie);
    const match = /pixel_admin_sid=([^;]+)/.exec(setCookie);
    assert.ok(match);
    adminSid = match[1];
  });

  test("GET /api/admin/overview returns dashboard data when authenticated", async () => {
    const res = await request({
      method: "GET",
      url: "/api/admin/overview",
      headers: {
        cookie: `pixel_admin_sid=${adminSid}`,
      },
    });
    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.ok(data.stats);
    assert.ok(data.games);
    assert.ok(data.orders);
  });

  test("GET /api/admin/database/health returns ok status", async () => {
    const res = await request({
      method: "GET",
      url: "/api/admin/database/health",
      headers: {
        cookie: `pixel_admin_sid=${adminSid}`,
      },
    });
    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.equal(data.isHealthy, true);
    assert.equal(data.integrity, "ok");
  });

  test("GET /api/admin/topup-provider returns provider configuration", async () => {
    const res = await request({
      method: "GET",
      url: "/api/admin/topup-provider",
      headers: {
        cookie: `pixel_admin_sid=${adminSid}`,
      },
    });
    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.ok(data.current_mode);
  });

  test("Admin CRUD: create game with starter packages, add/discount/batch-update packages & delete", async () => {
    const adminHeaders = {
      cookie: `pixel_admin_sid=${adminSid}`,
      "x-requested-with": "XMLHttpRequest",
      "content-type": "application/json",
    };

    // 1. Create game with blank slug + starter packages
    const createRes = await request(
      { method: "POST", url: "/api/admin/games", headers: adminHeaders },
      Buffer.from(
        JSON.stringify({
          name: "Zenless Zone Zero",
          publisher: "HoYoverse",
          category: "RPG / Gacha",
          currency_name: "Monochrome",
          uid_label: "UID ตัวเลข",
          create_starter_packages: 1,
        })
      )
    );
    assert.equal(createRes.statusCode, 201);
    const newGame = createRes.json().game;
    assert.ok(newGame.id > 0);
    assert.ok(newGame.slug.startsWith("game-"));
    assert.equal(newGame.packages.length, 3);

    // 2. Create package with blank SKU (auto-generated) & reject duplicate SKU (409)
    const pkgRes = await request(
      { method: "POST", url: "/api/admin/packages", headers: adminHeaders },
      Buffer.from(
        JSON.stringify({
          game_id: newGame.id,
          name: "6,480 Monochrome",
          price: 2690,
          full_price: 3490,
          badge: "VIP",
        })
      )
    );
    assert.equal(pkgRes.statusCode, 201);
    const createdPkg = pkgRes.json().package;
    assert.match(createdPkg.sku, /^PKG-/);

    const dupPkgRes = await request(
      { method: "POST", url: "/api/admin/packages", headers: adminHeaders },
      Buffer.from(
        JSON.stringify({
          game_id: newGame.id,
          sku: createdPkg.sku,
          name: "Duplicate SKU",
          price: 100,
        })
      )
    );
    assert.equal(dupPkgRes.statusCode, 409);

    // 3. Apply 20% discount to the game
    const discRes = await request(
      { method: "POST", url: `/api/admin/games/${newGame.id}/discount`, headers: adminHeaders },
      Buffer.from(JSON.stringify({ percent: 20 }))
    );
    assert.equal(discRes.statusCode, 200);
    const discountedGame = discRes.json().game;
    assert.equal(discountedGame.discount_badge, "ลดสูงสุด 20%");
    const firstPkg = discountedGame.packages.find((p) => p.sort_order === 1);
    assert.equal(firstPkg.price, Math.round(firstPkg.full_price * 0.8));

    // 4. Batch update packages
    const batchRes = await request(
      { method: "PUT", url: "/api/admin/packages/batch", headers: adminHeaders },
      Buffer.from(
        JSON.stringify({
          packages: [{ id: createdPkg.id, price: 2499, full_price: 3490, badge: "HOT", is_active: 1 }],
        })
      )
    );
    assert.equal(batchRes.statusCode, 200);
    const updatedGameInList = batchRes.json().games.find((g) => g.id === newGame.id);
    const updatedPkg = updatedGameInList.packages.find((p) => p.id === createdPkg.id);
    assert.equal(updatedPkg.price, 2499);
    assert.equal(updatedPkg.badge, "HOT");

    // 5. Delete package and game cleanly
    const delPkgRes = await request({
      method: "DELETE",
      url: `/api/admin/packages/${createdPkg.id}`,
      headers: adminHeaders,
    });
    assert.equal(delPkgRes.statusCode, 200);

    const delGameRes = await request({
      method: "DELETE",
      url: `/api/admin/games/${newGame.id}`,
      headers: adminHeaders,
    });
    assert.equal(delGameRes.statusCode, 200);

    const delAgainRes = await request({
      method: "DELETE",
      url: `/api/admin/games/${newGame.id}`,
      headers: adminHeaders,
    });
    assert.equal(delAgainRes.statusCode, 404);
  });

  test("Admin Order Fulfillment & Store Settings update", async () => {
    const adminHeaders = {
      cookie: `pixel_admin_sid=${adminSid}`,
      "x-requested-with": "XMLHttpRequest",
      "content-type": "application/json",
    };

    // Fetch existing order from overview
    const ovRes = await request({
      method: "GET",
      url: "/api/admin/overview",
      headers: { cookie: `pixel_admin_sid=${adminSid}` },
    });
    const existingOrder = ovRes.json().orders[0];
    assert.ok(existingOrder);

    // Update order to completed
    const updRes = await request(
      { method: "PUT", url: `/api/admin/orders/${existingOrder.id}`, headers: adminHeaders },
      Buffer.from(JSON.stringify({ status: "completed", admin_note: "เติมคูปองเรียบร้อยแล้ว" }))
    );
    assert.equal(updRes.statusCode, 200);
    assert.equal(updRes.json().order.status, "completed");
    assert.equal(updRes.json().order.admin_note, "เติมคูปองเรียบร้อยแล้ว");

    // Verify transition metadata prevents duplicate provider dispatch when editing note on completed order
    const directUpdated = await storeDb.updateAdminOrder(existingOrder.id, {
      status: "completed",
      admin_note: "แก้ไขหมายเหตุ",
    });
    assert.equal(directUpdated._wasAlreadyCompleted, true);

    // Update store settings & verify on public storefront
    const setRes = await request(
      { method: "PUT", url: "/api/admin/settings", headers: adminHeaders },
      Buffer.from(
        JSON.stringify({
          store_name: "JustFriend TopUp",
          contact_line: "@justfriend",
          contact_facebook: "fb.com/justfriend",
          ignored_unknown_key: "nope",
        })
      )
    );
    assert.equal(setRes.statusCode, 200);
    assert.equal(setRes.json().settings.store_name, "JustFriend TopUp");
    assert.equal(setRes.json().settings.contact_line, "@justfriend");
    assert.equal(setRes.json().settings.ignored_unknown_key, undefined);
  });
});
