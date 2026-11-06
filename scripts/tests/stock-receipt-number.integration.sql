-- Run inside a transaction and ROLLBACK: no receipt or stock changes persist.
do $$
declare
  v_org uuid;
  v_number text;
begin
  select id into strict v_org from public.organizations order by created_at limit 1;

  -- A backdated receipt must still reserve the number printed on it.
  insert into public.inventory_receipts (organization_id, receipt_number, received_at)
  values (v_org, 'RCV97010201', '2097-01-01 12:00:00+07');
  v_number := public.generate_receipt_number(v_org, date '2097-01-02');
  if v_number <> 'RCV97010202' then
    raise exception 'Backdated receipt number reused: %', v_number;
  end if;

  -- Allocations are reserved even before the caller saves a receipt.
  v_number := public.generate_receipt_number(v_org, date '2097-01-02');
  if v_number <> 'RCV97010203' then
    raise exception 'Uncommitted receipt allocation reused: %', v_number;
  end if;

  -- Deletions/gaps and the 100th receipt must not recycle or truncate numbers.
  insert into public.inventory_receipts (organization_id, receipt_number, received_at)
  values (v_org, 'RCV97010299', '2097-01-01 12:00:00+07');
  v_number := public.generate_receipt_number(v_org, date '2097-01-02');
  if v_number <> 'RCV970102100' then
    raise exception 'Receipt sequence overflow: %', v_number;
  end if;

  v_number := public.generate_receipt_number(v_org, date '2097-01-03');
  if v_number <> 'RCV97010301' then
    raise exception 'Daily receipt sequence did not reset: %', v_number;
  end if;
end;
$$;
