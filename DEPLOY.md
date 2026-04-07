# DEPLOY.md — คู่มือเตรียม Deploy

## 1. Environment Variables

ตั้งค่า Environment Variables เหล่านี้บน Vercel (Settings → Environment Variables)
**ห้ามนำค่าจาก `.env.local` ขึ้น production โดยตรง** — ต้องกรอกใหม่บน Vercel

| Variable | ค่าที่ต้องใส่ |
|----------|--------------|
| `NEXT_PUBLIC_SITE_URL` | URL จริงของเว็บ เช่น `https://tynoodle.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SUPABASE_PROJECT_ID` | Supabase project ID |
| `SUPABASE_ACCESS_TOKEN` | Supabase access token |
| `SUPABASE_DB_SCHEMAS` | `public` |
| `LOGIN_PIN_PEPPER` | ค่า hex 32 bytes — **ห้ามเปลี่ยนหลัง deploy แรก** (PIN ทุกคนจะใช้ไม่ได้) |
| `SESSION_SECRET` | ค่า hex สำหรับ sign cookie — **ห้ามเปลี่ยนหลัง deploy** (session ทุกคนจะหมดอายุ) |
| `NEXT_PUBLIC_LIFF_ID` | LIFF ID จาก LINE Developers Console |
| `LINE_CHANNEL_ACCESS_TOKEN` | Channel Access Token จาก LINE Developers |
| `LINE_GROUP_ID` | Group ID ของกลุ่ม LINE ที่ใช้รับแจ้งเตือนออเดอร์ |

> **สิ่งที่ต้องไม่มีบน production:**
> `NEXT_PUBLIC_LIFF_MOCK` — ต้องไม่ตั้งค่านี้ หรือตั้งเป็น `false`
> ถ้าตั้งเป็น `true` ลูกค้าจะ login LINE ไม่ได้จริง

---

## 2. LINE LIFF — ตั้งค่า Endpoint URL

1. เปิด [developers.line.biz](https://developers.line.biz) → เลือก Provider → เลือก LIFF app
2. แก้ **Endpoint URL** เป็น URL จริง:
   ```
   https://tynoodle.vercel.app/order
   ```
3. กด **Update**

> ถ้า Endpoint URL ยังเป็น localhost หรือ ngrok — ลูกค้าจะ login LINE ไม่ได้บน production

---

## 3. LINE Messaging API — Webhook URL

1. LINE Developers Console → Messaging API channel → Webhook settings
2. แก้ Webhook URL เป็น:
   ```
   https://tynoodle.vercel.app/api/line/webhook
   ```
3. กด **Update** แล้วกด **Verify**
4. ตรวจสอบว่า **Use webhook** เปิดอยู่ (ON)

---

## 4. LINE Group ID (ถ้ายังไม่มี)

ถ้ายังไม่เคยจับ Group ID บน production:

1. ตั้ง Webhook URL ข้างบนก่อน
2. **Kick LINE OA ออกจากกลุ่ม แล้วเชิญใหม่**
3. ดู log บน Vercel Dashboard → Logs → ค้นหา `line/webhook`
   จะเห็น: `[line/webhook] OA joined group. Set LINE_GROUP_ID = Cxxx...`
4. คัดลอก Group ID ไปใส่ใน Environment Variable `LINE_GROUP_ID` บน Vercel
5. Redeploy (หรือ trigger new deployment)

---

## 5. Supabase — ตรวจสอบ Migration

ก่อน deploy ครั้งแรก ตรวจสอบว่า migration ทุกตัวถูก apply บน Supabase แล้ว:

```bash
npx supabase db push
```

หรือเข้า Supabase Dashboard → SQL Editor แล้วรัน migration ใน `supabase/migrations/` ตามลำดับ

---

## 6. Checklist ก่อน Go Live

- [ ] Environment Variables ครบทุกตัวบน Vercel
- [ ] `NEXT_PUBLIC_LIFF_MOCK` ไม่ได้ตั้งค่า หรือเป็น `false`
- [ ] `NEXT_PUBLIC_SITE_URL` เป็น URL จริง ไม่ใช่ localhost
- [ ] LIFF Endpoint URL อัปเดตเป็น production URL แล้ว
- [ ] Webhook URL อัปเดตเป็น production URL แล้ว + Verify ผ่าน
- [ ] `LINE_GROUP_ID` มีค่าแล้ว
- [ ] Supabase migration apply ครบแล้ว
- [ ] Build ผ่าน: `npm run build`
- [ ] สร้าง admin user คนแรกด้วย `node scripts/upsert-pin-user.mjs`
