# 🏗️ โครงสร้างโปรเจกต์แยกตาม Layer (Clean Layered Architecture + React)

โปรเจกต์ถูกแบ่งแยกส่วน **Frontend (หน้าบ้าน — React + Vite)** และ **Backend (หลังบ้าน — Node.js API & Database)** ออกจากกันอย่างชัดเจน เพื่อให้ต่อยอด แก้ไข และทำงานร่วมกันได้ง่ายที่สุด

```text
d:\foru\
├── frontend/                         # 🎨 FRONTEND LAYER (React + Vite Storefront & Admin)
│   ├── src/                          # 1. โค้ดหน้าร้านลูกค้า (React Components & Styles)
│   │   ├── main.jsx                  #    - จุดเริ่มต้นบูตแอป React
│   │   ├── App.jsx                   #    - ตัวจัดการหน้าหลัก สลับหน้ารวมเกม <-> ตะกร้าเกม (?game=slug)
│   │   ├── components/
│   │   │   ├── Navbar.jsx            #    - แถบเมนูบนสุด + ปุ่มเช็คสถานะออเดอร์
│   │   │   ├── GameCatalog.jsx       #    - หน้าแรกโชว์ไอคอนเกมและชื่อเกม + แอนิเมชันคลิกเด้งปึ๊กกรอบสีฟ้า
│   │   │   ├── GameTopupPage.jsx     #    - หน้าตะกร้าเติมเกม + บันเดิลแนะนำ + เลือกแพ็กเกจเด้งกรอบสีฟ้า
│   │   │   ├── CheckoutSidebar.jsx   #    - สรุปยอดส่วนลดอัตโนมัติ + PromptPay + อัปโหลดสลิป
│   │   │   ├── ReceiptModal.jsx      #    - หน้าต่างใบเสร็จหลังสั่งซื้อสำเร็จ
│   │   │   ├── TrackOrderModal.jsx   #    - หน้าต่างติดตามสถานะคำสั่งซื้อแบบเรียลไทม์
│   │   │   └── Footer.jsx            #    - ส่วนท้ายเว็บไซต์และช่องทางติดต่อ
│   │   ├── styles/
│   │   │   └── storefront.css        #    - ดีไซน์โทนสว่างสดใส + Keyframes แอนิเมชัน springPop & กรอบไฟสีฟ้า
│   │   └── utils/
│   │       └── helpers.js            #    - ฟังก์ชันคำนวณเงิน คัดกรองบันเดิลแนะนำ และจัดการออเดอร์ล่าสุด
│   ├── index.html                    # 2. ไฟล์ HTML ต้นแบบสำหรับ Vite React
│   ├── vite.config.js                # 3. ตั้งค่าการ Build และ Dev Proxy ของ Vite
│   ├── dist/                         # 4. ไฟล์ Production ที่คอมไพล์แล้ว (`npm run build`) เสิร์ฟที่ `/`
│   ├── pages/
│   │   └── admin.html                # 5. หน้าแดชบอร์ดแอดมิน (`/admin`)
│   ├── css/ & js/                    # 6. สไตล์และสคริปต์ของระบบหลังบ้านแอดมิน (`admin.css`, `admin.js`)
│   └── assets/
│       └── images/                   # 7. ไฟล์รูปปกและไอคอนเกม (`rov.png`, `valorant.png`, ฯลฯ)
│
├── backend/                          # ⚙️ BACKEND LAYER (ระบบประมวลผล API & ฐานข้อมูล)
│   ├── config/                       # 1. ชั้นตั้งค่าระบบ (Configuration Layer)
│   │   ├── paths.js                  #    - รวม Path โฟลเดอร์ทั้งหมดไว้จุดเดียว ไม่หลงโฟลเดอร์
│   │   └── env.js                    #    - ตัวโหลดค่าตัวแปรจากไฟล์ .env
│   ├── database/                     # 2. ชั้นฐานข้อมูล (Data Access Layer)
│   │   ├── index.js                  #    - ตัวสลับ Engine อัตโนมัติ (SQLite WAL <-> PostgreSQL)
│   │   ├── sqlite.js                 #    - ฐานข้อมูล SQLite โหมดทนทานสูง + สำรองและกู้คืนอัตโนมัติ
│   │   └── postgres.js               #    - ฐานข้อมูล Cloud PostgreSQL Connection Pool
│   ├── middlewares/                  # 3. ชั้นความปลอดภัย (Security & Auth Middleware Layer)
│   │   ├── auth.middleware.js        #    - เข้ารหัสรหัสผ่าน Scrypt, คุกกี้แอดมิน, ป้องกัน CSRF
│   │   └── security.middleware.js    #    - ตั้งค่า CSP Headers, จำกัดความถี่ Rate Limit, Audit Log
│   ├── services/                     # 4. ชั้นลอจิกธุรกิจและเชื่อมต่อภายนอก (Service Layer)
│   │   ├── upload.service.js         #    - ตรวจสอบไฟล์สลิปแท้ (Magic Bytes) และบันทึกภาพ
│   │   └── topup.service.js          #    - ระบบเติมเกมผ่าน UID (รองรับสลับ Manual / Auto API)
│   ├── routes/                       # 5. ชั้นเส้นทาง API (Route / Controller Layer)
│   │   ├── public.routes.js          #    - API ฝั่งลูกค้า (/api/storefront, /api/orders, ฯลฯ)
│   │   └── admin.routes.js           #    - API ฝั่งแอดมิน (/api/admin/*)
│   └── app.js                        # 6. ตัวรวมระบบ HTTP Router & เสิร์ฟไฟล์ React (`frontend/dist`) + `/admin`
│
├── data/                             # 🗄️ ข้อมูลฐานข้อมูล SQLite (store.db) และไฟล์สำรอง (backups/)
├── uploads/                          # 🖼️ รูปสลิปโอนเงินและรูปภาพที่อัปโหลดเข้ามา
├── server.js                         # 🚀 จุดเริ่มต้นรันเซิร์ฟเวอร์ (`node server.js` หรือ `npm start`)
├── .env                              # ตั้งค่าตัวแปรสภาพแวดล้อมจริง (ไม่ขึ้น Git)
├── .env.example                      # ตัวอย่างการตั้งค่า .env
└── package.json                      # ข้อมูลโปรเจกต์และสคริปต์คำสั่งรัน (`npm run build`, `npm start`)
```

