-- Migration: Create adjust_inventory RPC
-- Description: Safely adjusts stock quantity and records a movement log.

CREATE OR REPLACE FUNCTION public.adjust_inventory(
    p_organization_id uuid,
    p_product_id uuid,
    p_new_stock_quantity numeric,
    p_adjusted_by uuid,
    p_notes text
)
RETURNS void AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
