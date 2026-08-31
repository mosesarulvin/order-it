-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 020: Customer Dashboard Enhancements & Schema Integrity
-- Links orders by phone number, returns coupons, and ensures shop columns exist
-- ═══════════════════════════════════════════════════════════════════════════

-- 0. Ensure all expected columns exist across tables
  ADD COLUMN IF NOT EXISTS status           TEXT        NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan             TEXT        NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS accepts_upi       BOOLEAN              DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepts_cash      BOOLEAN              DEFAULT true,
  ADD COLUMN IF NOT EXISTS ordering_enabled  BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trial_ends_at    TIMESTAMPTZ          DEFAULT (NOW() + INTERVAL '14 days'),
  ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspend_reason   TEXT;

ALTER TABLE orders
CREATE OR REPLACE FUNCTION _link_customer_orders_by_phone(p_profile_id UUID, p_shop_id UUID, p_phone TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_phone IS NOT NULL AND p_phone <> '' AND p_phone <> 'anonymous' THEN
    UPDATE orders
    SET customer_profile_id = p_profile_id
    WHERE shop_id = p_shop_id
      AND customer_phone = p_phone
      AND customer_profile_id IS NULL;
  END IF;
END;
$$;

-- 2. Enhanced get_customer_orders: return orders by profile_id OR customer_phone
CREATE OR REPLACE FUNCTION get_customer_orders(p_session_token TEXT, p_limit INT DEFAULT 20)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session customer_sessions%ROWTYPE;
  v_phone   TEXT;
BEGIN
  v_session := _resolve_customer_session(p_session_token);
  IF v_session.id IS NULL THEN RETURN '[]'::JSON; END IF;

  SELECT phone INTO v_phone FROM customer_profiles WHERE id = v_session.profile_id;

  -- Auto-link any past orders that may not have profile_id yet
  IF v_phone IS NOT NULL THEN
    PERFORM _link_customer_orders_by_phone(v_session.profile_id, v_session.shop_id, v_phone);
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
    FROM (
      SELECT o.id, o.order_number, o.status, o.payment_method, o.payment_status,
             o.subtotal, o.tax_amount, o.packing_charge, o.discount_amount, o.total,
             o.created_at,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id',            i.id,
                 'menu_item_id',  i.menu_item_id,
                 'name',          i.name,
                 'price',         i.price,
                 'quantity',      i.quantity,
                 'subtotal',      i.subtotal,
                 'customizations',i.customizations
               ))
               FROM order_items i WHERE i.order_id = o.id
             ), '[]'::json) AS items
      FROM orders o
      WHERE o.shop_id = v_session.shop_id
        AND (o.customer_profile_id = v_session.profile_id OR (v_phone IS NOT NULL AND v_phone <> '' AND o.customer_phone = v_phone))
      ORDER BY o.created_at DESC
      LIMIT LEAST(GREATEST(p_limit, 1), 100)
    ) t
  ), '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_orders(TEXT, INT) TO anon, authenticated;

-- 3. Enhanced get_customer_coupons: return profile coupons + active public shop coupons
CREATE OR REPLACE FUNCTION get_customer_coupons(p_session_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session customer_sessions%ROWTYPE;
BEGIN
  v_session := _resolve_customer_session(p_session_token);
  IF v_session.id IS NULL THEN RETURN '[]'::JSON; END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id',               c.id,
      'coupon_code',      c.coupon_code,
      'label',            c.label,
      'discount_type',    c.discount_type,
      'discount_value',   c.discount_value,
      'min_order_amount', c.min_order_amount,
      'assigned_at',      c.assigned_at,
      'used_at',          c.used_at,
      'expires_at',       c.expires_at
    ) ORDER BY (c.used_at IS NULL) DESC, c.assigned_at DESC)
    FROM (
      -- 1. Assigned profile coupons
      SELECT 
        pc.id::TEXT AS id,
        pc.coupon_code,
        pc.label,
        co.type AS discount_type,
        co.value AS discount_value,
        co.min_order_amount,
        pc.assigned_at,
        pc.used_at,
        co.expires_at
      FROM profile_coupons pc
      LEFT JOIN coupons co ON co.id = pc.coupon_id
      WHERE pc.profile_id = v_session.profile_id

      UNION ALL

      -- 2. General active shop coupons not already in profile_coupons
      SELECT
        co.id::TEXT AS id,
        co.code AS coupon_code,
        CASE
          WHEN co.type = 'percentage' THEN co.value || '% OFF on orders above ₹' || COALESCE(co.min_order_amount, 0)
          ELSE '₹' || co.value || ' FLAT OFF on orders above ₹' || COALESCE(co.min_order_amount, 0)
        END AS label,
        co.type AS discount_type,
        co.value AS discount_value,
        co.min_order_amount,
        co.created_at AS assigned_at,
        NULL::timestamptz AS used_at,
        co.expires_at
      FROM coupons co
      WHERE co.shop_id = v_session.shop_id
        AND co.is_active = true
        AND (co.expires_at IS NULL OR co.expires_at > now())
        AND (co.max_uses IS NULL OR co.used_count < co.max_uses)
        AND co.code NOT IN (
          SELECT coupon_code FROM profile_coupons WHERE profile_id = v_session.profile_id
        )
    ) c
  ), '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_coupons(TEXT) TO anon, authenticated;

