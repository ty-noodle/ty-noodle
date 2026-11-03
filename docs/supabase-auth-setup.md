# Supabase PIN Auth Setup

ระบบนี้ใช้ `Supabase Postgres + service role RPC + signed cookie session` เพื่อให้หน้า login แบบ PIN 6 หลักเข้าได้เร็ว และยังแยกสิทธิ์ `admin/member` ได้จากฐานข้อมูล

## 1. ตั้งค่า Environment

สร้างไฟล์ `.env.local` จาก `.env.example` แล้วใส่ค่า:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_PROJECT_ID=...
SUPABASE_ACCESS_TOKEN=...
SUPABASE_DB_SCHEMAS=public
LOGIN_PIN_PEPPER=...
SESSION_SECRET=...
```

ค่าที่สำคัญมาก:

- `SUPABASE_SERVICE_ROLE_KEY` ใช้เรียก RPC ฝั่ง server เท่านั้น ห้าม expose ไป client
- `SUPABASE_PROJECT_ID` ใช้กับ `npm run gen:types`
- `SUPABASE_ACCESS_TOKEN` ใช้ให้ Supabase CLI ดึง schema types ได้
- `LOGIN_PIN_PEPPER` ใช้ผสมกับ PIN ก่อนทำ lookup/hash
- `SESSION_SECRET` ควรเป็น string สุ่มยาวอย่างน้อย 32 ตัวอักษร

ตัวอย่างการสร้าง secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## 2. รัน Supabase Migrations

รัน migration เหล่านี้กับ project ของคุณ:

- `supabase/migrations/202603160001_secure_pin_auth.sql`
- `supabase/migrations/202603160002_business_core.sql`

สิ่งที่ migration จะสร้าง:

- auth tables: `organizations`, `app_users`, `app_sessions`, `auth_audit_logs`
- business tables: `customers`, `products`, `customer_product_prices`, `orders`, `order_items`, `deliveries`, `delivery_items`, `receivables`, `payment_collections`
- enums, indexes, triggers และ RLS พร้อมฐานสำหรับขยายระบบในอนาคต

## 3. Seed ผู้ใช้แรก

ใช้ script นี้สร้างองค์กรและผู้ใช้คนแรก:

```bash
$env:SEED_ORGANIZATION_SLUG="ty-noodle"
$env:SEED_ORGANIZATION_NAME="T&Y Noodles"
$env:SEED_USER_DISPLAY_NAME="Owner"
$env:SEED_USER_ROLE="admin"
$env:SEED_USER_PIN="123456"
$env:SEED_USER_EMAIL="owner@example.com"
node scripts/upsert-pin-user.mjs
```

ถ้าไม่ต้องการ email สามารถไม่ใส่ `SEED_USER_EMAIL` ได้

## 3.1 Generate TypeScript Types

หลังจากสร้างตารางใน Supabase แล้ว ให้รัน:

```bash
npm run gen:types
```

ไฟล์ที่ได้จะถูกเขียนทับที่ `src/types/database.ts` เพื่อให้ import type ไปใช้ใน app ได้ตรงกับ schema จริง

## 4. วิธีล็อกอินทำงานอย่างไร

1. ผู้ใช้กรอก PIN 6 หลัก
2. Server action สร้าง `pin_lookup` ด้วย HMAC เพื่อหา user จาก index ได้เร็ว
3. ถ้าเจอ user จะตรวจ `pin_hash` ด้วย `scrypt`
4. ถ้ากรอกผิด ระบบจะเพิ่ม failed attempts และ lock 15 นาทีเมื่อผิดครบ 5 ครั้ง
5. ถ้าถูก ระบบจะสร้าง session row ใน `app_sessions`
6. ฝั่ง Next.js จะเซ็น cookie แบบ `httpOnly` เพื่อใช้ตรวจ route ได้เร็วโดยไม่ query DB ทุกครั้ง

## 5. เหตุผลด้าน Performance

- login query หลักใช้ `pin_lookup` แบบ unique index จึงเร็วมาก
- การตรวจ protected route ใช้ signed cookie แบบ optimistic check จึงไม่ต้องรอ Supabase ทุก navigation
- session ยังถูกเก็บใน DB เพื่อรองรับ audit, revoke session และการขยายระบบในอนาคต
- business tables ทุกตัวมี `organization_id` และ indexes สำหรับ query หลักตั้งแต่ต้น

## 6. สิทธิ์ผู้ใช้

- `admin`: เห็นหน้าจัดการและรายงานทั้งหมด
- `member`: เห็นเฉพาะ flow ปฏิบัติงานที่อนุญาต

ตอนนี้ role ถูกเก็บใน `public.app_users.role` และอยู่ใน session cookie ด้วย เพื่อให้ route/UI ตรวจได้เร็ว
