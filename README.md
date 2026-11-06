# 🎮 Clean Game Top-Up Store (Direct UID)

เว็บระบบเติมเกมออนไลน์ผ่าน UID พร้อมระบบตะกร้าสินค้า โปรโมชั่นส่วนลด และระบบจัดการหลังบ้าน (Admin Dashboard)

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
├── frontend/             # โค้ดส่วนหน้าบ้าน (React + Vite) และหน้าแอดมิน
│   ├── src/              # React Components, Styles, Helpers
│   ├── pages/            # admin.html
│   ├── dist/             # ผลลัพธ์จากการ build สำหรับ production
│   └── vite.config.js
├── backend/              # โค้ดส่วนหลังบ้าน (Node.js HTTP Server & Services)
│   ├── config/           # ตั้งค่า paths และ env
│   ├── database/         # SQLite & PostgreSQL engine
│   ├── middlewares/      # Security, CSRF, Auth, Rate Limiting
│   ├── routes/           # Public & Admin API routes
│   └── services/         # Upload & Topup services
├── data/                 # ที่เก็บฐานข้อมูล SQLite (ไม่ขึ้น git)
├── uploads/              # ที่เก็บไฟล์สลิป (ไม่ขึ้น git)
└── server.js             # Entry point หลักของระบบ
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
