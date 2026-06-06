-- Create index for billing records date-range queries
-- This improves performance of getBilledDeliveryNumbersForRange lookup
create index if not exists billing_records_org_dates_idx
on public.billing_records (organization_id, from_date, to_date);
