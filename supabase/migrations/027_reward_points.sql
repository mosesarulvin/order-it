-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 027: Reward Points System
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Create Tables ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_programs (
  shop_id UUID PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  earn_rate NUMERIC NOT NULL DEFAULT 1.0, -- Points earned per ₹1 spent
  redeem_rate NUMERIC NOT NULL DEFAULT 10.0, -- Points required for ₹1 discount (e.g. 100 pts = 10 -> 10 pts per 1)
  min_redeem_points INTEGER NOT NULL DEFAULT 100,
  points_expiry_months INTEGER, -- NULL means no expiry
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reward_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners_manage_reward_programs" ON public.reward_programs
  FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));
CREATE POLICY "public_read_reward_programs" ON public.reward_programs
  FOR SELECT USING (true);


CREATE TABLE IF NOT EXISTS public.reward_points (
  profile_id UUID NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_redeemed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, shop_id)
);

ALTER TABLE public.reward_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners_read_reward_points" ON public.reward_points
  FOR SELECT USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));
CREATE POLICY "public_read_own_reward_points" ON public.reward_points
  FOR SELECT USING (auth.uid() IS NULL); -- Accessed via RPCs anyway


CREATE TABLE IF NOT EXISTS public.points_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  delta INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'manual', 'expire')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners_read_points_transactions" ON public.points_transactions
  FOR SELECT USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));


-- ── 2. Add columns to orders ─────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS points_earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS points_redeemed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS points_discount NUMERIC NOT NULL DEFAULT 0;