---

## 💡 เวลาจะแก้ไขงานต่อ ต้องไปที่ไหน?

| สิ่งที่ต้องการแก้ | โฟลเดอร์ / ไฟล์ที่ต้องเปิดดู |
| :--- | :--- |
| แก้หน้าแรกแคตตาล็อกไอคอนเกม (React) | `frontend/src/components/GameCatalog.jsx` |
| แก้หน้าตะกร้าเติมเกม & บันเดิลแนะนำ (React) | `frontend/src/components/GameTopupPage.jsx`, `frontend/src/components/CheckoutSidebar.jsx` |
| แก้แอนิเมชันเด้งปึ๊ก / สีกรอบสีฟ้า / ดีไซน์หน้าร้าน | `frontend/src/styles/storefront.css` (แก้เสร็จรัน `npm run build`) |
| แก้หน้าแอดมิน / ปุ่มโปรโมชั่น / Modal | `frontend/pages/admin.html`, `frontend/css/admin.css`, `frontend/js/admin.js` |
| เพิ่มรูปไอคอนเกมเริ่มต้น | `frontend/assets/images/` |
| แก้หรือเพิ่ม API ฝั่งลูกค้า | `backend/routes/public.routes.js` |
| แก้หรือเพิ่ม API ฝั่งแอดมิน | `backend/routes/admin.routes.js` |
| เชื่อมต่อ API เติมเกมอัตโนมัติ (Provider) | `backend/services/topup.service.js` |
| แก้ตารางฐานข้อมูล / Query ข้อมูล | `backend/database/sqlite.js` และ `backend/database/postgres.js` |
| ปรับแก้ความปลอดภัย / Rate Limit | `backend/middlewares/auth.middleware.js`, `backend/middlewares/security.middleware.js` |
