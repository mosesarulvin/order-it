-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 017: Multi-tenant platform — tenant lifecycle, secure tracking,
--                platform analytics, slug validation
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Tenant status and plan columns ────────────────────────────────────────
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS status         TEXT        NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'suspended', 'deleted')),
  ADD COLUMN IF NOT EXISTS plan           TEXT        NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  ADD COLUMN IF NOT EXISTS trial_ends_at  TIMESTAMPTZ          DEFAULT (NOW() + INTERVAL '14 days'),
  ADD COLUMN IF NOT EXISTS suspended_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspend_reason TEXT;

-- Existing shops are assumed active
UPDATE shops SET status = 'active' WHERE status = 'trial';

-- ── 2. Order tracking token (replaces global public SELECT for customer tracking) ──
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_idx ON orders(tracking_token);

-- ── 3. Secure get_order_by_token — customers call this instead of direct SELECT ──
CREATE OR REPLACE FUNCTION get_order_by_token(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  orders%ROWTYPE;
  v_items  JSON;
BEGIN
  SELECT * INTO v_order FROM orders WHERE tracking_token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT json_agg(json_build_object(
    'id',             i.id,
    'name',           i.name,
    'price',          i.price,
    'quantity',       i.quantity,
    'subtotal',       i.subtotal,
    'customizations', i.customizations
  )) INTO v_items FROM order_items i WHERE i.order_id = v_order.id;

  RETURN json_build_object(
    'id',               v_order.id,
    'order_number',     v_order.order_number,
    'status',           v_order.status,
    'payment_method',   v_order.payment_method,
    'payment_status',   v_order.payment_status,
    'order_type',       v_order.order_type,
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
    'packing_charge',   v_order.packing_charge,
    'discount_amount',  v_order.discount_amount,
    'total',            v_order.total,
    'notes',            v_order.notes,
    'coupon_code',      v_order.coupon_code,
    'created_at',       v_order.created_at,
    'shop_id',          v_order.shop_id,
    'tracking_token',   v_order.tracking_token,
    'items',            COALESCE(v_items, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_by_token(UUID) TO anon, authenticated;

-- ── 4. Secure get_dashboard_stats — add auth membership check ─────────────────
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_shop_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller             UUID := auth.uid();
  v_today              TIMESTAMPTZ := current_date;
  v_ninety_days_ago    TIMESTAMPTZ := current_date - INTERVAL '90 days';
  v_total_orders       BIGINT;
  v_pending_orders     BIGINT;
  v_today_revenue      NUMERIC;
  v_total_revenue      NUMERIC;
BEGIN
  -- Reject callers who are not shop members or super admin
  IF NOT EXISTS (
    SELECT 1 FROM shop_staff    WHERE shop_id = p_shop_id AND user_id = v_caller
    UNION ALL
    SELECT 1 FROM shops         WHERE id = p_shop_id AND owner_id = v_caller
    UNION ALL
    SELECT 1 FROM user_profiles WHERE id = v_caller AND is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_total_orders
  FROM orders WHERE shop_id = p_shop_id AND created_at >= v_ninety_days_ago;

  SELECT COUNT(*) INTO v_pending_orders
  FROM orders WHERE shop_id = p_shop_id AND created_at >= v_ninety_days_ago
    AND status IN ('pending', 'confirmed', 'preparing');

  SELECT COALESCE(SUM(total), 0) INTO v_today_revenue
  FROM orders WHERE shop_id = p_shop_id AND created_at >= v_today
    AND status != 'cancelled' AND payment_status = 'paid';

  SELECT COALESCE(SUM(total), 0) INTO v_total_revenue
  FROM orders WHERE shop_id = p_shop_id AND created_at >= v_ninety_days_ago
    AND status != 'cancelled' AND payment_status = 'paid';

  RETURN json_build_object(
    'total_orders',   v_total_orders,
    'pending_orders', v_pending_orders,
    'today_revenue',  v_today_revenue,
    'total_revenue',  v_total_revenue
  );
END;
$$;

-- ── 5. get_platform_stats — super admin only ──────────────────────────────────
CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_caller AND is_super_admin = true) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT json_build_object(
      'total_shops',      (SELECT COUNT(*) FROM shops WHERE status != 'deleted'),
      'active_shops',     (SELECT COUNT(*) FROM shops WHERE status = 'active'),
      'trial_shops',      (SELECT COUNT(*) FROM shops WHERE status = 'trial'),
      'suspended_shops',  (SELECT COUNT(*) FROM shops WHERE status = 'suspended'),
      'total_orders_today', (
        SELECT COUNT(*) FROM orders
        WHERE created_at >= current_date AND status != 'cancelled'
      ),
      'total_revenue_today', (
        SELECT COALESCE(SUM(total), 0) FROM orders
        WHERE created_at >= current_date AND status != 'cancelled' AND payment_status = 'paid'
      ),
      'total_orders_30d', (
        SELECT COUNT(*) FROM orders
        WHERE created_at >= current_date - INTERVAL '30 days' AND status != 'cancelled'
      ),
      'new_shops_30d', (
        SELECT COUNT(*) FROM shops
        WHERE created_at >= current_date - INTERVAL '30 days' AND status != 'deleted'
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_platform_stats() TO authenticated;

-- ── 6. suspend_shop / unsuspend_shop RPCs ────────────────────────────────────
CREATE OR REPLACE FUNCTION suspend_shop(p_shop_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE shops SET status = 'suspended', suspended_at = NOW(), suspend_reason = p_reason
  WHERE id = p_shop_id;
END;
$$;

CREATE OR REPLACE FUNCTION unsuspend_shop(p_shop_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE shops SET status = 'active', suspended_at = NULL, suspend_reason = NULL
  WHERE id = p_shop_id;
END;
$$;

GRANT EXECUTE ON FUNCTION suspend_shop(UUID, TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION unsuspend_shop(UUID)       TO authenticated;

-- ── 7. Slug availability check (used during registration) ────────────────────
CREATE OR REPLACE FUNCTION check_slug_available(p_slug TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM shops WHERE slug = p_slug);
$$;

GRANT EXECUTE ON FUNCTION check_slug_available(TEXT) TO anon, authenticated;