-- Drop existing place_customer_order so we can change the signature
DROP FUNCTION IF EXISTS public.place_customer_order(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION place_customer_order(
  p_shop_id        UUID,
  p_session_token  TEXT,
  p_items          JSONB,
  p_order_type     TEXT,
  p_payment_method TEXT,
  p_notes          TEXT,
  p_coupon_code    TEXT,
  p_is_anonymous   BOOLEAN,
  p_points_to_redeem INTEGER DEFAULT 0
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
  v_orig            NUMERIC;
  v_subtotal        NUMERIC := 0;
  v_packing         NUMERIC := 0;
  v_tax             NUMERIC := 0;
  v_discount        NUMERIC := 0;
  v_coupon_discount NUMERIC := 0;
  v_points_discount NUMERIC := 0;
  v_total           NUMERIC;
  v_all_instant     BOOLEAN := true;
  v_status          TEXT;
  v_coupon          coupons%ROWTYPE;
  v_order_number    TEXT;
  v_order_id        UUID;
  v_tracking_token  UUID;
  v_customer_name   TEXT;
  v_customer_phone  TEXT;
  v_reward_prog     reward_programs%ROWTYPE;
  v_points_bal      INTEGER := 0;
  v_points_earned   INTEGER := 0;
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
  IF p_points_to_redeem < 0 THEN
    RAISE EXCEPTION 'invalid_points' USING ERRCODE = '22023';
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
    
    SELECT balance INTO v_points_bal FROM reward_points WHERE profile_id = v_profile.id AND shop_id = p_shop_id;
    v_points_bal := COALESCE(v_points_bal, 0);
  ELSIF p_is_anonymous THEN
    v_customer_name  := 'Anonymous';
    v_customer_phone := 'anonymous';
    IF p_points_to_redeem > 0 THEN
      RAISE EXCEPTION 'auth_required_for_points' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reward_prog FROM reward_programs WHERE shop_id = p_shop_id;

  IF p_points_to_redeem > 0 THEN
    IF NOT FOUND OR NOT v_reward_prog.is_enabled THEN
      RAISE EXCEPTION 'rewards_disabled' USING ERRCODE = '42501';
    END IF;
    IF p_points_to_redeem < v_reward_prog.min_redeem_points THEN
      RAISE EXCEPTION 'minimum_points_not_met' USING ERRCODE = '42501';
    END IF;
    IF p_points_to_redeem > v_points_bal THEN
      RAISE EXCEPTION 'insufficient_points' USING ERRCODE = '42501';
    END IF;
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
    
    -- Apply promotional discount
    v_variant_price := calculate_discounted_price(p_shop_id, v_menu.id, v_menu.category_id, v_variant_price);

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
    v_coupon_discount := CASE
      WHEN v_coupon.type = 'percentage'
        THEN round((v_subtotal + v_packing) * v_coupon.value / 100.0, 2)
      ELSE LEAST(v_coupon.value, v_subtotal + v_packing)
    END;
  END IF;

  IF p_points_to_redeem > 0 THEN
    v_points_discount := round(p_points_to_redeem / v_reward_prog.redeem_rate, 2);
    -- Ensure we don't discount more than the order total (after coupon)
    v_points_discount := LEAST(v_points_discount, GREATEST(0, v_subtotal + v_packing - v_coupon_discount));
  END IF;

  v_discount := v_coupon_discount + v_points_discount;

  v_tax   := round((v_subtotal + v_packing - v_discount) * v_shop.tax_percent / 100.0, 2);
  v_tax   := GREATEST(0, v_tax);
  
  v_total := GREATEST(0, v_subtotal + v_packing + v_tax - v_discount);
  v_status := CASE WHEN v_all_instant THEN 'ready' ELSE 'pending' END;

  v_order_number := to_char(now(), 'YYMMDDHH24MISS') ||
                    lpad(floor(random() * 1000)::TEXT, 3, '0');

  -- Calculate points earned (on subtotal before tax, after discounts)
  IF v_reward_prog.is_enabled AND v_session.id IS NOT NULL THEN
    v_points_earned := floor(GREATEST(0, v_subtotal + v_packing - v_discount) * v_reward_prog.earn_rate);
  END IF;

  INSERT INTO orders(
    shop_id, order_number, customer_name, customer_phone, status,
    payment_method, payment_status, order_type, is_anonymous, order_source,
    coupon_code, discount_amount, subtotal, tax_amount, packing_charge, total,
    notes, customer_profile_id, points_earned, points_redeemed, points_discount
  ) VALUES (
    p_shop_id, v_order_number, v_customer_name, v_customer_phone, v_status,
    p_payment_method, 'pending', p_order_type, COALESCE(p_is_anonymous, false), 'qr',
    NULLIF(p_coupon_code, ''), v_discount, v_subtotal, v_tax, v_packing, v_total,
    NULLIF(trim(p_notes), ''),
    CASE WHEN v_session.id IS NOT NULL THEN v_profile.id ELSE NULL END,
    v_points_earned, p_points_to_redeem, v_points_discount
  )
  RETURNING id, tracking_token INTO v_order_id, v_tracking_token;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_menu FROM menu_items WHERE id = (v_item->>'menu_item_id')::UUID;

    v_orig := v_menu.price;
    IF v_item ? 'variant_id' AND (v_item->>'variant_id') IS NOT NULL THEN
      SELECT elem INTO v_variant FROM jsonb_array_elements(v_menu.variants) elem
        WHERE elem->>'id' = v_item->>'variant_id';
      v_orig := COALESCE((v_variant->>'price')::NUMERIC, v_menu.price);
    END IF;
    
    -- Apply promotional discount
    v_variant_price := calculate_discounted_price(p_shop_id, v_menu.id, v_menu.category_id, v_orig);

    SELECT COALESCE(SUM(GREATEST(0, LEAST(1000, (c->>'price')::NUMERIC))), 0)
      INTO v_customization_sum
      FROM jsonb_array_elements(COALESCE(v_item->'customizations', '[]'::jsonb)) c;
    v_unit_price := v_variant_price + v_customization_sum;
    v_qty        := (v_item->>'quantity')::INT;

    INSERT INTO order_items(order_id, menu_item_id, name, price, original_price, quantity, subtotal, customizations)
    VALUES (
      v_order_id, v_menu.id, v_menu.name, v_unit_price, v_orig + v_customization_sum, v_qty,
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

  -- Apply Points
  IF v_session.id IS NOT NULL AND (p_points_to_redeem > 0 OR v_points_earned > 0) THEN
    INSERT INTO reward_points (profile_id, shop_id, balance, total_earned, total_redeemed)
    VALUES (v_profile.id, p_shop_id, v_points_earned - p_points_to_redeem, v_points_earned, p_points_to_redeem)
    ON CONFLICT (profile_id, shop_id) DO UPDATE SET
      balance = reward_points.balance + EXCLUDED.balance,
      total_earned = reward_points.total_earned + EXCLUDED.total_earned,
      total_redeemed = reward_points.total_redeemed + EXCLUDED.total_redeemed,
      updated_at = now();

    IF p_points_to_redeem > 0 THEN
      INSERT INTO points_transactions (profile_id, shop_id, order_id, delta, type, note)
      VALUES (v_profile.id, p_shop_id, v_order_id, -p_points_to_redeem, 'redeem', 'Redeemed for order ' || v_order_number);
    END IF;

    IF v_points_earned > 0 THEN
      INSERT INTO points_transactions (profile_id, shop_id, order_id, delta, type, note)
      VALUES (v_profile.id, p_shop_id, v_order_id, v_points_earned, 'earn', 'Earned from order ' || v_order_number);
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
GRANT EXECUTE ON FUNCTION place_customer_order(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER) TO anon, authenticated;

-- ── 3. Additional RPCs ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_customer_rewards(p_session_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session customer_sessions%ROWTYPE;
  v_prog    reward_programs%ROWTYPE;
  v_pts     reward_points%ROWTYPE;
  v_txs     JSON;
BEGIN
  v_session := _resolve_customer_session(p_session_token);
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'invalid_session' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prog FROM reward_programs WHERE shop_id = v_session.shop_id;
  SELECT * INTO v_pts FROM reward_points WHERE profile_id = v_session.profile_id AND shop_id = v_session.shop_id;

  SELECT COALESCE(json_agg(row_to_json(t)), '[]') INTO v_txs
  FROM (
    SELECT delta, type, note, created_at, order_id
    FROM points_transactions
    WHERE profile_id = v_session.profile_id AND shop_id = v_session.shop_id
    ORDER BY created_at DESC
    LIMIT 50
  ) t;

  RETURN json_build_object(
    'program', row_to_json(v_prog),
    'balance', COALESCE(v_pts.balance, 0),
    'total_earned', COALESCE(v_pts.total_earned, 0),
    'transactions', v_txs
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_customer_rewards(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION admin_adjust_points(
  p_profile_id UUID,
  p_shop_id UUID,
  p_delta INTEGER,
  p_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM shops WHERE id = p_shop_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO reward_points (profile_id, shop_id, balance, total_earned)
  VALUES (p_profile_id, p_shop_id, p_delta, GREATEST(0, p_delta))
  ON CONFLICT (profile_id, shop_id) DO UPDATE SET
    balance = reward_points.balance + p_delta,
    total_earned = reward_points.total_earned + GREATEST(0, p_delta),
    updated_at = now();

  INSERT INTO points_transactions (profile_id, shop_id, delta, type, note)
  VALUES (p_profile_id, p_shop_id, p_delta, 'manual', p_note);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_adjust_points(UUID, UUID, INTEGER, TEXT) TO authenticated;