-- 3.5. Enhanced get_customer_orders with complete billing metadata
CREATE OR REPLACE FUNCTION get_customer_orders(p_session_token TEXT, p_limit INT DEFAULT 30)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session customer_sessions%ROWTYPE;
BEGIN
  v_session := _resolve_customer_session(p_session_token);
  IF v_session.id IS NULL THEN RETURN '[]'::JSON; END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
    FROM (
      SELECT o.id, o.order_number, o.status, o.payment_method, o.payment_status,
             o.order_type, o.customer_name, o.customer_phone, o.coupon_code, o.notes,
             o.subtotal, o.tax_amount, o.packing_charge, o.discount_amount, o.total,
             o.created_at,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id',            i.id,
                 'menu_item_id',  i.menu_item_id,
                 'name',          i.name,
                 'price',         i.price,
                 'quantity',      i.quantity,
                 'subtotal',      i.subtotal,
                 'customizations',i.customizations
               ))
               FROM order_items i WHERE i.order_id = o.id
             ), '[]'::json) AS items
      FROM orders o
      WHERE o.shop_id = v_session.shop_id
        AND o.customer_profile_id = v_session.profile_id
      ORDER BY o.created_at DESC
      LIMIT LEAST(GREATEST(p_limit, 1), 100)
    ) t
  ), '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_orders(TEXT, INT) TO anon, authenticated;

