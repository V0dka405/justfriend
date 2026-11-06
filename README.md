# 🎮 Clean Game Top-Up Store (Direct UID)

เว็บระบบเติมเกมออนไลน์ผ่าน UID พร้อมระบบตะกร้าสินค้า โปรโมชั่นส่วนลด และระบบจัดการหลังบ้าน (Admin Dashboard) ออกแบบตามสถาปัตยกรรม **Clean Layered Architecture** เพื่อให้ทีมพัฒนาอ่านเข้าใจง่าย ดูแลรักษาและเขียนต่อยอดได้ทันที

---

## ✨ จุดเด่นของระบบ

- **หน้าบ้าน (Storefront) ด้วย React + Vite**:
  - แคตตาล็อกเกมแบบมินิมอล แสดงเฉพาะไอคอนและชื่อเกม
  - เอฟเฟกต์แอนิเมชันคลิกเด้งสปริงพร้อมกรอบไฟสีฟ้าเรืองแสง (`springPop` & Blue Glow)
  - หน้าสั่งซื้อแยกเฉพาะเกม (`?game=<slug>`) พร้อมโซน **🔥 บันเดิลใหม่ & แพ็กแนะนำ**
  - ตะกร้าคำนวณราคาส่วนลดโปรโมชั่นอัตโนมัติ
  - ชำระเงินผ่าน PromptPay QR Code พร้อมปุ่มคัดลอกเลขบัญชี และระบบอัปโหลดสลิป
  - ระบบตรวจสอบสถานะคำสั่งซื้อแบบเรียลไทม์ (บันทึกออเดอร์ล่าสุดในเครื่องอัตโนมัติ)
- **หลังบ้าน (Admin Control Room)**:
  - ตรวจสอบสลิปโอนเงิน อนุมัติหรือยกเลิกออเดอร์
  - จัดการเกม แพ็กเกจ ราคา ป้ายโปรโมชั่น
  - สำรองและกู้คืนฐานข้อมูล
- **ระบบฐานข้อมูลสองระบบ (Dual-Engine)**:
  - ค่าเริ่มต้นใช้ **SQLite WAL Mode** ที่ทนทานสูง พร้อมระบบกู้คืนและสำรองข้อมูลอัตโนมัติ
  - รองรับการต่อยอดเป็น **PostgreSQL** เพียงตั้งค่า `DATABASE_URL` ใน `.env`
- **ความปลอดภัยระดับสูง**:
  - ป้องกัน CSRF (`X-Requested-With: XMLHttpRequest`)
  - Content Security Policy (CSP), Rate Limiting, และ Image Magic-Byte Validation

---

## 🛠️ โครงสร้างโปรเจกต์ (Clean Layered Architecture)

```text
d:\foru\
├── frontend/             # 🎨 FRONTEND LAYER (React + Vite)
│   ├── src/              # React Components, Styles, Helpers & API Client
│   │   ├── components/   # Navbar, GameCatalog, GameTopupPage, CheckoutSidebar, ฯลฯ
│   │   ├── styles/       # storefront.css (Theme & Animations)
│   │   └── utils/        # api.js (ตัวกลางเรียก API + CSRF), helpers.js (คำนวณเงิน/รูปปก/Storage)
│   ├── pages/            # admin.html (แผงควบคุมหลังบ้าน)
│   ├── css/ & js/        # สไตล์และสคริปต์ของแอดมิน (theme.css, admin.css, admin.js)
│   ├── dist/             # ผลลัพธ์จากการ build สำหรับ production
│   └── vite.config.mjs   # ค่าคอนฟิก Vite สำหรับ React (ESM)
├── backend/              # ⚙️ BACKEND LAYER (Node.js HTTP Server & Services)
│   ├── config/           # paths.js (รวม path โฟลเดอร์ + รองรับ test override) และ env.js
│   ├── database/         # Dual-Engine: shared.js (กฎ/ข้อมูลกลาง), sqlite.js, postgres.js
│   ├── middlewares/      # auth.middleware.js, security.middleware.js
│   ├── routes/           # public.routes.js, admin.routes.js
│   └── services/         # upload.service.js, topup.service.js
├── scripts/              # 🔍 DEV & CI SCRIPTS
│   └── verify.js         # เช็ก Syntax ทั้งโปรเจกต์ + Build React + รัน Test แยกฐานข้อมูลจำลอง
├── tests/                # 🧪 AUTOMATED TESTS (Unit & Integration Tests)
│   └── api.test.js       # ชุดทดสอบ API ทั้งฝั่งลูกค้าและแอดมินผ่าน node:test (Isolated Temp DB)
├── data/                 # ที่เก็บฐานข้อมูล SQLite (ไม่ขึ้น git)
├── uploads/              # ที่เก็บไฟล์สลิป (ไม่ขึ้น git)
├── .editorconfig         # มาตรฐานการตั้งค่า Indent / Encoding สำหรับทีม
└── server.js             # จุดเริ่มต้นรันเซิร์ฟเวอร์
```

