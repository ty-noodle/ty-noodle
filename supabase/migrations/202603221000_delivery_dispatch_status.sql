-- Add physical dispatch tracking to delivery_notes.
-- dispatch_status tracks whether items were physically handed to the driver and delivered.
-- This is separate from `status` (document status: confirmed/cancelled).

alter table delivery_notes
  add column dispatch_status text not null default 'pending'
    check (dispatch_status in ('pending', 'delivered', 'problem')),
  add column dispatched_at   timestamptz,
  add column dispatch_note   text;

comment on column delivery_notes.dispatch_status is
  'Physical delivery status: pending=not yet sent, delivered=confirmed received, problem=delivery issue';
comment on column delivery_notes.dispatched_at is
  'Timestamp when the delivery was marked as delivered';
comment on column delivery_notes.dispatch_note is
  'Note when dispatch_status = problem (e.g. store closed, refused delivery)';

-- Index for delivery workboard: filter by org + date + status
create index delivery_notes_dispatch_idx
  on delivery_notes (organization_id, delivery_date desc, dispatch_status);
