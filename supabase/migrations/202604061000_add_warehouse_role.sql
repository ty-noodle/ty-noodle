-- Add warehouse role to app_role enum.
-- This role can only view and print the packing list (ใบจัดของ).
-- It cannot access the dashboard or any admin/member-only routes.

alter type public.app_role add value if not exists 'warehouse';