---

## 🚀 วิธีติดตั้งและเริ่มใช้งาน

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. สร้างไฟล์การตั้งค่า (.env)
คัดลอกไฟล์ `.env.example` เป็น `.env`:
```bash
cp .env.example .env
```

### 3. Build หน้าบ้าน React
```bash
npm run build
```

### 4. รันเซิร์ฟเวอร์
```bash
npm start
```
- **หน้าร้านค้า**: [http://localhost:3000](http://localhost:3000)
- **ระบบจัดการหลังบ้าน (Admin)**: [http://localhost:3000/admin](http://localhost:3000/admin)
  - บัญชีเริ่มต้น: `admin` / `admin1234`

---

## 🧪 การตรวจสอบความถูกต้องและรันชุดทดสอบ (Verification & Automated Tests)

ก่อน Commit หรือเปิด Pull Request แนะนำให้รันคำสั่งเดียวเพื่อเช็กทั้งระบบ:
```bash
npm run verify
```
คำสั่ง `npm run verify` จะทำงาน 3 ขั้นตอนอัตโนมัติ:
1. ตรวจสอบไวยากรณ์ (`node --check`) ของไฟล์ Backend ทุกไฟล์และ `frontend/js/admin.js`
2. ทดสอบคอมไพล์หน้าบ้าน React (`npm run build`) ให้พร้อมเสิร์ฟที่ `frontend/dist/`
3. รันชุดทดสอบ API และความปลอดภัยทั้งหมด (`npm test`) ใน **Temp Directory แยกต่างหาก** (ไม่ปะปนหรือเขียนทับ `data/store.db` และ `uploads/` ของจริง)

หากต้องการรันเฉพาะชุดทดสอบ API อย่างเดียว:
```bash
npm test
```

---

## 👥 คู่มือสำหรับทีมพัฒนา (Developer & Contribution Guide)

1. **มาตรฐานการจัดฟอร์แมตโค้ด (`.editorconfig`)**:
   - โปรเจกต์มีไฟล์ `.editorconfig` กำหนด UTF-8, LF, และย่อหน้า 2 ช่องว่าง เพื่อให้โค้ดของทุกคนในทีมเป็นมาตรฐานเดียวกัน
2. **การแก้ไขหน้าตาหรือเชื่อมต่อ API ฝั่งหน้าร้าน (React)**:
   - คอมโพเนนต์อยู่ที่ `frontend/src/components/`
   - **ห้ามเขียน `fetch()` ตรงๆ ในคอมโพเนนต์** — ให้เรียกหรือเพิ่มฟังก์ชันใน `frontend/src/utils/api.js` ซึ่งแนบ CSRF Header (`X-Requested-With: XMLHttpRequest`) และแปลง Error ให้อัตโนมัติ
   - หลังแก้ไข รัน `npm run build` (หรือ `npm run verify`) เพื่ออัปเดต `frontend/dist/` หรือใช้ `npm run dev:frontend` สำหรับโหมด Hot-Reload
3. **การเพิ่ม API หรือแก้ลอจิกฐานข้อมูล**:
   - API ลูกค้าอยู่ที่ `backend/routes/public.routes.js` / API แอดมินอยู่ที่ `backend/routes/admin.routes.js` (ผ่าน `requireAdmin`)
   - กฎ Validation, การคำนวณส่วนลด, รหัสออเดอร์ และข้อมูลเกมเริ่มต้น ถูกรวมศูนย์ไว้ที่เดียวใน `backend/database/shared.js` เพื่อให้ทั้ง `sqlite.js` และ `postgres.js` ทำงานตรงกัน 100%
4. **การทดสอบความปลอดภัย**:
   - ทุกคำขอที่เป็น `POST` / `PUT` / `DELETE` ต้องแนบ Header `X-Requested-With: XMLHttpRequest` เสมอ เพื่อป้องกัน CSRF
