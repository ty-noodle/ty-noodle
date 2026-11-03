-- Add phone + structured address fields to customers for LINE self-registration flow.
-- Customers now register their store info once via LIFF; admin sets pricing later.

alter table public.customers
  add column if not exists phone        text,
  add column if not exists province    text,
  add column if not exists district    text,
  add column if not exists subdistrict text,
  add column if not exists postal_code text;

comment on column public.customers.phone        is 'เบอร์โทรศัพท์ร้าน — filled during LINE self-registration';
comment on column public.customers.province    is 'จังหวัด — filled during LINE self-registration';
comment on column public.customers.district    is 'อำเภอ/เขต — filled during LINE self-registration';
comment on column public.customers.subdistrict is 'ตำบล/แขวง — filled during LINE self-registration';
comment on column public.customers.postal_code is 'รหัสไปรษณีย์ — auto-filled from subdistrict selection';