-- 4. Re-declare place_customer_order with safe shop checks
CREATE OR REPLACE FUNCTION place_customer_order(
  p_shop_id        UUID,
  p_session_token  TEXT,
  p_items          JSONB,
  p_order_type     TEXT,
  p_payment_method TEXT,
  p_notes          TEXT,
  p_coupon_code    TEXT,
  p_is_anonymous   BOOLEAN
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop            shops%ROWTYPE;
  v_session         customer_sessions%ROWTYPE;
  v_profile         customer_profiles%ROWTYPE;
  v_item            JSONB;
  v_menu            menu_items%ROWTYPE;
  v_variant         JSONB;
  v_variant_price   NUMERIC;
  v_customization_sum NUMERIC;
  v_unit_price      NUMERIC;
  v_line_subtotal   NUMERIC;
  v_qty             INTEGER;
  v_subtotal        NUMERIC := 0;
  v_packing         NUMERIC := 0;
  v_tax             NUMERIC := 0;
  v_discount        NUMERIC := 0;
  v_total           NUMERIC;
  v_all_instant     BOOLEAN := true;
  v_status          TEXT;
  v_coupon          coupons%ROWTYPE;
  v_order_number    TEXT;
  v_order_id        UUID;
  v_tracking_token  UUID;
  v_customer_name   TEXT;
  v_customer_phone  TEXT;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart' USING ERRCODE = '22023';
  END IF;
  IF p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'invalid_order_type' USING ERRCODE = '22023';
  END IF;
  IF p_payment_method NOT IN ('cash', 'upi') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;
  IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN
    RAISE EXCEPTION 'notes_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_shop FROM shops WHERE id = p_shop_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'shop_not_found' USING ERRCODE = '02000'; END IF;
  IF COALESCE(v_shop.status, 'active') <> 'active' AND COALESCE(v_shop.status, 'active') <> 'trial' THEN
    RAISE EXCEPTION 'shop_unavailable' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(v_shop.ordering_enabled, true) THEN
    RAISE EXCEPTION 'ordering_disabled' USING ERRCODE = '42501';
  END IF;
  IF p_payment_method = 'upi'  AND NOT COALESCE(v_shop.accepts_upi, true) THEN
    RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_payment_method = 'cash' AND NOT COALESCE(v_shop.accepts_cash, true) THEN
    RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE = '42501';
  END IF;

  IF p_session_token IS NOT NULL THEN
    v_session := _resolve_customer_session(p_session_token);
    IF v_session.id IS NULL OR v_session.shop_id <> p_shop_id THEN
      RAISE EXCEPTION 'invalid_session' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_profile FROM customer_profiles WHERE id = v_session.profile_id;
    v_customer_name  := v_profile.name;
    v_customer_phone := v_profile.phone;
  ELSIF p_is_anonymous THEN
    v_customer_name  := 'Anonymous';
    v_customer_phone := 'anonymous';
  ELSE
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM menu_items
  WHERE id = ANY (
    SELECT (elem->>'menu_item_id')::UUID FROM jsonb_array_elements(p_items) elem
  )
  ORDER BY id
  FOR UPDATE;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::INT, 0);
    IF v_qty <= 0 OR v_qty > 999 THEN
      RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_menu FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::UUID AND shop_id = p_shop_id;
    IF NOT FOUND OR NOT v_menu.is_available THEN
      RAISE EXCEPTION 'item_unavailable:%', COALESCE(v_menu.name, 'unknown')
        USING ERRCODE = '42501';
    END IF;
    IF COALESCE(v_menu.is_display_only, false) THEN
      RAISE EXCEPTION 'item_display_only:%', v_menu.name USING ERRCODE = '42501';
    END IF;
    IF v_menu.stock_quantity IS NOT NULL AND v_menu.stock_quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_menu.name USING ERRCODE = '42501';
    END IF;

    v_variant_price := v_menu.price;
    IF v_item ? 'variant_id' AND (v_item->>'variant_id') IS NOT NULL THEN
      SELECT elem INTO v_variant FROM jsonb_array_elements(v_menu.variants) elem
        WHERE elem->>'id' = v_item->>'variant_id';
      IF v_variant IS NULL THEN
        RAISE EXCEPTION 'invalid_variant' USING ERRCODE = '22023';
      END IF;
      v_variant_price := COALESCE((v_variant->>'price')::NUMERIC, v_menu.price);
    END IF;

    SELECT COALESCE(SUM(GREATEST(0, LEAST(1000, (c->>'price')::NUMERIC))), 0)
      INTO v_customization_sum
      FROM jsonb_array_elements(COALESCE(v_item->'customizations', '[]'::jsonb)) c;

    v_unit_price    := v_variant_price + v_customization_sum;
    v_line_subtotal := v_unit_price * v_qty;
    v_subtotal      := v_subtotal + v_line_subtotal;

    IF p_order_type = 'takeaway' AND v_menu.takeaway_price IS NOT NULL THEN
      v_packing := v_packing + v_menu.takeaway_price * v_qty;
    END IF;

    IF NOT COALESCE(v_menu.is_instant, false) THEN
      v_all_instant := false;
    END IF;

    IF v_menu.stock_quantity IS NOT NULL THEN
      UPDATE menu_items
         SET stock_quantity = stock_quantity - v_qty
       WHERE id = v_menu.id;
    END IF;
  END LOOP;

  IF NOT v_shop.is_open AND NOT v_all_instant THEN
    RAISE EXCEPTION 'shop_closed' USING ERRCODE = '42501';
  END IF;

  IF p_coupon_code IS NOT NULL AND p_coupon_code <> '' THEN
    SELECT * INTO v_coupon FROM coupons
    WHERE shop_id = p_shop_id AND code = p_coupon_code AND is_active = true
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_coupon' USING ERRCODE = '42501';
    END IF;
    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
      RAISE EXCEPTION 'coupon_expired' USING ERRCODE = '42501';
    END IF;
    IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
      RAISE EXCEPTION 'coupon_exhausted' USING ERRCODE = '42501';
    END IF;
    IF v_subtotal < COALESCE(v_coupon.min_order_amount, 0) THEN
      RAISE EXCEPTION 'coupon_min_order' USING ERRCODE = '42501';
    END IF;
    v_discount := CASE
      WHEN v_coupon.type = 'percentage'
        THEN round((v_subtotal + v_packing) * v_coupon.value / 100.0, 2)
      ELSE LEAST(v_coupon.value, v_subtotal + v_packing)
    END;
  END IF;

  v_tax   := round((v_subtotal + v_packing) * v_shop.tax_percent / 100.0, 2);
  v_total := GREATEST(0, v_subtotal + v_packing + v_tax - v_discount);
  v_status := CASE WHEN v_all_instant THEN 'ready' ELSE 'pending' END;

  v_order_number := to_char(now(), 'YYMMDDHH24MISS') ||
                    lpad(floor(random() * 1000)::TEXT, 3, '0');

  INSERT INTO orders(
    shop_id, order_number, customer_name, customer_phone, status,
    payment_method, payment_status, order_type, is_anonymous, order_source,
    coupon_code, discount_amount, subtotal, tax_amount, packing_charge, total,
    notes, customer_profile_id
  ) VALUES (
    p_shop_id, v_order_number, v_customer_name, v_customer_phone, v_status,
    p_payment_method, 'pending', p_order_type, COALESCE(p_is_anonymous, false), 'qr',
    NULLIF(p_coupon_code, ''), v_discount, v_subtotal, v_tax, v_packing, v_total,
    NULLIF(trim(p_notes), ''),
    CASE WHEN v_session.id IS NOT NULL THEN v_profile.id ELSE NULL END
  )
  RETURNING id, tracking_token INTO v_order_id, v_tracking_token;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_menu FROM menu_items WHERE id = (v_item->>'menu_item_id')::UUID;

    v_variant_price := v_menu.price;
    IF v_item ? 'variant_id' AND (v_item->>'variant_id') IS NOT NULL THEN
      SELECT elem INTO v_variant FROM jsonb_array_elements(v_menu.variants) elem
        WHERE elem->>'id' = v_item->>'variant_id';
      v_variant_price := COALESCE((v_variant->>'price')::NUMERIC, v_menu.price);
    END IF;
    SELECT COALESCE(SUM(GREATEST(0, LEAST(1000, (c->>'price')::NUMERIC))), 0)
      INTO v_customization_sum
      FROM jsonb_array_elements(COALESCE(v_item->'customizations', '[]'::jsonb)) c;
    v_unit_price := v_variant_price + v_customization_sum;
    v_qty        := (v_item->>'quantity')::INT;

    INSERT INTO order_items(order_id, menu_item_id, name, price, quantity, subtotal, customizations)
    VALUES (
      v_order_id, v_menu.id, v_menu.name, v_unit_price, v_qty,
      v_unit_price * v_qty,
      COALESCE(v_item->'customizations', '[]'::jsonb)
    );

    IF v_menu.stock_quantity IS NOT NULL THEN
      INSERT INTO stock_logs(shop_id, menu_item_id, item_name, delta, reason, note)
      VALUES (p_shop_id, v_menu.id, v_menu.name, -v_qty, 'order', v_order_number);
    END IF;
  END LOOP;

  IF v_coupon.id IS NOT NULL THEN
    UPDATE coupons SET used_count = used_count + 1 WHERE id = v_coupon.id;

    IF v_session.id IS NOT NULL THEN
      UPDATE profile_coupons
         SET used_at = now(), used_order_id = v_order_id
       WHERE profile_id = v_session.profile_id
         AND coupon_id = v_coupon.id
         AND used_at IS NULL;
    END IF;
  END IF;

  RETURN json_build_object(
    'order_id',       v_order_id,
    'order_number',   v_order_number,
    'tracking_token', v_tracking_token,
    'status',         v_status,
    'total',          v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION place_customer_order(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
