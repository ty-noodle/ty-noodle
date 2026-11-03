-- Drop the restrictive unit check constraint.
-- The application UI allows free-text unit input (e.g. หลอด, ขวด, ถุง, กล่อง)
-- so the DB should not restrict values to a hardcoded English list.
alter table public.products
  drop constraint if exists products_unit_check;
