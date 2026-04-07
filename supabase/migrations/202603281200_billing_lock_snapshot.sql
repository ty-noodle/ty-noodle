-- 1. Unique constraint: ลูกค้าคนเดียว + ช่วงวันเดียว = ออกใบวางบิลได้แค่ 1 ใบ
--    ถ้ากดปริ้นซ้ำ จะ reuse เลขเดิม ไม่สร้างแถวใหม่
alter table public.billing_records
  add constraint billing_records_unique_per_period
  unique (organization_id, customer_id, from_date, to_date);

-- 2. Snapshot: เก็บรายการ DN ณ วันที่ออกใบ เพื่อล็อกยอด
--    ถ้าแก้ DN ย้อนหลัง ใบวางบิลที่ออกแล้วจะยังแสดงยอดเดิม
alter table public.billing_records
  add column if not exists snapshot_rows jsonb;
