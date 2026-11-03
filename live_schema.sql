


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'member',
    'warehouse'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."order_status" AS ENUM (
    'draft',
    'submitted',
    'confirmed',
    'cancelled'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_delivery_note_item"("p_organization_id" "uuid", "p_delivery_note_item_id" "uuid", "p_new_quantity_delivered" numeric, "p_adjusted_by" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.adjust_delivery_note_item(
    p_organization_id,
    p_delivery_note_item_id,
    p_new_quantity_delivered,
    p_adjusted_by,
    'lost'
  );
$$;


ALTER FUNCTION "public"."adjust_delivery_note_item"("p_organization_id" "uuid", "p_delivery_note_item_id" "uuid", "p_new_quantity_delivered" numeric, "p_adjusted_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_delivery_note_item"("p_organization_id" "uuid", "p_delivery_note_item_id" "uuid", "p_new_quantity_delivered" numeric, "p_adjusted_by" "uuid", "p_resolution_mode" "text" DEFAULT 'lost'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_dn_id uuid;
  v_dn_number text;
  v_order_item_id uuid;
  v_order_id uuid;
  v_product_id uuid;
  v_old_line_total numeric;
  v_old_qty_delivered numeric;
  v_unit_price numeric;
  v_sale_unit_ratio numeric;
  v_old_qty_base numeric;
  v_new_qty_base numeric;
  v_qty_base_delta numeric;
  v_new_line_total numeric;
  v_stock_before numeric;
  v_stock_after numeric;
  v_order_item_delivered numeric;
  v_order_item_sale_ratio numeric;
  v_order_item_unit_price numeric;
  v_order_item_qty_sale numeric;
  v_all_delivered boolean;
  v_any_delivered boolean;
  v_new_fulfillment text;
  v_mode text;
BEGIN
  IF p_new_quantity_delivered < 0 THEN
    RAISE EXCEPTION 'Quantity must be zero or greater';
  END IF;

  v_mode := lower(coalesce(nullif(trim(p_resolution_mode), ''), 'lost'));
  IF v_mode NOT IN ('lost', 'return_to_stock') THEN
    RAISE EXCEPTION 'Invalid resolution mode: %', p_resolution_mode;
  END IF;

  SELECT
    dni.delivery_note_id,
    dn.delivery_number,
    dni.order_item_id,
    oi.order_id,
    dni.product_id,
    dni.line_total,
    dni.quantity_delivered,
    dni.unit_price,
    dni.sale_unit_ratio
  INTO
    v_dn_id,
    v_dn_number,
    v_order_item_id,
    v_order_id,
    v_product_id,
    v_old_line_total,
    v_old_qty_delivered,
    v_unit_price,
    v_sale_unit_ratio
  FROM public.delivery_note_items dni
  JOIN public.delivery_notes dn
    ON dn.id = dni.delivery_note_id
  LEFT JOIN public.order_items oi
    ON oi.id = dni.order_item_id
  WHERE dni.id = p_delivery_note_item_id
    AND dn.organization_id = p_organization_id
    AND dn.status = 'confirmed'
  FOR UPDATE OF dn;

  IF v_dn_id IS NULL THEN
    RAISE EXCEPTION 'Delivery note item not found, or delivery note is not confirmed';
  END IF;

  IF p_new_quantity_delivered > v_old_qty_delivered THEN
    RAISE EXCEPTION 'Cannot increase delivered quantity in adjustment mode';
  END IF;

  IF v_order_item_id IS NULL OR v_order_id IS NULL THEN
    RAISE EXCEPTION 'Delivery note item is not linked to an order item';
  END IF;

  v_old_qty_base := v_old_qty_delivered * v_sale_unit_ratio;
  v_new_qty_base := p_new_quantity_delivered * v_sale_unit_ratio;
  v_qty_base_delta := greatest(v_old_qty_base - v_new_qty_base, 0);
  v_new_line_total := round(p_new_quantity_delivered * v_unit_price, 2);

  IF p_new_quantity_delivered = 0 THEN
    DELETE FROM public.delivery_note_items
    WHERE id = p_delivery_note_item_id;
  ELSE
    UPDATE public.delivery_note_items
    SET
      quantity_delivered = p_new_quantity_delivered,
      quantity_in_base_unit = v_new_qty_base,
      line_total = v_new_line_total
    WHERE id = p_delivery_note_item_id;
  END IF;

  UPDATE public.delivery_notes
  SET total_amount = round(total_amount + (v_new_line_total - v_old_line_total), 2)
  WHERE id = v_dn_id;

  IF v_mode = 'return_to_stock' AND v_qty_base_delta > 0 THEN
    SELECT p.stock_quantity
    INTO v_stock_before
    FROM public.products p
    WHERE p.id = v_product_id
      AND p.organization_id = p_organization_id
    FOR UPDATE;

    IF v_stock_before IS NULL THEN
      RAISE EXCEPTION 'Product not found in this organization';
    END IF;

    v_stock_after := v_stock_before + v_qty_base_delta;

    UPDATE public.products
    SET stock_quantity = v_stock_after
    WHERE id = v_product_id;

    INSERT INTO public.inventory_movements (
      organization_id,
      product_id,
      movement_type,
      quantity_delta,
      stock_before,
      stock_after,
      reference_number,
      notes,
      metadata,
      created_by
    ) VALUES (
      p_organization_id,
      v_product_id,
      'adjustment',
      v_qty_base_delta,
      v_stock_before,
      v_stock_after,
      v_dn_number,
      'Return stock from delivery quantity adjustment',
      jsonb_build_object(
        'source', 'delivery_adjustment',
        'resolution_mode', v_mode,
        'delivery_note_id', v_dn_id,
        'delivery_note_item_id', p_delivery_note_item_id,
        'quantity_base_delta', v_qty_base_delta
      ),
      p_adjusted_by
    );

    SELECT coalesce(sum(dni.quantity_in_base_unit), 0)
    INTO v_order_item_delivered
    FROM public.delivery_note_items dni
    JOIN public.delivery_notes dn ON dn.id = dni.delivery_note_id
    WHERE dni.order_item_id = v_order_item_id
      AND dn.status = 'confirmed';

    SELECT
      greatest(coalesce(nullif(oi.sale_unit_ratio, 0), 1), 0.001),
      coalesce(oi.unit_price, 0)
    INTO v_order_item_sale_ratio, v_order_item_unit_price
    FROM public.order_items oi
    WHERE oi.id = v_order_item_id
    FOR UPDATE;

    v_order_item_qty_sale := round(v_order_item_delivered / v_order_item_sale_ratio, 3);

    UPDATE public.order_items
    SET
      quantity_in_base_unit = v_order_item_delivered,
      quantity = v_order_item_qty_sale,
      line_total = round(v_order_item_qty_sale * v_order_item_unit_price, 2),
      updated_at = timezone('utc', now())
    WHERE id = v_order_item_id;

    UPDATE public.orders o
    SET total_amount = coalesce((
      SELECT round(sum(oi.line_total), 2)
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ), 0)
    WHERE o.id = v_order_id;
  END IF;

  SELECT
    bool_and(coalesce(d.delivered_qty, 0) >= oi.quantity_in_base_unit),
    bool_or(coalesce(d.delivered_qty, 0) > 0)
  INTO v_all_delivered, v_any_delivered
  FROM public.order_items oi
  LEFT JOIN (
    SELECT
      dni.order_item_id,
      sum(dni.quantity_in_base_unit) AS delivered_qty
    FROM public.delivery_note_items dni
    JOIN public.delivery_notes dn ON dn.id = dni.delivery_note_id
    WHERE dn.status = 'confirmed'
      AND dni.order_item_id IN (
        SELECT id FROM public.order_items WHERE order_id = v_order_id
      )
    GROUP BY dni.order_item_id
  ) d ON d.order_item_id = oi.id
  WHERE oi.order_id = v_order_id;

  v_new_fulfillment := CASE
    WHEN coalesce(v_all_delivered, false) THEN 'complete'
    WHEN coalesce(v_any_delivered, false) THEN 'partial'
    ELSE 'pending'
  END;

  UPDATE public.orders
  SET fulfillment_status = v_new_fulfillment
  WHERE id = v_order_id;
END;
$$;


ALTER FUNCTION "public"."adjust_delivery_note_item"("p_organization_id" "uuid", "p_delivery_note_item_id" "uuid", "p_new_quantity_delivered" numeric, "p_adjusted_by" "uuid", "p_resolution_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_inventory"("p_organization_id" "uuid", "p_product_id" "uuid", "p_new_stock_quantity" numeric, "p_adjusted_by" "uuid", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_old_stock numeric;
    v_quantity_delta numeric;
BEGIN
    -- Get current stock with row-level locking
    SELECT stock_quantity INTO v_old_stock
    FROM public.products
    WHERE id = p_product_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found';
    END IF;

    -- Calculate delta
    v_quantity_delta := p_new_stock_quantity - v_old_stock;

    -- Only record and update if there is a change
    IF v_quantity_delta <> 0 THEN
        -- Update product stock
        UPDATE public.products
        SET stock_quantity = p_new_stock_quantity,
            updated_at = now()
        WHERE id = p_product_id AND organization_id = p_organization_id;

        -- Insert movement log
        INSERT INTO public.inventory_movements (
            organization_id,
            product_id,
            movement_type,
            quantity_delta,
            stock_before,
            stock_after,
            notes,
            created_by,
            created_at
        ) VALUES (
            p_organization_id,
            p_product_id,
            'adjustment',
            v_quantity_delta,
            v_old_stock,
            p_new_stock_quantity,
            p_notes,
            p_adjusted_by,
            now()
        );
    END IF;
END;
$$;


ALTER FUNCTION "public"."adjust_inventory"("p_organization_id" "uuid", "p_product_id" "uuid", "p_new_stock_quantity" numeric, "p_adjusted_by" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."allocate_requisition_document_numbers"("requested_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()), "requested_count" integer DEFAULT 1) RETURNS TABLE("sequence_key" "text", "sequence_value" integer, "document_no" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
declare
  safe_requested_at timestamptz := coalesce(requested_at, timezone('utc', now()));
  safe_requested_count integer := greatest(coalesce(requested_count, 0), 0);
  be_year integer;
  yy text;
  mm text;
  seq_key text;
  final_last_value integer;
  start_value integer;
begin
  if safe_requested_count <= 0 then
    return;
  end if;

  be_year := extract(year from safe_requested_at at time zone 'Asia/Bangkok')::integer + 543;
  yy := right(be_year::text, 2);
  mm := lpad(extract(month from safe_requested_at at time zone 'Asia/Bangkok')::integer::text, 2, '0');
  seq_key := 'XA' || yy || mm;

  insert into public.production_requisition_document_sequences (sequence_key, last_value, updated_at)
  values (seq_key, safe_requested_count, timezone('utc', now()))
  on conflict (sequence_key)
  do update
    set last_value = public.production_requisition_document_sequences.last_value + safe_requested_count,
        updated_at = timezone('utc', now())
  returning public.production_requisition_document_sequences.last_value into final_last_value;

  start_value := final_last_value - safe_requested_count + 1;

  return query
  select
    seq_key,
    generated.value,
    seq_key || '/' || lpad(generated.value::text, 4, '0')
  from generate_series(start_value, final_last_value) as generated(value);
end;
$$;


ALTER FUNCTION "public"."allocate_requisition_document_numbers"("requested_at" timestamp with time zone, "requested_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_orders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.orders
  SET status = 'cancelled',
      notes = COALESCE(notes || ' ', '') || '[Auto-cancelled: Stale order from previous day]',
      updated_at = TIMEZONE('utc', NOW())
  WHERE order_date < CURRENT_DATE
    AND (fulfillment_status IS NULL OR fulfillment_status <> 'complete')
    AND (status IS NULL OR (status <> 'cancelled' AND status <> 'delivered'))
    AND organization_id IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_stale_orders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_app_session"("p_user_id" "uuid", "p_ip_hash" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS TABLE("session_id" "uuid", "organization_id" "uuid", "role" "public"."app_role", "display_name" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user public.app_users%rowtype;
  v_session_id uuid;
  v_expires_at timestamptz;
begin
  select *
  into v_user
  from public.app_users
  where id = p_user_id and is_active = true;

  if not found then
    raise exception 'User is inactive or missing';
  end if;

  v_session_id := gen_random_uuid();
  v_expires_at := timezone('utc', now()) + interval '12 hours';

  insert into public.app_sessions (
    id,
    user_id,
    organization_id,
    role,
    expires_at,
    ip_hash,
    user_agent
  )
  values (
    v_session_id,
    v_user.id,
    v_user.organization_id,
    v_user.role,
    v_expires_at,
    p_ip_hash,
    p_user_agent
  );

  return query
  select
    v_session_id,
    v_user.organization_id,
    v_user.role,
    v_user.display_name,
    v_expires_at;
end;
$$;


ALTER FUNCTION "public"."create_app_session"("p_user_id" "uuid", "p_ip_hash" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_app_session_with_success_audit"("p_user_id" "uuid", "p_attempted_lookup" "text", "p_ip_hash" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS TABLE("session_id" "uuid", "organization_id" "uuid", "role" "public"."app_role", "display_name" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user public.app_users%rowtype;
  v_session_id uuid;
  v_expires_at timestamptz;
begin
  select *
  into v_user
  from public.app_users
  where id = p_user_id and is_active = true
  for update;

  if not found then
    raise exception 'User is inactive or missing';
  end if;

  update public.app_users
  set
    failed_pin_attempts = 0,
    locked_until = null,
    last_login_at = timezone('utc', now())
  where id = p_user_id;

  insert into public.auth_audit_logs (
    user_id,
    organization_id,
    attempted_lookup,
    event_type,
    ip_hash,
    user_agent
  )
  values (
    v_user.id,
    v_user.organization_id,
    p_attempted_lookup,
    'pin_login_succeeded',
    p_ip_hash,
    p_user_agent
  );

  v_session_id := gen_random_uuid();
  v_expires_at := timezone('utc', now()) + interval '12 hours';

  insert into public.app_sessions (
    id,
    user_id,
    organization_id,
    role,
    expires_at,
    ip_hash,
    user_agent
  )
  values (
    v_session_id,
    v_user.id,
    v_user.organization_id,
    v_user.role,
    v_expires_at,
    p_ip_hash,
    p_user_agent
  );

  return query
  select
    v_session_id,
    v_user.organization_id,
    v_user.role,
    v_user.display_name,
    v_expires_at;
end;
$$;


ALTER FUNCTION "public"."create_app_session_with_success_audit"("p_user_id" "uuid", "p_attempted_lookup" "text", "p_ip_hash" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_delivery_note"("p_organization_id" "uuid", "p_order_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_delivery_date" "date", "p_notes" "text", "p_created_by" "uuid", "p_items" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_dn_id               uuid;
  v_dn_number           text;
  v_item                jsonb;
  v_order_item_id       uuid;
  v_product_id          uuid;
  v_product_sale_unit_id uuid;
  v_sale_unit_label     text;
  v_sale_unit_ratio     numeric;
  v_qty_delivered       numeric;
  v_qty_base            numeric;
  v_unit_price          numeric;
  v_line_total          numeric;
  v_stock_before        numeric;
  v_reserved_before     numeric;
  v_stock_after         numeric;
  v_reserved_after      numeric;
  v_total_amount        numeric := 0;
  v_items_processed     integer := 0;
  v_all_delivered       boolean;
  v_any_delivered       boolean;
  v_new_fulfillment     text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ต้องมีสินค้าอย่างน้อย 1 รายการ';
  end if;

  -- Confirm the order if it is still in submitted state
  update public.orders
  set status = 'confirmed'
  where id = p_order_id
    and organization_id = p_organization_id
    and status = 'submitted';

  -- Atomic DN number
  v_dn_number := public.next_delivery_note_number(
    p_organization_id, coalesce(p_delivery_date, current_date)
  );

  -- Insert DN header
  insert into public.delivery_notes (
    organization_id, order_id, customer_id, vehicle_id,
    delivery_number, delivery_date, status, notes, created_by
  ) values (
    p_organization_id, p_order_id, p_customer_id, p_vehicle_id,
    v_dn_number, coalesce(p_delivery_date, current_date), 'confirmed',
    nullif(trim(p_notes), ''), p_created_by
  ) returning id into v_dn_id;

  -- Process each line item
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty_delivered := (v_item->>'quantityDelivered')::numeric;

    if v_qty_delivered is null or v_qty_delivered <= 0 then
      continue;
    end if;

    v_order_item_id         := (v_item->>'orderItemId')::uuid;
    v_product_id            := (v_item->>'productId')::uuid;
    v_product_sale_unit_id  := (v_item->>'productSaleUnitId')::uuid;
    v_sale_unit_label       := v_item->>'saleUnitLabel';
    v_sale_unit_ratio       := coalesce((v_item->>'saleUnitRatio')::numeric, 1);
    v_unit_price            := coalesce((v_item->>'unitPrice')::numeric, 0);

    v_qty_base   := v_qty_delivered * v_sale_unit_ratio;
    v_line_total := v_qty_delivered * v_unit_price;

    -- Lock product row for atomic update
    select stock_quantity, reserved_quantity
      into v_stock_before, v_reserved_before
    from public.products
    where id = v_product_id and organization_id = p_organization_id
    for update;

    if v_stock_before is null then
      raise exception 'ไม่พบสินค้า %', v_product_id;
    end if;

    -- Removed: Stock check exception
    -- if v_stock_before < v_qty_base then
    --   raise exception 'สต็อกไม่พอ: มีอยู่ % แต่ต้องการ %', v_stock_before, v_qty_base;
    -- end if;

    v_stock_after    := v_stock_before - v_qty_base;
    v_reserved_after := greatest(0, v_reserved_before - v_qty_base);

    update public.products
    set stock_quantity    = v_stock_after,
        reserved_quantity = v_reserved_after
    where id = v_product_id;

    -- Inventory movement: issue
    insert into public.inventory_movements (
      organization_id, product_id, movement_type,
      quantity_delta, stock_before, stock_after,
      reference_number, notes, created_by, metadata
    ) values (
      p_organization_id, v_product_id, 'issue',
      -v_qty_base, v_stock_before, v_stock_after,
      v_dn_number, nullif(trim(p_notes), ''), p_created_by,
      jsonb_build_object('delivery_note_id', v_dn_id, 'order_id', p_order_id)
    );

    -- DN line item
    insert into public.delivery_note_items (
      organization_id, delivery_note_id, order_item_id,
      product_id, product_sale_unit_id,
      sale_unit_label, sale_unit_ratio,
      quantity_delivered, quantity_in_base_unit,
      unit_price, line_total
    ) values (
      p_organization_id, v_dn_id, v_order_item_id,
      v_product_id, v_product_sale_unit_id,
      v_sale_unit_label, v_sale_unit_ratio,
      v_qty_delivered, v_qty_base,
      v_unit_price, v_line_total
    );

    v_total_amount    := v_total_amount + v_line_total;
    v_items_processed := v_items_processed + 1;
  end loop;

  if v_items_processed = 0 then
    raise exception 'ต้องใส่จำนวนส่งอย่างน้อย 1 รายการ';
  end if;

  -- Update DN total
  update public.delivery_notes
  set total_amount = v_total_amount
  where id = v_dn_id;

  -- Recompute order fulfillment_status
  select
    bool_and(coalesce(d.delivered_qty, 0) >= oi.quantity_in_base_unit),
    bool_or(coalesce(d.delivered_qty, 0) > 0)
  into v_all_delivered, v_any_delivered
  from public.order_items oi
  left join (
    select
      dni.order_item_id,
      sum(dni.quantity_in_base_unit) as delivered_qty
    from public.delivery_note_items dni
    join public.delivery_notes dn on dn.id = dni.delivery_note_id
    where dn.order_id = p_order_id and dn.status = 'confirmed'
    group by dni.order_item_id
  ) d on d.order_item_id = oi.id
  where oi.order_id = p_order_id;

  v_new_fulfillment := case
    when v_all_delivered  then 'complete'
    when v_any_delivered  then 'partial'
    else                       'pending'
  end;

  update public.orders
  set fulfillment_status = v_new_fulfillment
  where id = p_order_id;

  return v_dn_number;
end;
$$;


ALTER FUNCTION "public"."create_delivery_note"("p_organization_id" "uuid", "p_order_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_delivery_date" "date", "p_notes" "text", "p_created_by" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_receipt_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_unit text;
  v_unit_ratio numeric(12,3);
  v_unit_cost numeric(12,2);
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
  v_reference_number text;
  v_receipt_item_id uuid;
  v_base_increment numeric(12,3);
BEGIN
  v_reference_number := NULLIF(TRIM(p_receipt_number), '');

  INSERT INTO public.inventory_receipts (
    organization_id, receipt_number, supplier_name, received_at, notes, created_by
  ) VALUES (
    p_organization_id,
    COALESCE(v_reference_number, CONCAT('RCV-', TO_CHAR(COALESCE(p_received_at, TIMEZONE('utc', NOW())), 'YYYYMMDDHH24MISS'))),
    COALESCE(NULLIF(TRIM(p_supplier_name), ''), 'โรงงานหลัก'),
    COALESCE(p_received_at, TIMEZONE('utc', NOW())),
    NULLIF(TRIM(p_notes), ''),
    p_created_by
  ) RETURNING id INTO v_receipt_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantityReceived')::numeric;
    v_unit := NULLIF(TRIM(v_item ->> 'unit'), '');
    v_unit_ratio := COALESCE((v_item ->> 'unitRatio')::numeric, 1.0);
    v_unit_cost := (v_item ->> 'unitCost')::numeric;

    SELECT stock_quantity INTO v_stock_before FROM public.products 
    WHERE id = v_product_id AND organization_id = p_organization_id FOR UPDATE;

    v_base_increment := v_quantity * v_unit_ratio;
    v_stock_after := v_stock_before + v_base_increment;

    -- UPDATE PRODUCT: Increment stock and update cost price (normalized to base unit)
    -- WE DO NOT UPDATE THE 'unit' COLUMN HERE TO AVOID CONSTRAINT VIOLATION
    UPDATE public.products
    SET stock_quantity = v_stock_after,
        cost_price = CASE WHEN v_unit_ratio > 0 THEN v_unit_cost / v_unit_ratio ELSE v_unit_cost END,
        updated_at = TIMEZONE('utc', NOW())
    WHERE id = v_product_id;

    INSERT INTO public.inventory_receipt_items (
      organization_id, receipt_id, product_id, quantity_received, unit, unit_cost, stock_before, stock_after
    ) VALUES (p_organization_id, v_receipt_id, v_product_id, v_quantity, v_unit, v_unit_cost, v_stock_before, v_stock_after)
    RETURNING id INTO v_receipt_item_id;

    INSERT INTO public.inventory_movements (
      organization_id, product_id, receipt_id, receipt_item_id, movement_type, quantity_delta, stock_before, stock_after, created_by, metadata
    ) VALUES (
      p_organization_id, v_product_id, v_receipt_id, v_receipt_item_id, 'receipt', v_base_increment, v_stock_before, v_stock_after, p_created_by,
      JSONB_BUILD_OBJECT('source', 'inventory_receipt', 'unit_ratio', v_unit_ratio, 'received_unit', v_unit)
    );
  END LOOP;
  RETURN v_receipt_id;
END;
$$;


ALTER FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb", "p_receipt_url" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_receipt_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_unit text;
  v_unit_cost numeric(12,2);
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
  v_reference_number text;
  v_receipt_item_id uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Receipt must include at least one item';
  end if;

  v_reference_number := nullif(trim(p_receipt_number), '');

  insert into public.inventory_receipts (
    organization_id,
    receipt_number,
    supplier_name,
    received_at,
    notes,
    created_by,
    receipt_url
  ) values (
    p_organization_id,
    coalesce(v_reference_number, concat('RCV-', to_char(coalesce(p_received_at, timezone('utc', now())), 'YYYYMMDDHH24MISS'))),
    coalesce(nullif(trim(p_supplier_name), ''), 'โรงงานหลัก'),
    coalesce(p_received_at, timezone('utc', now())),
    nullif(trim(p_notes), ''),
    p_created_by,
    p_receipt_url
  ) returning id into v_receipt_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantityReceived')::numeric;
    v_unit := nullif(trim(v_item ->> 'unit'), '');
    v_unit_cost := (v_item ->> 'unitCost')::numeric;

    if v_product_id is null or v_quantity is null or v_unit is null or v_unit_cost is null then
      raise exception 'Each receipt item requires productId, quantityReceived, unit, and unitCost';
    end if;

    if v_quantity <= 0 then
      raise exception 'Receipt quantity must be greater than zero';
    end if;

    if v_unit_cost < 0 then
      raise exception 'Unit cost must be zero or greater';
    end if;

    select stock_quantity
      into v_stock_before
    from public.products
    where id = v_product_id
      and organization_id = p_organization_id
    for update;

    if v_stock_before is null then
      raise exception 'Product % was not found in this organization', v_product_id;
    end if;

    v_stock_after := v_stock_before + v_quantity;

    update public.products
    set stock_quantity = v_stock_after,
        cost_price = v_unit_cost,
        unit = v_unit
    where id = v_product_id;

    insert into public.inventory_receipt_items (
      organization_id,
      receipt_id,
      product_id,
      quantity_received,
      unit,
      unit_cost,
      stock_before,
      stock_after
    ) values (
      p_organization_id,
      v_receipt_id,
      v_product_id,
      v_quantity,
      v_unit,
      v_unit_cost,
      v_stock_before,
      v_stock_after
    ) returning id into v_receipt_item_id;

    insert into public.inventory_movements (
      organization_id,
      product_id,
      receipt_id,
      receipt_item_id,
      movement_type,
      quantity_delta,
      stock_before,
      stock_after,
      reference_number,
      notes,
      created_by,
      metadata
    ) values (
      p_organization_id,
      v_product_id,
      v_receipt_id,
      v_receipt_item_id,
      'receipt',
      v_quantity,
      v_stock_before,
      v_stock_after,
      v_reference_number,
      nullif(trim(p_notes), ''),
      p_created_by,
      jsonb_build_object('source', 'inventory_receipt')
    );
  end loop;

  return v_receipt_id;
end;
$$;


ALTER FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb", "p_receipt_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb", "p_receipt_url" "text" DEFAULT NULL::"text", "p_supplier_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_receipt_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_unit text;
  v_unit_cost numeric(12,2);
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
  v_reference_number text;
  v_receipt_item_id uuid;
  v_actual_received_at timestamptz;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Receipt must include at least one item';
  end if;

  v_actual_received_at := coalesce(p_received_at, timezone('utc', now()));

  -- Generate standardized RCVYYMMDDXX if not provided
  v_reference_number := nullif(trim(p_receipt_number), '');
  if v_reference_number is null then
    v_reference_number := public.generate_receipt_number(p_organization_id, (v_actual_received_at at time zone 'Asia/Bangkok')::date);
  end if;

  insert into public.inventory_receipts (
    organization_id,
    receipt_number,
    supplier_name,
    supplier_id,
    received_at,
    notes,
    created_by,
    receipt_url
  ) values (
    p_organization_id,
    v_reference_number,
    coalesce(nullif(trim(p_supplier_name), ''), 'ผู้ขาย'),
    p_supplier_id,
    v_actual_received_at,
    nullif(trim(p_notes), ''),
    p_created_by,
    p_receipt_url
  ) returning id into v_receipt_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantityReceived')::numeric;
    v_unit := nullif(trim(v_item ->> 'unit'), '');
    v_unit_cost := (v_item ->> 'unitCost')::numeric;

    if v_product_id is null or v_quantity is null or v_unit is null or v_unit_cost is null then
      raise exception 'Each receipt item requires productId, quantityReceived, unit, and unitCost';
    end if;

    select stock_quantity into v_stock_before
    from public.products
    where id = v_product_id and organization_id = p_organization_id
    for update;

    v_stock_after := coalesce(v_stock_before, 0) + v_quantity;

    update public.products
    set stock_quantity = v_stock_after,
        cost_price = v_unit_cost,
        unit = v_unit
    where id = v_product_id;

    insert into public.inventory_receipt_items (
      organization_id, receipt_id, product_id, quantity_received, unit, unit_cost, stock_before, stock_after
    ) values (
      p_organization_id, v_receipt_id, v_product_id, v_quantity, v_unit, v_unit_cost, v_stock_before, v_stock_after
    ) returning id into v_receipt_item_id;

    insert into public.inventory_movements (
      organization_id, product_id, receipt_id, receipt_item_id, movement_type, quantity_delta, stock_before, stock_after, reference_number, notes, created_by, metadata
    ) values (
      p_organization_id, v_product_id, v_receipt_id, v_receipt_item_id, 'receipt', v_quantity, v_stock_before, v_stock_after, v_reference_number, nullif(trim(p_notes), ''), p_created_by, jsonb_build_object('source', 'inventory_receipt')
    );
  end loop;

  return v_receipt_id;
end;
$$;


ALTER FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb", "p_receipt_url" "text", "p_supplier_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_store_delivery_note"("p_organization_id" "uuid", "p_order_ids" "uuid"[], "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_delivery_date" "date", "p_notes" "text", "p_created_by" "uuid", "p_items" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_target_date          date := coalesce(p_delivery_date, current_date);
  v_primary_order_id     uuid;
  v_dn_id                uuid;
  v_dn_number            text;
  v_item                 jsonb;
  v_order_item_id        uuid;
  v_product_id           uuid;
  v_product_sale_unit_id uuid;
  v_sale_unit_label      text;
  v_sale_unit_ratio      numeric;
  v_qty_delivered        numeric;
  v_qty_base             numeric;
  v_unit_price           numeric;
  v_line_total           numeric;
  v_stock_before         numeric;
  v_reserved_before      numeric;
  v_stock_after          numeric;
  v_reserved_after       numeric;
  v_total_amount         numeric := 0;
  v_items_processed      integer := 0;
  v_order_id             uuid;
  v_all_delivered        boolean;
  v_any_delivered        boolean;
  v_new_fulfillment      text;
  v_clean_notes          text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ต้องมีสินค้าอย่างน้อย 1 รายการ';
  end if;

  if p_order_ids is null or array_length(p_order_ids, 1) = 0 then
    raise exception 'ต้องระบุออเดอร์อย่างน้อย 1 รายการ';
  end if;

  v_clean_notes := nullif(trim(p_notes), '');
  v_primary_order_id := p_order_ids[1];

  -- Lock by org/customer/date to prevent duplicate DNs in concurrent requests.
  perform pg_advisory_xact_lock(
    hashtext(p_organization_id::text || ':' || p_customer_id::text || ':' || v_target_date::text)
  );

  -- Confirm all submitted orders in the batch.
  update public.orders
  set status = 'confirmed'
  where id = any(p_order_ids)
    and organization_id = p_organization_id
    and status = 'submitted';

  -- Reuse existing confirmed DN for this store/day if present.
  select dn.id, dn.delivery_number
    into v_dn_id, v_dn_number
  from public.delivery_notes dn
  where dn.organization_id = p_organization_id
    and dn.customer_id = p_customer_id
    and dn.delivery_date = v_target_date
    and dn.status = 'confirmed'
  order by dn.created_at asc
  limit 1
  for update;

  if v_dn_id is null then
    v_dn_number := public.next_delivery_note_number(p_organization_id, v_target_date);

    insert into public.delivery_notes (
      organization_id, order_id, customer_id, vehicle_id,
      delivery_number, delivery_date, status, notes, created_by
    ) values (
      p_organization_id, v_primary_order_id, p_customer_id, p_vehicle_id,
      v_dn_number, v_target_date, 'confirmed', v_clean_notes, p_created_by
    ) returning id into v_dn_id;
  else
    update public.delivery_notes
    set
      vehicle_id = coalesce(public.delivery_notes.vehicle_id, p_vehicle_id),
      notes = case
        when v_clean_notes is null then public.delivery_notes.notes
        when public.delivery_notes.notes is null or trim(public.delivery_notes.notes) = '' then v_clean_notes
        else public.delivery_notes.notes || ' / ' || v_clean_notes
      end
    where id = v_dn_id;
  end if;

  -- Process each delivered line item.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty_delivered := (v_item->>'quantityDelivered')::numeric;

    if v_qty_delivered is null or v_qty_delivered <= 0 then
      continue;
    end if;

    v_order_item_id        := (v_item->>'orderItemId')::uuid;
    v_product_id           := (v_item->>'productId')::uuid;
    v_product_sale_unit_id := (v_item->>'productSaleUnitId')::uuid;
    v_sale_unit_label      := v_item->>'saleUnitLabel';
    v_sale_unit_ratio      := coalesce((v_item->>'saleUnitRatio')::numeric, 1);
    v_unit_price           := coalesce((v_item->>'unitPrice')::numeric, 0);

    v_qty_base   := v_qty_delivered * v_sale_unit_ratio;
    v_line_total := v_qty_delivered * v_unit_price;

    select stock_quantity, reserved_quantity
      into v_stock_before, v_reserved_before
    from public.products
    where id = v_product_id and organization_id = p_organization_id
    for update;

    if v_stock_before is null then
      raise exception 'ไม่พบสินค้า %', v_product_id;
    end if;

    -- Removed: Stock check exception
    -- if v_stock_before < v_qty_base then
    --   raise exception 'สต็อกไม่พอ: มีอยู่ % แต่ต้องการ %', v_stock_before, v_qty_base;
    -- end if;

    v_stock_after    := v_stock_before - v_qty_base;
    v_reserved_after := greatest(0, v_reserved_before - v_qty_base);

    update public.products
    set stock_quantity    = v_stock_after,
        reserved_quantity = v_reserved_after
    where id = v_product_id;

    insert into public.inventory_movements (
      organization_id, product_id, movement_type,
      quantity_delta, stock_before, stock_after,
      reference_number, notes, created_by, metadata
    ) values (
      p_organization_id, v_product_id, 'issue',
      -v_qty_base, v_stock_before, v_stock_after,
      v_dn_number, v_clean_notes, p_created_by,
      jsonb_build_object('delivery_note_id', v_dn_id, 'order_id', v_primary_order_id)
    );

    insert into public.delivery_note_items (
      organization_id, delivery_note_id, order_item_id,
      product_id, product_sale_unit_id,
      sale_unit_label, sale_unit_ratio,
      quantity_delivered, quantity_in_base_unit,
      unit_price, line_total
    ) values (
      p_organization_id, v_dn_id, v_order_item_id,
      v_product_id, v_product_sale_unit_id,
      v_sale_unit_label, v_sale_unit_ratio,
      v_qty_delivered, v_qty_base,
      v_unit_price, v_line_total
    );

    v_total_amount    := v_total_amount + v_line_total;
    v_items_processed := v_items_processed + 1;
  end loop;

  if v_items_processed = 0 then
    raise exception 'ต้องใส่จำนวนส่งอย่างน้อย 1 รายการ';
  end if;

  update public.delivery_notes
  set total_amount = coalesce(total_amount, 0) + v_total_amount
  where id = v_dn_id;

  -- Recompute fulfillment_status for each submitted order id.
  foreach v_order_id in array p_order_ids loop
    select
      bool_and(coalesce(d.delivered_qty, 0) >= oi.quantity_in_base_unit),
      bool_or(coalesce(d.delivered_qty, 0) > 0)
    into v_all_delivered, v_any_delivered
    from public.order_items oi
    left join (
      select
        dni.order_item_id,
        sum(dni.quantity_in_base_unit) as delivered_qty
      from public.delivery_note_items dni
      join public.delivery_notes dn on dn.id = dni.delivery_note_id
      where dn.status = 'confirmed'
        and dni.order_item_id in (
          select id from public.order_items where order_id = v_order_id
        )
      group by dni.order_item_id
    ) d on d.order_item_id = oi.id
    where oi.order_id = v_order_id;

    v_new_fulfillment := case
      when v_all_delivered then 'complete'
      when v_any_delivered then 'partial'
      else                      'pending'
    end;

    update public.orders
    set fulfillment_status = v_new_fulfillment
    where id = v_order_id;
  end loop;

  return v_dn_number;
end;
$$;


ALTER FUNCTION "public"."create_store_delivery_note"("p_organization_id" "uuid", "p_order_ids" "uuid"[], "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_delivery_date" "date", "p_notes" "text", "p_created_by" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_receipt_number"("p_organization_id" "uuid", "p_date" "date" DEFAULT CURRENT_DATE) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_prefix text;
  v_count int;
  v_new_number text;
begin
  -- Format: RCV + YYMMDD
  v_prefix := 'RCV' || to_char(p_date, 'YYMMDD');
  
  -- Count existing receipts for this org and date
  select count(*) into v_count
  from public.inventory_receipts
  where organization_id = p_organization_id
    and date(received_at at time zone 'Asia/Bangkok') = p_date;
    
  -- Result: RCVYYMMDD + XX (2 digits running)
  v_new_number := v_prefix || lpad((v_count + 1)::text, 2, '0');
  
  return v_new_number;
end;
$$;


ALTER FUNCTION "public"."generate_receipt_number"("p_organization_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_delivery_review_data"("p_organization_id" "uuid", "p_stores" "jsonb", "p_order_date" "date", "p_include_order_items" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
with store_input as (
  select
    row_number() over () as sort_order,
    (value->>'customerId')::uuid as customer_id,
    coalesce(value->>'customerName', '') as customer_name,
    coalesce(value->>'customerCode', '') as customer_code,
    coalesce(value->'orderIds', '[]'::jsonb) as order_ids,
    coalesce((value->>'orderRounds')::integer, 0) as order_rounds,
    coalesce((value->>'totalAmount')::numeric, 0) as total_amount
  from jsonb_array_elements(coalesce(p_stores, '[]'::jsonb)) as input(value)
  where nullif(value->>'customerId', '') is not null
),
requested_order_ids as (
  select distinct (jsonb_array_elements_text(order_ids))::uuid as order_id
  from store_input
  where jsonb_array_length(order_ids) > 0
),
review_orders as (
  select
    o.id,
    o.customer_id,
    o.order_date
  from public.orders o
  where o.organization_id = p_organization_id
    and o.status in ('submitted', 'confirmed')
    and (
      (
        exists (select 1 from requested_order_ids)
        and o.id in (select order_id from requested_order_ids)
      )
      or (
        not exists (select 1 from requested_order_ids)
        and o.customer_id in (select customer_id from store_input)
        and o.order_date = p_order_date
      )
    )
),
review_items as (
  select
    oi.id as order_item_id,
    oi.order_id,
    ro.customer_id,
    oi.product_id,
    oi.product_sale_unit_id,
    coalesce(oi.quantity, 0)::numeric as quantity,
    coalesce(oi.quantity_in_base_unit, 0)::numeric as quantity_in_base_unit,
    coalesce(oi.sale_unit_label, p.unit) as sale_unit_label,
    coalesce(nullif(oi.sale_unit_ratio, 0), 1)::numeric as sale_unit_ratio,
    coalesce(oi.unit_price, 0)::numeric as unit_price,
    p.name as product_name,
    p.sku as product_sku,
    p.unit as product_unit
  from public.order_items oi
  join review_orders ro on ro.id = oi.order_id
  join public.products p on p.id = oi.product_id
  where oi.organization_id = p_organization_id
),
delivered as (
  select
    dni.order_item_id,
    sum(coalesce(dni.quantity_in_base_unit, 0)::numeric) as delivered_base_qty
  from public.delivery_note_items dni
  where dni.organization_id = p_organization_id
    and dni.order_item_id in (select order_item_id from review_items)
  group by dni.order_item_id
),
item_calc as (
  select
    ri.*,
    coalesce(d.delivered_base_qty, 0) as delivered_base_qty,
    case
      when ri.quantity > 0 then ri.quantity
      when ri.sale_unit_ratio > 0 then ri.quantity_in_base_unit / ri.sale_unit_ratio
      else ri.quantity_in_base_unit
    end as ordered_qty,
    greatest(0, ri.quantity_in_base_unit - coalesce(d.delivered_base_qty, 0)) as remaining_base_qty
  from review_items ri
  left join delivered d on d.order_item_id = ri.order_item_id
),
grouped_items as (
  select
    customer_id,
    product_id,
    sale_unit_label,
    min(product_sale_unit_id::text)::uuid as product_sale_unit_id,
    max(product_name) as product_name,
    max(product_sku) as product_sku,
    max(product_unit) as product_unit,
    max(sale_unit_ratio) as sale_unit_ratio,
    max(unit_price) as unit_price,
    sum(ordered_qty) as total_ordered,
    sum(case when sale_unit_ratio > 0 then remaining_base_qty / sale_unit_ratio else remaining_base_qty end) as total_remaining,
    case
      when p_include_order_items then
        jsonb_agg(
          jsonb_build_object(
            'orderId', order_id,
            'orderItemId', order_item_id,
            'productId', product_id,
            'productSaleUnitId', product_sale_unit_id,
            'quantityDelivered', ordered_qty,
            'saleUnitLabel', sale_unit_label,
            'saleUnitRatio', sale_unit_ratio,
            'unitPrice', unit_price
          )
          order by order_id, order_item_id
        )
      else '[]'::jsonb
    end as order_items
  from item_calc
  where ordered_qty > 0
  group by customer_id, product_id, sale_unit_label
),
orders_by_store as (
  select
    customer_id,
    jsonb_agg(distinct id) as order_ids
  from review_orders
  group by customer_id
),
items_by_store as (
  select
    customer_id,
    jsonb_agg(
      jsonb_build_object(
        'groupKey', product_id::text || '::' || sale_unit_label,
        'productId', product_id,
        'productName', product_name,
        'productSku', product_sku,
        'productUnit', product_unit,
        'productSaleUnitId', product_sale_unit_id,
        'saleUnitLabel', sale_unit_label,
        'saleUnitRatio', sale_unit_ratio,
        'unitPrice', unit_price,
        'totalOrdered', total_ordered,
        'totalRemaining', total_remaining,
        'orderItems', order_items
      )
      order by product_name
    ) as grouped_items
  from grouped_items
  group by customer_id
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'customerId', si.customer_id,
      'customerName', si.customer_name,
      'customerCode', si.customer_code,
      'orderIds', coalesce(obs.order_ids, '[]'::jsonb),
      'orderRounds', si.order_rounds,
      'totalAmount', si.total_amount,
      'groupedItems', coalesce(ibs.grouped_items, '[]'::jsonb)
    )
    order by si.sort_order
  ) filter (where ibs.grouped_items is not null),
  '[]'::jsonb
)
from store_input si
left join orders_by_store obs on obs.customer_id = si.customer_id
left join items_by_store ibs on ibs.customer_id = si.customer_id;
$$;


ALTER FUNCTION "public"."get_delivery_review_data"("p_organization_id" "uuid", "p_stores" "jsonb", "p_order_date" "date", "p_include_order_items" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_order_daily_store_items"("p_organization_id" "uuid", "p_order_date" "date", "p_customer_id" "uuid") RETURNS TABLE("product_id" "uuid", "product_sku" "text", "product_name" "text", "product_unit" "text", "product_unit_ratio" numeric, "product_sale_unit_id" "uuid", "ordered_quantity" numeric, "current_stock_quantity" numeric, "deliverable_quantity" numeric, "short_quantity" numeric, "unit_price" numeric, "line_total" numeric, "order_rounds" integer, "image_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH daily_total_demand AS (
    -- Calculate total demand for EACH product on THIS date ONLY
    SELECT 
      oi.product_id,
      SUM(COALESCE(oi.quantity_in_base_unit, oi.quantity)) as total_daily_base_qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.organization_id = p_organization_id
      AND o.order_date = p_order_date
      AND (o.fulfillment_status IS NULL OR o.fulfillment_status <> 'complete')
      AND (o.status IS NULL OR o.status <> 'cancelled')
    GROUP BY oi.product_id
  ),
  scoped_orders AS (
    SELECT o.id
    FROM public.orders o
    WHERE o.organization_id = p_organization_id
      AND o.order_date = p_order_date
      AND o.customer_id = p_customer_id
      AND (o.status IS NULL OR o.status <> 'cancelled')
  ),
  item_rollup AS (
    SELECT
      oi.product_id,
      COALESCE(oi.product_sale_unit_id, '00000000-0000-0000-0000-000000000000'::uuid) as product_sale_unit_id,
      COALESCE(oi.sale_unit_label, p.unit) as sale_unit_label,
      MAX(COALESCE(NULLIF(oi.sale_unit_ratio, 0), 1)) as sale_unit_ratio,
      SUM(oi.quantity) as ordered_quantity,
      SUM(COALESCE(oi.quantity_in_base_unit, oi.quantity)) as ordered_quantity_in_base_unit,
      MAX(oi.unit_price) as unit_price,
      SUM(oi.line_total) as line_total,
      COUNT(DISTINCT oi.order_id)::integer as order_rounds
    FROM public.order_items oi
    JOIN scoped_orders so ON so.id = oi.order_id
    JOIN public.products p ON p.id = oi.product_id
    GROUP BY
      oi.product_id,
      COALESCE(oi.product_sale_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(oi.sale_unit_label, p.unit)
  )
  SELECT
    p.id, p.sku, p.name, ir.sale_unit_label, ir.sale_unit_ratio,
    CASE WHEN ir.product_sale_unit_id = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL ELSE ir.product_sale_unit_id END,
    ir.ordered_quantity, COALESCE(p.stock_quantity, 0),
    -- Logic: If total daily demand fits in stock, everyone is deliverable.
    CASE 
      WHEN dtd.total_daily_base_qty <= COALESCE(p.stock_quantity, 0) THEN ir.ordered_quantity
      ELSE LEAST(ir.ordered_quantity, FLOOR(COALESCE(p.stock_quantity, 0) / NULLIF(ir.sale_unit_ratio, 0)))
    END as deliverable_quantity,
    CASE 
      WHEN dtd.total_daily_base_qty <= COALESCE(p.stock_quantity, 0) THEN 0
      ELSE GREATEST(0, ir.ordered_quantity - FLOOR(COALESCE(p.stock_quantity, 0) / NULLIF(ir.sale_unit_ratio, 0)))
    END as short_quantity,
    ir.unit_price, ir.line_total, ir.order_rounds,
    (SELECT pi.public_url FROM public.product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1)
  FROM item_rollup ir
  JOIN public.products p ON p.id = ir.product_id
  LEFT JOIN daily_total_demand dtd ON dtd.product_id = ir.product_id
  ORDER BY p.name ASC, ir.sale_unit_label ASC;
$$;


ALTER FUNCTION "public"."get_order_daily_store_items"("p_organization_id" "uuid", "p_order_date" "date", "p_customer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_order_daily_store_summaries"("p_organization_id" "uuid", "p_order_date" "date", "p_search" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 80, "p_offset" integer DEFAULT 0) RETURNS TABLE("customer_id" "uuid", "customer_code" "text", "customer_name" "text", "order_rounds" integer, "product_count" integer, "total_quantity" numeric, "total_amount" numeric, "latest_order_at" timestamp with time zone, "shortage_product_count" integer, "is_complete" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH daily_total_demand AS (
    -- Demand for THIS DATE only
    SELECT 
      oi.product_id,
      SUM(COALESCE(oi.quantity_in_base_unit, oi.quantity)) as total_daily_base_qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.organization_id = p_organization_id
      AND o.order_date = p_order_date
      AND (o.fulfillment_status IS NULL OR o.fulfillment_status <> 'complete')
      AND (o.status IS NULL OR o.status <> 'cancelled')
    GROUP BY oi.product_id
  ),
  scoped_orders AS (
    SELECT o.id, o.customer_id, o.created_at, o.total_amount, o.fulfillment_status
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE o.organization_id = p_organization_id
      AND o.order_date = p_order_date
      AND c.organization_id = p_organization_id
      AND (o.status IS NULL OR o.status <> 'cancelled')
      AND (
        NULLIF(BTRIM(COALESCE(p_search, '')), '') IS NULL
        OR c.name ILIKE '%' || BTRIM(p_search) || '%'
        OR c.customer_code ILIKE '%' || BTRIM(p_search) || '%'
      )
  ),
  item_rollup AS (
    SELECT so.customer_id, oi.product_id, SUM(COALESCE(oi.quantity_in_base_unit, oi.quantity)) as ordered_quantity_in_base_unit
    FROM scoped_orders so
    JOIN public.order_items oi ON oi.order_id = so.id
    GROUP BY so.customer_id, oi.product_id
  ),
  customer_rollup AS (
    SELECT
      so.customer_id,
      COUNT(*)::integer as order_rounds,
      COALESCE(SUM(so.total_amount), 0) as total_amount,
      MAX(so.created_at) as latest_order_at,
      EVERY(so.fulfillment_status = 'complete') as is_complete
    FROM scoped_orders so
    GROUP BY so.customer_id
  )
  SELECT
    c.id, c.customer_code, c.name, cr.order_rounds,
    COUNT(DISTINCT ir.product_id)::integer as product_count,
    COALESCE(SUM(ir.ordered_quantity_in_base_unit), 0) as total_quantity,
    cr.total_amount, cr.latest_order_at,
    COALESCE(
      COUNT(DISTINCT ir.product_id) FILTER (WHERE dtd.total_daily_base_qty > COALESCE(p.stock_quantity, 0)),
      0
    )::integer as shortage_product_count,
    COALESCE(cr.is_complete, false) as is_complete
  FROM customer_rollup cr
  JOIN public.customers c ON c.id = cr.customer_id
  LEFT JOIN item_rollup ir ON ir.customer_id = cr.customer_id
  LEFT JOIN public.products p ON p.id = ir.product_id
  LEFT JOIN daily_total_demand dtd ON dtd.product_id = ir.product_id
  WHERE COALESCE(cr.is_complete, false) = false -- HIDE COMPLETED STORES
  GROUP BY c.id, c.customer_code, c.name, cr.order_rounds, cr.total_amount, cr.latest_order_at, cr.is_complete
  ORDER BY cr.latest_order_at DESC, c.name ASC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$$;


ALTER FUNCTION "public"."get_order_daily_store_summaries"("p_organization_id" "uuid", "p_order_date" "date", "p_search" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profit_sales_report"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date", "p_customer_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS TABLE("iso_date" "date", "order_count" bigint, "sales" numeric, "cost" numeric, "net_profit" numeric, "margin_percent" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with filtered_notes as (
    select
      dn.id,
      dn.delivery_date,
      coalesce(dn.total_amount, 0)::numeric as total_amount
    from public.delivery_notes dn
    where dn.organization_id = p_organization_id
      and dn.status = 'confirmed'
      and dn.delivery_date >= p_from_date
      and dn.delivery_date <= p_to_date
      and (
        p_customer_ids is null
        or cardinality(p_customer_ids) = 0
        or dn.customer_id = any(p_customer_ids)
      )
  ),
  note_costs as (
    select
      dni.delivery_note_id,
      sum(
        coalesce(dni.quantity_delivered, 0)::numeric *
        case
          when psu.cost_mode = 'fixed' and psu.fixed_cost_price is not null
            then psu.fixed_cost_price
          else coalesce(p.cost_price, 0)::numeric * coalesce(psu.base_unit_quantity, 0)::numeric
        end
      ) as cost
    from public.delivery_note_items dni
    join filtered_notes fn on fn.id = dni.delivery_note_id
    left join public.product_sale_units psu on psu.id = dni.product_sale_unit_id
    left join public.products p on p.id = psu.product_id
    group by dni.delivery_note_id
  ),
  daily as (
    select
      fn.delivery_date,
      count(*)::bigint as order_count,
      sum(fn.total_amount)::numeric as sales,
      coalesce(sum(nc.cost), 0)::numeric as cost
    from filtered_notes fn
    left join note_costs nc on nc.delivery_note_id = fn.id
    group by fn.delivery_date
  )
  select
    d.delivery_date as iso_date,
    d.order_count,
    round(d.sales, 2) as sales,
    round(d.cost, 2) as cost,
    round(d.sales - d.cost, 2) as net_profit,
    case
      when d.sales > 0 then round(((d.sales - d.cost) / d.sales) * 100, 4)
      else 0
    end as margin_percent
  from daily d
  order by d.delivery_date;
$$;


ALTER FUNCTION "public"."get_profit_sales_report"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date", "p_customer_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_billing_number"("p_organization_id" "uuid", "p_billing_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year int := extract(year from p_billing_date)::int;
  v_next bigint;
begin
  insert into public.billing_number_counters_yearly (organization_id, billing_year, last_number)
  values (p_organization_id, v_year, 1)
  on conflict (organization_id, billing_year) do update
    set last_number = public.billing_number_counters_yearly.last_number + 1
  returning last_number into v_next;

  return 'VB' || to_char(p_billing_date, 'YYYYMMDD') || lpad(v_next::text, 3, '0');
end;
$$;


ALTER FUNCTION "public"."next_billing_number"("p_organization_id" "uuid", "p_billing_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_customer_code"("p_organization_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_next bigint;
begin
  insert into public.customer_code_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = public.customer_code_counters.last_number + 1
  returning last_number into v_next;

  return 'TYS' || lpad(v_next::text, 3, '0');
end;
$$;


ALTER FUNCTION "public"."next_customer_code"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_delivery_note_number"("p_organization_id" "uuid", "p_delivery_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year int := extract(year from p_delivery_date)::int;
  v_month int := extract(month from p_delivery_date)::int;
  v_next bigint;
begin
  insert into public.delivery_note_counters_monthly (
    organization_id,
    delivery_year,
    delivery_month,
    last_number
  )
  values (p_organization_id, v_year, v_month, 1)
  on conflict (organization_id, delivery_year, delivery_month) do update
    set last_number = public.delivery_note_counters_monthly.last_number + 1
  returning last_number into v_next;

  return 'DN' || to_char(p_delivery_date, 'YYYYMM') || lpad(v_next::text, 4, '0');
end;
$$;


ALTER FUNCTION "public"."next_delivery_note_number"("p_organization_id" "uuid", "p_delivery_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_order_number"("p_organization_id" "uuid", "p_order_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_next bigint;
begin
  insert into public.order_number_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = order_number_counters.last_number + 1
  returning last_number into v_next;

  return 'ORD' || to_char(p_order_date, 'YYYYMMDD') || lpad(v_next::text, 5, '0');
end;
$$;


ALTER FUNCTION "public"."next_order_number"("p_organization_id" "uuid", "p_order_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_supplier_code"("p_organization_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_next bigint;
BEGIN
  INSERT INTO public.supplier_code_counters (organization_id, last_number)
  VALUES (p_organization_id, 1)
  ON CONFLICT (organization_id) DO UPDATE
    SET last_number = public.supplier_code_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'TYV' || lpad(v_next::text, 3, '0');
END;
$$;


ALTER FUNCTION "public"."next_supplier_code"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_pin_auth_result"("p_user_id" "uuid", "p_attempted_lookup" "text", "p_success" boolean, "p_ip_hash" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS TABLE("failed_pin_attempts" integer, "locked_until" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user public.app_users%rowtype;
  v_attempts integer;
  v_locked_until timestamptz;
begin
  if p_user_id is null then
    insert into public.auth_audit_logs (
      attempted_lookup,
      event_type,
      ip_hash,
      user_agent
    )
    values (
      p_attempted_lookup,
      'pin_login_failed_unknown_user',
      p_ip_hash,
      p_user_agent
    );

    return query
    select 0::integer, null::timestamptz;
    return;
  end if;

  select *
  into v_user
  from public.app_users
  where id = p_user_id
  for update;

  if p_success then
    update public.app_users
    set
      failed_pin_attempts = 0,
      locked_until = null,
      last_login_at = timezone('utc', now())
    where id = p_user_id;

    insert into public.auth_audit_logs (
      user_id,
      organization_id,
      attempted_lookup,
      event_type,
      ip_hash,
      user_agent
    )
    values (
      v_user.id,
      v_user.organization_id,
      p_attempted_lookup,
      'pin_login_succeeded',
      p_ip_hash,
      p_user_agent
    );

    return query
    select 0::integer, null::timestamptz;
    return;
  end if;

  v_attempts := coalesce(v_user.failed_pin_attempts, 0) + 1;
  v_locked_until := null;

  if v_attempts >= 5 then
    v_locked_until := timezone('utc', now()) + interval '15 minutes';
    v_attempts := 0;
  end if;

  update public.app_users
  set
    failed_pin_attempts = v_attempts,
    locked_until = v_locked_until,
    last_failed_at = timezone('utc', now())
  where id = p_user_id;

  insert into public.auth_audit_logs (
    user_id,
    organization_id,
    attempted_lookup,
    event_type,
    ip_hash,
    user_agent,
    metadata
  )
  values (
    v_user.id,
    v_user.organization_id,
    p_attempted_lookup,
    case
      when v_locked_until is not null then 'pin_login_locked'
      else 'pin_login_failed'
    end,
    p_ip_hash,
    p_user_agent,
    jsonb_build_object('failed_pin_attempts', v_attempts)
  );

  return query
  select v_attempts, v_locked_until;
end;
$$;


ALTER FUNCTION "public"."record_pin_auth_result"("p_user_id" "uuid", "p_attempted_lookup" "text", "p_success" boolean, "p_ip_hash" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_app_session"("p_session_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.app_sessions
  set revoked_at = timezone('utc', now())
  where id = p_session_id and revoked_at is null;
end;
$$;


ALTER FUNCTION "public"."revoke_app_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_inventory_receipt"("p_organization_id" "uuid", "p_receipt_id" "uuid", "p_received_at" timestamp with time zone, "p_supplier_id" "uuid", "p_supplier_name" "text", "p_notes" "text", "p_items" "jsonb", "p_updated_by" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_reference_number text;
  v_item jsonb;
  v_old_item record;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_unit text;
  v_unit_cost numeric(12,2);
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
  v_receipt_item_id uuid;
begin
  if p_receipt_id is null then
    raise exception 'Receipt id is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Receipt must include at least one item';
  end if;

  select receipt_number
    into v_reference_number
  from public.inventory_receipts
  where id = p_receipt_id
    and organization_id = p_organization_id
  for update;

  if v_reference_number is null then
    raise exception 'Receipt not found';
  end if;

  -- Reverse previous stock impact from this receipt before writing the new item set.
  for v_old_item in
    select product_id, quantity_received
    from public.inventory_receipt_items
    where receipt_id = p_receipt_id
      and organization_id = p_organization_id
    order by created_at, id
  loop
    select stock_quantity
      into v_stock_before
    from public.products
    where id = v_old_item.product_id
      and organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Product % not found while reverting receipt', v_old_item.product_id;
    end if;

    v_stock_after := coalesce(v_stock_before, 0) - coalesce(v_old_item.quantity_received, 0);

    update public.products
    set stock_quantity = v_stock_after,
        updated_at = now()
    where id = v_old_item.product_id
      and organization_id = p_organization_id;
  end loop;

  delete from public.inventory_movements
  where organization_id = p_organization_id
    and receipt_id = p_receipt_id
    and movement_type = 'receipt';

  delete from public.inventory_receipt_items
  where organization_id = p_organization_id
    and receipt_id = p_receipt_id;

  update public.inventory_receipts
  set received_at = coalesce(p_received_at, received_at),
      supplier_id = p_supplier_id,
      supplier_name = coalesce(nullif(trim(p_supplier_name), ''), 'ผู้ขาย'),
      notes = nullif(trim(p_notes), '')
  where id = p_receipt_id
    and organization_id = p_organization_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantityReceived')::numeric;
    v_unit := nullif(trim(v_item ->> 'unit'), '');
    v_unit_cost := (v_item ->> 'unitCost')::numeric;

    if v_product_id is null or v_quantity is null or v_unit is null or v_unit_cost is null then
      raise exception 'Each receipt item requires productId, quantityReceived, unit, and unitCost';
    end if;

    select stock_quantity
      into v_stock_before
    from public.products
    where id = v_product_id
      and organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Product % not found', v_product_id;
    end if;

    v_stock_after := coalesce(v_stock_before, 0) + v_quantity;

    update public.products
    set stock_quantity = v_stock_after,
        cost_price = v_unit_cost,
        unit = v_unit,
        updated_at = now()
    where id = v_product_id
      and organization_id = p_organization_id;

    insert into public.inventory_receipt_items (
      organization_id,
      receipt_id,
      product_id,
      quantity_received,
      unit,
      unit_cost,
      stock_before,
      stock_after
    ) values (
      p_organization_id,
      p_receipt_id,
      v_product_id,
      v_quantity,
      v_unit,
      v_unit_cost,
      v_stock_before,
      v_stock_after
    )
    returning id into v_receipt_item_id;

    insert into public.inventory_movements (
      organization_id,
      product_id,
      receipt_id,
      receipt_item_id,
      movement_type,
      quantity_delta,
      stock_before,
      stock_after,
      reference_number,
      notes,
      created_by,
      metadata
    ) values (
      p_organization_id,
      v_product_id,
      p_receipt_id,
      v_receipt_item_id,
      'receipt',
      v_quantity,
      v_stock_before,
      v_stock_after,
      v_reference_number,
      nullif(trim(p_notes), ''),
      p_updated_by,
      jsonb_build_object('source', 'inventory_receipt', 'updated', true)
    );
  end loop;
end;
$$;


ALTER FUNCTION "public"."update_inventory_receipt"("p_organization_id" "uuid", "p_receipt_id" "uuid", "p_received_at" timestamp with time zone, "p_supplier_id" "uuid", "p_supplier_name" "text", "p_notes" "text", "p_items" "jsonb", "p_updated_by" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "revoked_at" timestamp with time zone,
    "ip_hash" "text",
    "user_agent" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);

ALTER TABLE ONLY "public"."app_sessions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "email" "text",
    "role" "public"."app_role" DEFAULT 'member'::"public"."app_role" NOT NULL,
    "pin_lookup" "text" NOT NULL,
    "pin_hash" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "failed_pin_attempts" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "last_login_at" timestamp with time zone,
    "last_failed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."app_users" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_audit_logs" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "organization_id" "uuid",
    "attempted_lookup" "text",
    "event_type" "text" NOT NULL,
    "ip_hash" "text",
    "user_agent" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."auth_audit_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."auth_audit_logs" OWNER TO "postgres";


ALTER TABLE "public"."auth_audit_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."auth_audit_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."billing_number_counters" (
    "organization_id" "uuid" NOT NULL,
    "billing_date" "date" NOT NULL,
    "last_number" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."billing_number_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_number_counters_yearly" (
    "organization_id" "uuid" NOT NULL,
    "billing_year" integer NOT NULL,
    "last_number" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."billing_number_counters_yearly" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "billing_number" "text" NOT NULL,
    "from_date" "date" NOT NULL,
    "to_date" "date" NOT NULL,
    "billing_date" "date" NOT NULL,
    "total_amount" numeric(14,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "snapshot_rows" "jsonb"
);


ALTER TABLE "public"."billing_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_code_counters" (
    "organization_id" "uuid" NOT NULL,
    "last_number" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."customer_code_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_inquiries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text" NOT NULL,
    "source" "text" DEFAULT 'line'::"text" NOT NULL,
    "is_handled" boolean DEFAULT false NOT NULL,
    "handled_at" timestamp with time zone,
    "handled_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."customer_inquiries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_product_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "sale_price" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "product_sale_unit_id" "uuid" NOT NULL,
    CONSTRAINT "customer_product_prices_sale_price_check" CHECK (("sale_price" >= (0)::numeric))
);

ALTER TABLE ONLY "public"."customer_product_prices" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_product_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "customer_code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "default_vehicle_id" "uuid",
    "line_user_id" "text",
    "province" "text",
    "district" "text",
    "subdistrict" "text",
    "postal_code" "text",
    "phone" "text"
);

ALTER TABLE ONLY "public"."customers" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."customers"."province" IS 'จังหวัด — filled during LINE self-registration';



COMMENT ON COLUMN "public"."customers"."district" IS 'อำเภอ/เขต — filled during LINE self-registration';



COMMENT ON COLUMN "public"."customers"."subdistrict" IS 'ตำบล/แขวง — filled during LINE self-registration';



COMMENT ON COLUMN "public"."customers"."postal_code" IS 'รหัสไปรษณีย์ — auto-filled from subdistrict selection';



COMMENT ON COLUMN "public"."customers"."phone" IS 'เบอร์โทรศัพท์ร้าน — filled during LINE self-registration';



CREATE TABLE IF NOT EXISTS "public"."delivery_note_counters" (
    "organization_id" "uuid" NOT NULL,
    "last_number" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."delivery_note_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_note_counters_monthly" (
    "organization_id" "uuid" NOT NULL,
    "delivery_year" integer NOT NULL,
    "delivery_month" integer NOT NULL,
    "last_number" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "delivery_note_counters_monthly_delivery_month_check" CHECK ((("delivery_month" >= 1) AND ("delivery_month" <= 12)))
);


ALTER TABLE "public"."delivery_note_counters_monthly" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_note_counters_yearly" (
    "organization_id" "uuid" NOT NULL,
    "delivery_year" integer NOT NULL,
    "last_number" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."delivery_note_counters_yearly" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_note_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "delivery_note_id" "uuid" NOT NULL,
    "order_item_id" "uuid",
    "product_id" "uuid" NOT NULL,
    "product_sale_unit_id" "uuid",
    "sale_unit_label" "text" NOT NULL,
    "sale_unit_ratio" numeric(12,3) DEFAULT 1 NOT NULL,
    "quantity_delivered" numeric(12,3) NOT NULL,
    "quantity_in_base_unit" numeric(12,3) NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "line_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "delivery_note_items_qty_check" CHECK ((("quantity_delivered" > (0)::numeric) AND ("quantity_in_base_unit" > (0)::numeric)))
);

ALTER TABLE ONLY "public"."delivery_note_items" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_note_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "delivery_number" "text" NOT NULL,
    "delivery_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "dispatch_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "dispatched_at" timestamp with time zone,
    "dispatch_note" "text",
    CONSTRAINT "delivery_notes_dispatch_status_check" CHECK (("dispatch_status" = ANY (ARRAY['pending'::"text", 'delivered'::"text", 'problem'::"text"]))),
    CONSTRAINT "delivery_notes_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."delivery_notes" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_notes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."delivery_notes"."dispatch_status" IS 'Physical delivery status: pending=not yet sent, delivered=confirmed received, problem=delivery issue';



COMMENT ON COLUMN "public"."delivery_notes"."dispatched_at" IS 'Timestamp when the delivery was marked as delivered';



COMMENT ON COLUMN "public"."delivery_notes"."dispatch_note" IS 'Note when dispatch_status = problem (e.g. store closed, refused delivery)';



CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "receipt_id" "uuid",
    "receipt_item_id" "uuid",
    "movement_type" "text" NOT NULL,
    "quantity_delta" numeric(12,3) NOT NULL,
    "stock_before" numeric(12,3) NOT NULL,
    "stock_after" numeric(12,3) NOT NULL,
    "reference_number" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "inventory_movements_type_check" CHECK (("movement_type" = ANY (ARRAY['receipt'::"text", 'reserve'::"text", 'issue'::"text", 'release'::"text", 'adjustment'::"text"])))
);

ALTER TABLE ONLY "public"."inventory_movements" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_receipt_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "receipt_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity_received" numeric(12,3) NOT NULL,
    "unit" "text" NOT NULL,
    "unit_cost" numeric(12,2) NOT NULL,
    "stock_before" numeric(12,3) NOT NULL,
    "stock_after" numeric(12,3) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "inventory_receipt_items_quantity_positive" CHECK (("quantity_received" > (0)::numeric)),
    CONSTRAINT "inventory_receipt_items_unit_cost_nonnegative" CHECK (("unit_cost" >= (0)::numeric))
);

ALTER TABLE ONLY "public"."inventory_receipt_items" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_receipt_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "receipt_number" "text" NOT NULL,
    "supplier_name" "text" DEFAULT 'โรงงานหลัก'::"text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "receipt_url" "text",
    "supplier_id" "uuid"
);

ALTER TABLE ONLY "public"."inventory_receipts" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."line_order_customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "line_user_id" "text" NOT NULL,
    "line_display_name" "text",
    "line_picture_url" "text",
    "customer_id" "uuid",
    "onboarding_choice" "text" DEFAULT 'existing'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "line_order_customers_onboarding_choice_check" CHECK (("onboarding_choice" = ANY (ARRAY['existing'::"text", 'new'::"text"])))
);

ALTER TABLE ONLY "public"."line_order_customers" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."line_order_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."line_pending_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pending_order_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "product_sale_unit_id" "uuid" NOT NULL,
    "sale_unit_label" "text" NOT NULL,
    "sale_unit_ratio" numeric(12,3) DEFAULT 1 NOT NULL,
    "quantity" numeric(12,3) NOT NULL,
    "quantity_in_base_unit" numeric(12,3) NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "line_pending_order_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "line_pending_order_items_quantity_in_base_unit_check" CHECK (("quantity_in_base_unit" > (0)::numeric))
);

ALTER TABLE ONLY "public"."line_pending_order_items" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."line_pending_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."line_pending_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "line_order_customer_id" "uuid" NOT NULL,
    "line_user_id" "text" NOT NULL,
    "line_display_name" "text",
    "line_picture_url" "text",
    "status" "text" DEFAULT 'pending_link'::"text" NOT NULL,
    "converted_customer_id" "uuid",
    "converted_order_id" "uuid",
    "order_date" "date" DEFAULT (("now"() AT TIME ZONE 'Asia/Bangkok'::"text"))::"date" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "line_pending_orders_status_check" CHECK (("status" = ANY (ARRAY['pending_link'::"text", 'converted'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."line_pending_orders" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."line_pending_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric(12,3) NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "cost_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "line_total" numeric(12,2) NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "product_sale_unit_id" "uuid",
    "sale_unit_label" "text" NOT NULL,
    "sale_unit_ratio" numeric(12,3) DEFAULT 1 NOT NULL,
    "quantity_in_base_unit" numeric(12,3) DEFAULT 0 NOT NULL,
    CONSTRAINT "order_items_amounts_check" CHECK ((("quantity" > (0)::numeric) AND ("unit_price" >= (0)::numeric) AND ("cost_price" >= (0)::numeric) AND ("line_total" >= (0)::numeric)))
);

ALTER TABLE ONLY "public"."order_items" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_number_counters" (
    "organization_id" "uuid" NOT NULL,
    "last_number" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."order_number_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "order_number" "text" NOT NULL,
    "order_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "requested_delivery_date" "date",
    "status" "public"."order_status" DEFAULT 'submitted'::"public"."order_status" NOT NULL,
    "subtotal_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "placed_by_user_id" "uuid",
    "verified_by_user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "fulfillment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    CONSTRAINT "orders_amounts_check" CHECK ((("subtotal_amount" >= (0)::numeric) AND ("total_amount" >= (0)::numeric))),
    CONSTRAINT "orders_fulfillment_status_check" CHECK (("fulfillment_status" = ANY (ARRAY['pending'::"text", 'partial'::"text", 'complete'::"text"])))
);

ALTER TABLE ONLY "public"."orders" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."organizations" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."product_categories" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_category_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "product_category_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."product_category_items" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_category_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_cost_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "sale_unit_id" "uuid",
    "unit_label" "text" NOT NULL,
    "cost_before" numeric(12,2),
    "cost_after" numeric(12,2) NOT NULL,
    "changed_by_name" "text",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_cost_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."product_images" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_sale_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "unit_label" "text" NOT NULL,
    "base_unit_quantity" numeric(12,3) DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "cost_mode" "text" DEFAULT 'derived'::"text" NOT NULL,
    "fixed_cost_price" numeric(12,2),
    "min_order_qty" numeric(12,3) DEFAULT 1 NOT NULL,
    "step_order_qty" numeric(12,3),
    CONSTRAINT "product_sale_units_base_unit_quantity_check" CHECK (("base_unit_quantity" > (0)::numeric)),
    CONSTRAINT "product_sale_units_cost_mode_check" CHECK (("cost_mode" = ANY (ARRAY['derived'::"text", 'fixed'::"text"]))),
    CONSTRAINT "product_sale_units_fixed_cost_price_check" CHECK ((("fixed_cost_price" IS NULL) OR ("fixed_cost_price" >= (0)::numeric))),
    CONSTRAINT "product_sale_units_min_order_qty_check" CHECK (("min_order_qty" >= (0)::numeric)),
    CONSTRAINT "product_sale_units_step_order_qty_check" CHECK ((("step_order_qty" IS NULL) OR ("step_order_qty" > (0)::numeric)))
);

ALTER TABLE ONLY "public"."product_sale_units" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_sale_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "cost_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "stock_quantity" numeric(12,3) DEFAULT 0 NOT NULL,
    "unit" "text" DEFAULT 'piece'::"text" NOT NULL,
    "reserved_quantity" numeric(12,3) DEFAULT 0 NOT NULL,
    "display_order" integer DEFAULT 0,
    CONSTRAINT "products_cost_price_check" CHECK (("cost_price" >= (0)::numeric))
);

ALTER TABLE ONLY "public"."products" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "platform" "text",
    "user_agent" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_code_counters" (
    "organization_id" "uuid" NOT NULL,
    "last_number" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."supplier_code_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "supplier_code" "text",
    "name" "text" NOT NULL,
    "address" "text",
    "province" "text",
    "district" "text",
    "subdistrict" "text",
    "postal_code" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."system_database_stats" AS
 SELECT "schemaname",
    "relname" AS "table_name",
    "n_live_tup" AS "row_count",
    "pg_size_pretty"("pg_total_relation_size"(("relid")::"regclass")) AS "total_size",
    "pg_relation_size"(("relid")::"regclass") AS "size_bytes",
    COALESCE("idx_scan", (0)::bigint) AS "index_scans",
    COALESCE("seq_scan", (0)::bigint) AS "sequential_scans"
   FROM "pg_stat_user_tables"
  WHERE ("schemaname" = 'public'::"name");


ALTER VIEW "public"."system_database_stats" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."system_index_stats" AS
 SELECT "schemaname",
    "relname" AS "table_name",
    "indexrelname" AS "index_name",
    "pg_size_pretty"("pg_relation_size"(("indexrelid")::"regclass")) AS "index_size",
    "idx_scan" AS "index_scans"
   FROM "pg_stat_user_indexes"
  WHERE ("schemaname" = 'public'::"name");


ALTER VIEW "public"."system_index_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_performance_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "event_type" "text" NOT NULL,
    "event_name" "text" NOT NULL,
    "duration_ms" numeric NOT NULL,
    "user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."system_performance_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "license_plate" "text",
    "driver_name" "text",
    CONSTRAINT "vehicles_name_not_blank" CHECK (("char_length"(TRIM(BOTH FROM "name")) > 0))
);

ALTER TABLE ONLY "public"."vehicles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_sessions"
    ADD CONSTRAINT "app_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pin_lookup_key" UNIQUE ("pin_lookup");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_audit_logs"
    ADD CONSTRAINT "auth_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_number_counters"
    ADD CONSTRAINT "billing_number_counters_pkey" PRIMARY KEY ("organization_id", "billing_date");



ALTER TABLE ONLY "public"."billing_number_counters_yearly"
    ADD CONSTRAINT "billing_number_counters_yearly_pkey" PRIMARY KEY ("organization_id", "billing_year");



ALTER TABLE ONLY "public"."billing_records"
    ADD CONSTRAINT "billing_records_organization_id_billing_number_key" UNIQUE ("organization_id", "billing_number");



ALTER TABLE ONLY "public"."billing_records"
    ADD CONSTRAINT "billing_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_records"
    ADD CONSTRAINT "billing_records_unique_per_period" UNIQUE ("organization_id", "customer_id", "from_date", "to_date");



ALTER TABLE ONLY "public"."customer_code_counters"
    ADD CONSTRAINT "customer_code_counters_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."customer_inquiries"
    ADD CONSTRAINT "customer_inquiries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_product_prices"
    ADD CONSTRAINT "customer_product_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_org_code_unique" UNIQUE ("organization_id", "customer_code");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_note_counters_monthly"
    ADD CONSTRAINT "delivery_note_counters_monthly_pkey" PRIMARY KEY ("organization_id", "delivery_year", "delivery_month");



ALTER TABLE ONLY "public"."delivery_note_counters"
    ADD CONSTRAINT "delivery_note_counters_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."delivery_note_counters_yearly"
    ADD CONSTRAINT "delivery_note_counters_yearly_pkey" PRIMARY KEY ("organization_id", "delivery_year");



ALTER TABLE ONLY "public"."delivery_note_items"
    ADD CONSTRAINT "delivery_note_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_org_number_unique" UNIQUE ("organization_id", "delivery_number");



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_receipt_items"
    ADD CONSTRAINT "inventory_receipt_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_org_receipt_number_unique" UNIQUE ("organization_id", "receipt_number");



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."line_order_customers"
    ADD CONSTRAINT "line_order_customers_organization_id_line_user_id_key" UNIQUE ("organization_id", "line_user_id");



ALTER TABLE ONLY "public"."line_order_customers"
    ADD CONSTRAINT "line_order_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."line_pending_order_items"
    ADD CONSTRAINT "line_pending_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."line_pending_orders"
    ADD CONSTRAINT "line_pending_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_number_counters"
    ADD CONSTRAINT "order_number_counters_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_org_number_unique" UNIQUE ("organization_id", "order_number");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_org_name_unique" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_category_items"
    ADD CONSTRAINT "product_category_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_category_items"
    ADD CONSTRAINT "product_category_items_unique" UNIQUE ("product_category_id", "product_id");



ALTER TABLE ONLY "public"."product_cost_history"
    ADD CONSTRAINT "product_cost_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_sale_units"
    ADD CONSTRAINT "product_sale_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_org_sku_unique" UNIQUE ("organization_id", "sku");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_code_counters"
    ADD CONSTRAINT "supplier_code_counters_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_performance_logs"
    ADD CONSTRAINT "system_performance_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_org_name_unique" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



CREATE INDEX "app_sessions_active_idx" ON "public"."app_sessions" USING "btree" ("user_id", "expires_at" DESC) WHERE ("revoked_at" IS NULL);



CREATE INDEX "app_users_active_idx" ON "public"."app_users" USING "btree" ("is_active", "locked_until");



CREATE UNIQUE INDEX "app_users_org_email_unique" ON "public"."app_users" USING "btree" ("organization_id", "email") WHERE ("email" IS NOT NULL);



CREATE INDEX "app_users_org_role_idx" ON "public"."app_users" USING "btree" ("organization_id", "role");



CREATE INDEX "auth_audit_logs_user_created_idx" ON "public"."auth_audit_logs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "billing_records_org_cust_idx" ON "public"."billing_records" USING "btree" ("organization_id", "customer_id", "billing_date" DESC);



CREATE INDEX "customer_inquiries_org_created_idx" ON "public"."customer_inquiries" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "customer_inquiries_org_handled_idx" ON "public"."customer_inquiries" USING "btree" ("organization_id", "is_handled", "created_at" DESC);



CREATE INDEX "customer_product_prices_customer_idx" ON "public"."customer_product_prices" USING "btree" ("organization_id", "customer_id");



CREATE INDEX "customer_product_prices_customer_product_unit_idx" ON "public"."customer_product_prices" USING "btree" ("organization_id", "customer_id", "product_id", "product_sale_unit_id");



CREATE UNIQUE INDEX "customer_product_prices_customer_sale_unit_unique" ON "public"."customer_product_prices" USING "btree" ("organization_id", "customer_id", "product_sale_unit_id");



CREATE INDEX "customer_product_prices_product_idx" ON "public"."customer_product_prices" USING "btree" ("organization_id", "product_id", "product_sale_unit_id");



CREATE INDEX "customer_product_prices_sale_unit_lookup_idx" ON "public"."customer_product_prices" USING "btree" ("organization_id", "customer_id", "product_sale_unit_id");



CREATE INDEX "customers_default_vehicle_idx" ON "public"."customers" USING "btree" ("organization_id", "default_vehicle_id");



CREATE UNIQUE INDEX "customers_line_user_id_unique" ON "public"."customers" USING "btree" ("line_user_id") WHERE ("line_user_id" IS NOT NULL);



CREATE INDEX "customers_org_name_idx" ON "public"."customers" USING "btree" ("organization_id", "name");



CREATE INDEX "delivery_note_items_dn_idx" ON "public"."delivery_note_items" USING "btree" ("delivery_note_id");



CREATE INDEX "delivery_note_items_note_product_unit_idx" ON "public"."delivery_note_items" USING "btree" ("delivery_note_id", "product_id", "product_sale_unit_id");



CREATE INDEX "delivery_note_items_note_sale_unit_idx" ON "public"."delivery_note_items" USING "btree" ("delivery_note_id", "product_sale_unit_id");



CREATE INDEX "delivery_note_items_order_item_idx" ON "public"."delivery_note_items" USING "btree" ("order_item_id");



CREATE INDEX "delivery_note_items_order_item_product_idx" ON "public"."delivery_note_items" USING "btree" ("order_item_id", "product_id");



CREATE INDEX "delivery_note_items_sale_unit_idx" ON "public"."delivery_note_items" USING "btree" ("product_sale_unit_id");



CREATE INDEX "delivery_notes_dispatch_idx" ON "public"."delivery_notes" USING "btree" ("organization_id", "delivery_date" DESC, "dispatch_status");



CREATE INDEX "delivery_notes_order_lookup_idx" ON "public"."delivery_notes" USING "btree" ("order_id");



CREATE INDEX "delivery_notes_org_customer_date_status_idx" ON "public"."delivery_notes" USING "btree" ("organization_id", "customer_id", "delivery_date", "status");



CREATE INDEX "delivery_notes_org_date_idx" ON "public"."delivery_notes" USING "btree" ("organization_id", "delivery_date" DESC, "created_at" DESC);



CREATE INDEX "delivery_notes_org_date_status_customer_idx" ON "public"."delivery_notes" USING "btree" ("organization_id", "delivery_date", "status", "customer_id");



CREATE INDEX "delivery_notes_org_order_idx" ON "public"."delivery_notes" USING "btree" ("organization_id", "order_id");



CREATE INDEX "delivery_notes_profit_customer_date_idx" ON "public"."delivery_notes" USING "btree" ("organization_id", "customer_id", "delivery_date") WHERE ("status" = 'confirmed'::"text");



CREATE INDEX "delivery_notes_profit_report_idx" ON "public"."delivery_notes" USING "btree" ("organization_id", "status", "delivery_date");



CREATE INDEX "idx_delivery_note_items_review" ON "public"."delivery_note_items" USING "btree" ("organization_id", "order_item_id");



CREATE INDEX "idx_order_items_delivery_review" ON "public"."order_items" USING "btree" ("organization_id", "order_id");



CREATE INDEX "idx_orders_delivery_review" ON "public"."orders" USING "btree" ("organization_id", "order_date", "customer_id", "created_at") WHERE ("status" = ANY (ARRAY['submitted'::"public"."order_status", 'confirmed'::"public"."order_status"]));



CREATE INDEX "inventory_movements_org_created_idx" ON "public"."inventory_movements" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "inventory_movements_product_created_idx" ON "public"."inventory_movements" USING "btree" ("product_id", "created_at" DESC);



CREATE INDEX "inventory_receipt_items_product_idx" ON "public"."inventory_receipt_items" USING "btree" ("product_id", "created_at" DESC);



CREATE INDEX "inventory_receipt_items_receipt_idx" ON "public"."inventory_receipt_items" USING "btree" ("receipt_id", "created_at" DESC);



CREATE INDEX "inventory_receipts_org_received_idx" ON "public"."inventory_receipts" USING "btree" ("organization_id", "received_at" DESC, "created_at" DESC);



CREATE INDEX "inventory_receipts_supplier_id_idx" ON "public"."inventory_receipts" USING "btree" ("supplier_id");



CREATE INDEX "line_order_customers_org_customer_idx" ON "public"."line_order_customers" USING "btree" ("organization_id", "customer_id");



CREATE INDEX "line_pending_order_items_pending_idx" ON "public"."line_pending_order_items" USING "btree" ("pending_order_id", "sort_order");



CREATE INDEX "line_pending_orders_org_line_idx" ON "public"."line_pending_orders" USING "btree" ("organization_id", "line_user_id", "status");



CREATE INDEX "line_pending_orders_org_status_date_idx" ON "public"."line_pending_orders" USING "btree" ("organization_id", "status", "order_date" DESC, "created_at" DESC);



CREATE INDEX "order_items_order_idx" ON "public"."order_items" USING "btree" ("order_id", "created_at");



CREATE INDEX "order_items_order_sale_unit_idx" ON "public"."order_items" USING "btree" ("order_id", "product_id", "product_sale_unit_id");



CREATE INDEX "order_items_org_order_product_idx" ON "public"."order_items" USING "btree" ("organization_id", "order_id", "product_id");



CREATE INDEX "order_items_product_idx" ON "public"."order_items" USING "btree" ("product_id");



CREATE INDEX "orders_customer_date_idx" ON "public"."orders" USING "btree" ("customer_id", "order_date" DESC, "created_at" DESC);



CREATE INDEX "orders_org_customer_date_status_idx" ON "public"."orders" USING "btree" ("organization_id", "customer_id", "order_date", "status");



CREATE INDEX "orders_org_date_customer_created_idx" ON "public"."orders" USING "btree" ("organization_id", "order_date" DESC, "customer_id", "created_at" DESC);



CREATE INDEX "orders_org_date_status_customer_idx" ON "public"."orders" USING "btree" ("organization_id", "order_date", "status", "customer_id");



CREATE INDEX "orders_org_fulfillment_idx" ON "public"."orders" USING "btree" ("organization_id", "fulfillment_status", "order_date" DESC);



CREATE INDEX "orders_org_status_date_idx" ON "public"."orders" USING "btree" ("organization_id", "status", "order_date" DESC);



CREATE INDEX "product_categories_org_sort_idx" ON "public"."product_categories" USING "btree" ("organization_id", "sort_order", "name");



CREATE INDEX "product_category_items_category_idx" ON "public"."product_category_items" USING "btree" ("product_category_id", "product_id");



CREATE UNIQUE INDEX "product_category_items_org_product_unique" ON "public"."product_category_items" USING "btree" ("organization_id", "product_id");



CREATE INDEX "product_category_items_product_idx" ON "public"."product_category_items" USING "btree" ("product_id", "product_category_id");



CREATE INDEX "product_cost_history_product_id_changed_at_idx" ON "public"."product_cost_history" USING "btree" ("product_id", "changed_at" DESC);



CREATE INDEX "product_images_product_sort_idx" ON "public"."product_images" USING "btree" ("product_id", "sort_order", "created_at");



CREATE INDEX "product_sale_units_org_product_active_idx" ON "public"."product_sale_units" USING "btree" ("organization_id", "product_id", "is_active", "sort_order", "created_at");



CREATE INDEX "product_sale_units_picker_idx" ON "public"."product_sale_units" USING "btree" ("organization_id", "product_id", "is_active", "sort_order", "created_at");



CREATE UNIQUE INDEX "product_sale_units_product_label_unique" ON "public"."product_sale_units" USING "btree" ("product_id", "lower"("unit_label"));



CREATE INDEX "products_order_picker_idx" ON "public"."products" USING "btree" ("organization_id", "is_active", "display_order", "created_at");



CREATE INDEX "products_org_name_idx" ON "public"."products" USING "btree" ("organization_id", "name");



CREATE INDEX "push_subscriptions_org_active_idx" ON "public"."push_subscriptions" USING "btree" ("organization_id", "is_active", "updated_at" DESC);



CREATE INDEX "push_subscriptions_user_active_idx" ON "public"."push_subscriptions" USING "btree" ("user_id", "is_active", "updated_at" DESC);



CREATE INDEX "suppliers_org_active_idx" ON "public"."suppliers" USING "btree" ("organization_id", "is_active", "name");



CREATE UNIQUE INDEX "suppliers_org_code_unique" ON "public"."suppliers" USING "btree" ("organization_id", "supplier_code") WHERE ("supplier_code" IS NOT NULL);



CREATE INDEX "system_performance_logs_event_name_idx" ON "public"."system_performance_logs" USING "btree" ("event_name", "created_at" DESC);



CREATE INDEX "system_performance_logs_org_type_idx" ON "public"."system_performance_logs" USING "btree" ("organization_id", "event_type", "created_at" DESC);



CREATE INDEX "vehicles_org_sort_idx" ON "public"."vehicles" USING "btree" ("organization_id", "sort_order", "created_at");



CREATE OR REPLACE TRIGGER "app_users_set_updated_at" BEFORE UPDATE ON "public"."app_users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "customer_product_prices_set_updated_at" BEFORE UPDATE ON "public"."customer_product_prices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "customers_set_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "delivery_notes_set_updated_at" BEFORE UPDATE ON "public"."delivery_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "line_order_customers_set_updated_at" BEFORE UPDATE ON "public"."line_order_customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "line_pending_orders_set_updated_at" BEFORE UPDATE ON "public"."line_pending_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "order_items_set_updated_at" BEFORE UPDATE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "orders_set_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "organizations_set_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "product_categories_set_updated_at" BEFORE UPDATE ON "public"."product_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "product_sale_units_set_updated_at" BEFORE UPDATE ON "public"."product_sale_units" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "products_set_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_vehicles_updated_at" BEFORE UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "suppliers_set_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."app_sessions"
    ADD CONSTRAINT "app_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_sessions"
    ADD CONSTRAINT "app_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."auth_audit_logs"
    ADD CONSTRAINT "auth_audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."auth_audit_logs"
    ADD CONSTRAINT "auth_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."billing_number_counters"
    ADD CONSTRAINT "billing_number_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_number_counters_yearly"
    ADD CONSTRAINT "billing_number_counters_yearly_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_records"
    ADD CONSTRAINT "billing_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."billing_records"
    ADD CONSTRAINT "billing_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_records"
    ADD CONSTRAINT "billing_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_code_counters"
    ADD CONSTRAINT "customer_code_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_inquiries"
    ADD CONSTRAINT "customer_inquiries_handled_by_user_id_fkey" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_inquiries"
    ADD CONSTRAINT "customer_inquiries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_product_prices"
    ADD CONSTRAINT "customer_product_prices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_product_prices"
    ADD CONSTRAINT "customer_product_prices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_product_prices"
    ADD CONSTRAINT "customer_product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_product_prices"
    ADD CONSTRAINT "customer_product_prices_product_sale_unit_id_fkey" FOREIGN KEY ("product_sale_unit_id") REFERENCES "public"."product_sale_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_default_vehicle_id_fkey" FOREIGN KEY ("default_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_note_counters_monthly"
    ADD CONSTRAINT "delivery_note_counters_monthly_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_note_counters"
    ADD CONSTRAINT "delivery_note_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_note_counters_yearly"
    ADD CONSTRAINT "delivery_note_counters_yearly_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_note_items"
    ADD CONSTRAINT "delivery_note_items_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "public"."delivery_notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_note_items"
    ADD CONSTRAINT "delivery_note_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_note_items"
    ADD CONSTRAINT "delivery_note_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_note_items"
    ADD CONSTRAINT "delivery_note_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_note_items"
    ADD CONSTRAINT "delivery_note_items_product_sale_unit_id_fkey" FOREIGN KEY ("product_sale_unit_id") REFERENCES "public"."product_sale_units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."inventory_receipts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_receipt_item_id_fkey" FOREIGN KEY ("receipt_item_id") REFERENCES "public"."inventory_receipt_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_receipt_items"
    ADD CONSTRAINT "inventory_receipt_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_receipt_items"
    ADD CONSTRAINT "inventory_receipt_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_receipt_items"
    ADD CONSTRAINT "inventory_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."inventory_receipts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."line_order_customers"
    ADD CONSTRAINT "line_order_customers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."line_order_customers"
    ADD CONSTRAINT "line_order_customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."line_pending_order_items"
    ADD CONSTRAINT "line_pending_order_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."line_pending_order_items"
    ADD CONSTRAINT "line_pending_order_items_pending_order_id_fkey" FOREIGN KEY ("pending_order_id") REFERENCES "public"."line_pending_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."line_pending_order_items"
    ADD CONSTRAINT "line_pending_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."line_pending_order_items"
    ADD CONSTRAINT "line_pending_order_items_product_sale_unit_id_fkey" FOREIGN KEY ("product_sale_unit_id") REFERENCES "public"."product_sale_units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."line_pending_orders"
    ADD CONSTRAINT "line_pending_orders_converted_customer_id_fkey" FOREIGN KEY ("converted_customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."line_pending_orders"
    ADD CONSTRAINT "line_pending_orders_converted_order_id_fkey" FOREIGN KEY ("converted_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."line_pending_orders"
    ADD CONSTRAINT "line_pending_orders_line_order_customer_id_fkey" FOREIGN KEY ("line_order_customer_id") REFERENCES "public"."line_order_customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."line_pending_orders"
    ADD CONSTRAINT "line_pending_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_sale_unit_id_fkey" FOREIGN KEY ("product_sale_unit_id") REFERENCES "public"."product_sale_units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_number_counters"
    ADD CONSTRAINT "order_number_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_placed_by_user_id_fkey" FOREIGN KEY ("placed_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_category_items"
    ADD CONSTRAINT "product_category_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_category_items"
    ADD CONSTRAINT "product_category_items_product_category_id_fkey" FOREIGN KEY ("product_category_id") REFERENCES "public"."product_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_category_items"
    ADD CONSTRAINT "product_category_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_cost_history"
    ADD CONSTRAINT "product_cost_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_cost_history"
    ADD CONSTRAINT "product_cost_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_cost_history"
    ADD CONSTRAINT "product_cost_history_sale_unit_id_fkey" FOREIGN KEY ("sale_unit_id") REFERENCES "public"."product_sale_units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_sale_units"
    ADD CONSTRAINT "product_sale_units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_sale_units"
    ADD CONSTRAINT "product_sale_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_code_counters"
    ADD CONSTRAINT "supplier_code_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_performance_logs"
    ADD CONSTRAINT "system_performance_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE "public"."app_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_sessions_deny_api_access" ON "public"."app_sessions" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_users_deny_api_access" ON "public"."app_users" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."auth_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auth_audit_logs_deny_api_access" ON "public"."auth_audit_logs" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."billing_number_counters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "billing_number_counters_deny_api_access" ON "public"."billing_number_counters" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."billing_number_counters_yearly" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "billing_number_counters_yearly_deny_api_access" ON "public"."billing_number_counters_yearly" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."billing_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "billing_records_deny_api_access" ON "public"."billing_records" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."customer_code_counters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_code_counters_deny_api_access" ON "public"."customer_code_counters" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."customer_inquiries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_inquiries_deny_api_access" ON "public"."customer_inquiries" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."customer_product_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_product_prices_deny_api_access" ON "public"."customer_product_prices" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_deny_api_access" ON "public"."customers" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."delivery_note_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_note_counters_monthly" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_note_counters_monthly_deny_api_access" ON "public"."delivery_note_counters_monthly" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."delivery_note_counters_yearly" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_note_counters_yearly_deny_api_access" ON "public"."delivery_note_counters_yearly" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."delivery_note_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_note_items_deny_api_access" ON "public"."delivery_note_items" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."delivery_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_notes_deny_api_access" ON "public"."delivery_notes" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_receipt_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."line_order_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."line_pending_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."line_pending_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_deny_api_access" ON "public"."order_items" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."order_number_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_deny_api_access" ON "public"."orders" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_deny_api_access" ON "public"."organizations" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."product_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_category_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_cost_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_images_deny_api_access" ON "public"."product_images" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."product_sale_units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_deny_api_access" ON "public"."products" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_code_counters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_code_counters_deny_api_access" ON "public"."supplier_code_counters" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_performance_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "telemetry_admin_all" ON "public"."system_performance_logs" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."adjust_delivery_note_item"("p_organization_id" "uuid", "p_delivery_note_item_id" "uuid", "p_new_quantity_delivered" numeric, "p_adjusted_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_delivery_note_item"("p_organization_id" "uuid", "p_delivery_note_item_id" "uuid", "p_new_quantity_delivered" numeric, "p_adjusted_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_delivery_note_item"("p_organization_id" "uuid", "p_delivery_note_item_id" "uuid", "p_new_quantity_delivered" numeric, "p_adjusted_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."adjust_delivery_note_item"("p_organization_id" "uuid", "p_delivery_note_item_id" "uuid", "p_new_quantity_delivered" numeric, "p_adjusted_by" "uuid", "p_resolution_mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_delivery_note_item"("p_organization_id" "uuid", "p_delivery_note_item_id" "uuid", "p_new_quantity_delivered" numeric, "p_adjusted_by" "uuid", "p_resolution_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_delivery_note_item"("p_organization_id" "uuid", "p_delivery_note_item_id" "uuid", "p_new_quantity_delivered" numeric, "p_adjusted_by" "uuid", "p_resolution_mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."adjust_inventory"("p_organization_id" "uuid", "p_product_id" "uuid", "p_new_stock_quantity" numeric, "p_adjusted_by" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_inventory"("p_organization_id" "uuid", "p_product_id" "uuid", "p_new_stock_quantity" numeric, "p_adjusted_by" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_inventory"("p_organization_id" "uuid", "p_product_id" "uuid", "p_new_stock_quantity" numeric, "p_adjusted_by" "uuid", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."allocate_requisition_document_numbers"("requested_at" timestamp with time zone, "requested_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."allocate_requisition_document_numbers"("requested_at" timestamp with time zone, "requested_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."allocate_requisition_document_numbers"("requested_at" timestamp with time zone, "requested_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_stale_orders"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stale_orders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stale_orders"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_app_session"("p_user_id" "uuid", "p_ip_hash" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_app_session"("p_user_id" "uuid", "p_ip_hash" "text", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_app_session_with_success_audit"("p_user_id" "uuid", "p_attempted_lookup" "text", "p_ip_hash" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_app_session_with_success_audit"("p_user_id" "uuid", "p_attempted_lookup" "text", "p_ip_hash" "text", "p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_delivery_note"("p_organization_id" "uuid", "p_order_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_delivery_date" "date", "p_notes" "text", "p_created_by" "uuid", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_delivery_note"("p_organization_id" "uuid", "p_order_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_delivery_date" "date", "p_notes" "text", "p_created_by" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_delivery_note"("p_organization_id" "uuid", "p_order_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_delivery_date" "date", "p_notes" "text", "p_created_by" "uuid", "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb", "p_receipt_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb", "p_receipt_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb", "p_receipt_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb", "p_receipt_url" "text", "p_supplier_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb", "p_receipt_url" "text", "p_supplier_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_inventory_receipt"("p_organization_id" "uuid", "p_created_by" "uuid", "p_receipt_number" "text", "p_supplier_name" "text", "p_received_at" timestamp with time zone, "p_notes" "text", "p_items" "jsonb", "p_receipt_url" "text", "p_supplier_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_store_delivery_note"("p_organization_id" "uuid", "p_order_ids" "uuid"[], "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_delivery_date" "date", "p_notes" "text", "p_created_by" "uuid", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_store_delivery_note"("p_organization_id" "uuid", "p_order_ids" "uuid"[], "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_delivery_date" "date", "p_notes" "text", "p_created_by" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_store_delivery_note"("p_organization_id" "uuid", "p_order_ids" "uuid"[], "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_delivery_date" "date", "p_notes" "text", "p_created_by" "uuid", "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_receipt_number"("p_organization_id" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_receipt_number"("p_organization_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_receipt_number"("p_organization_id" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_delivery_review_data"("p_organization_id" "uuid", "p_stores" "jsonb", "p_order_date" "date", "p_include_order_items" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_delivery_review_data"("p_organization_id" "uuid", "p_stores" "jsonb", "p_order_date" "date", "p_include_order_items" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_delivery_review_data"("p_organization_id" "uuid", "p_stores" "jsonb", "p_order_date" "date", "p_include_order_items" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_order_daily_store_items"("p_organization_id" "uuid", "p_order_date" "date", "p_customer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_order_daily_store_items"("p_organization_id" "uuid", "p_order_date" "date", "p_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_daily_store_items"("p_organization_id" "uuid", "p_order_date" "date", "p_customer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_order_daily_store_summaries"("p_organization_id" "uuid", "p_order_date" "date", "p_search" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_order_daily_store_summaries"("p_organization_id" "uuid", "p_order_date" "date", "p_search" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_daily_store_summaries"("p_organization_id" "uuid", "p_order_date" "date", "p_search" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_profit_sales_report"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date", "p_customer_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_profit_sales_report"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date", "p_customer_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_profit_sales_report"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date", "p_customer_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."next_billing_number"("p_organization_id" "uuid", "p_billing_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."next_billing_number"("p_organization_id" "uuid", "p_billing_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_billing_number"("p_organization_id" "uuid", "p_billing_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."next_customer_code"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."next_customer_code"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_customer_code"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."next_delivery_note_number"("p_organization_id" "uuid", "p_delivery_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."next_delivery_note_number"("p_organization_id" "uuid", "p_delivery_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_delivery_note_number"("p_organization_id" "uuid", "p_delivery_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."next_order_number"("p_organization_id" "uuid", "p_order_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."next_order_number"("p_organization_id" "uuid", "p_order_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_order_number"("p_organization_id" "uuid", "p_order_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."next_supplier_code"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."next_supplier_code"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_supplier_code"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_pin_auth_result"("p_user_id" "uuid", "p_attempted_lookup" "text", "p_success" boolean, "p_ip_hash" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_pin_auth_result"("p_user_id" "uuid", "p_attempted_lookup" "text", "p_success" boolean, "p_ip_hash" "text", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_app_session"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_app_session"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_inventory_receipt"("p_organization_id" "uuid", "p_receipt_id" "uuid", "p_received_at" timestamp with time zone, "p_supplier_id" "uuid", "p_supplier_name" "text", "p_notes" "text", "p_items" "jsonb", "p_updated_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_inventory_receipt"("p_organization_id" "uuid", "p_receipt_id" "uuid", "p_received_at" timestamp with time zone, "p_supplier_id" "uuid", "p_supplier_name" "text", "p_notes" "text", "p_items" "jsonb", "p_updated_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inventory_receipt"("p_organization_id" "uuid", "p_receipt_id" "uuid", "p_received_at" timestamp with time zone, "p_supplier_id" "uuid", "p_supplier_name" "text", "p_notes" "text", "p_items" "jsonb", "p_updated_by" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."app_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT ALL ON TABLE "public"."auth_audit_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."auth_audit_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."auth_audit_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."auth_audit_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."billing_number_counters" TO "anon";
GRANT ALL ON TABLE "public"."billing_number_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_number_counters" TO "service_role";



GRANT ALL ON TABLE "public"."billing_number_counters_yearly" TO "anon";
GRANT ALL ON TABLE "public"."billing_number_counters_yearly" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_number_counters_yearly" TO "service_role";



GRANT ALL ON TABLE "public"."billing_records" TO "anon";
GRANT ALL ON TABLE "public"."billing_records" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_records" TO "service_role";



GRANT ALL ON TABLE "public"."customer_code_counters" TO "anon";
GRANT ALL ON TABLE "public"."customer_code_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_code_counters" TO "service_role";



GRANT ALL ON TABLE "public"."customer_inquiries" TO "anon";
GRANT ALL ON TABLE "public"."customer_inquiries" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_inquiries" TO "service_role";



GRANT ALL ON TABLE "public"."customer_product_prices" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_note_counters" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_note_counters_monthly" TO "anon";
GRANT ALL ON TABLE "public"."delivery_note_counters_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_note_counters_monthly" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_note_counters_yearly" TO "anon";
GRANT ALL ON TABLE "public"."delivery_note_counters_yearly" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_note_counters_yearly" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_note_items" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_notes" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_receipt_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."line_order_customers" TO "service_role";



GRANT ALL ON TABLE "public"."line_pending_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."line_pending_orders" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_number_counters" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."product_categories" TO "service_role";



GRANT ALL ON TABLE "public"."product_category_items" TO "service_role";



GRANT ALL ON TABLE "public"."product_cost_history" TO "anon";
GRANT ALL ON TABLE "public"."product_cost_history" TO "authenticated";
GRANT ALL ON TABLE "public"."product_cost_history" TO "service_role";



GRANT ALL ON TABLE "public"."product_images" TO "service_role";



GRANT ALL ON TABLE "public"."product_sale_units" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_code_counters" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."system_database_stats" TO "anon";
GRANT ALL ON TABLE "public"."system_database_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."system_database_stats" TO "service_role";



GRANT ALL ON TABLE "public"."system_index_stats" TO "anon";
GRANT ALL ON TABLE "public"."system_index_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."system_index_stats" TO "service_role";



GRANT ALL ON TABLE "public"."system_performance_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_performance_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_performance_logs" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































