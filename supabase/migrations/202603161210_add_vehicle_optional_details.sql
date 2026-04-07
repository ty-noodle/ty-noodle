begin;

alter table public.vehicles
  add column if not exists license_plate text null,
  add column if not exists driver_name text null;

commit;
