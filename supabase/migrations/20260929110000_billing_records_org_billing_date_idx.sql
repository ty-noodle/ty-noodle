-- Index to optimize billing report date-range queries
create index if not exists billing_records_org_billing_date_idx
on public.billing_records (organization_id, billing_date);
