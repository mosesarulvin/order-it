-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 018: Platform hardening
--
-- Addresses:
--   • IDOR on customer_profiles / profile_coupons via UUID-as-bearer pattern
--   • Anonymous read exposure on orders / order_items
--   • Cross-tenant tampering on shop-assets storage bucket
--   • Non-atomic order placement (checkout + walk-in)
--   • Unauthenticated password RPC brute-force
--   • Reflected tracking_token in order responses
--   • Weak DB-side validation of profile fields
--
-- Applied via Supabase SQL Editor. Idempotent where practical; some drops are
-- required to replace policies. Existing data is preserved.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. Rate limiting infrastructure ────────────────────────────────────────
-- Simple sliding-window bucket. Keyed by (scope, identifier) e.g.
-- ('login', phone) or ('profile_create', ip). Not IP-precise on the anon
-- surface, but blocks trivial single-identifier brute force.

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  scope         TEXT        NOT NULL,
  identifier    TEXT        NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts      INTEGER     NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  PRIMARY KEY (scope, identifier)
);

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only accessible via SECURITY DEFINER functions below.

CREATE OR REPLACE FUNCTION _rate_limit_check(
  p_scope       TEXT,
  p_identifier  TEXT,
  p_max_attempts INT,
  p_window      INTERVAL,
  p_lockout     INTERVAL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row auth_rate_limits%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM auth_rate_limits
  WHERE scope = p_scope AND identifier = p_identifier
  FOR UPDATE;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '42501';
  END IF;

  IF NOT FOUND OR now() - v_row.window_start > p_window THEN
    INSERT INTO auth_rate_limits(scope, identifier, window_start, attempts, locked_until)
    VALUES (p_scope, p_identifier, now(), 1, NULL)
    ON CONFLICT (scope, identifier) DO UPDATE
      SET window_start = now(), attempts = 1, locked_until = NULL;
    RETURN;
  END IF;

  IF v_row.attempts + 1 >= p_max_attempts THEN
    UPDATE auth_rate_limits
      SET attempts     = v_row.attempts + 1,
          locked_until = now() + p_lockout
      WHERE scope = p_scope AND identifier = p_identifier;
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '42501';
  END IF;

  UPDATE auth_rate_limits
    SET attempts = v_row.attempts + 1
    WHERE scope = p_scope AND identifier = p_identifier;
END;
$$;

CREATE OR REPLACE FUNCTION _rate_limit_reset(p_scope TEXT, p_identifier TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM auth_rate_limits WHERE scope = p_scope AND identifier = p_identifier;
$$;

REVOKE ALL ON FUNCTION _rate_limit_check(TEXT, TEXT, INT, INTERVAL, INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION _rate_limit_reset(TEXT, TEXT) FROM PUBLIC;

-- ─── 2. Customer session tokens ────────────────────────────────────────────
-- Opaque, server-issued, hash-at-rest. Replaces the "UUID-as-bearer" pattern
-- where a raw customer_profile_id was stored client-side and used as an
-- authorization key.

CREATE TABLE IF NOT EXISTS customer_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID        NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  shop_id       UUID        NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  token_hash    TEXT        NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_sessions_profile_idx ON customer_sessions(profile_id);
CREATE INDEX IF NOT EXISTS customer_sessions_expires_idx ON customer_sessions(expires_at);

ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;
-- Access only through SECURITY DEFINER functions.

CREATE OR REPLACE FUNCTION _hash_token(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION _hash_token(TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION _issue_customer_session(
  p_profile_id UUID,
  p_shop_id    UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token TEXT := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  INSERT INTO customer_sessions(profile_id, shop_id, token_hash, expires_at)
  VALUES (p_profile_id, p_shop_id, _hash_token(v_token), now() + INTERVAL '30 days');
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION _issue_customer_session(UUID, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION _resolve_customer_session(p_token TEXT)
RETURNS customer_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session customer_sessions%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN NULL;
  END IF;

  UPDATE customer_sessions
     SET last_used_at = now()
   WHERE token_hash = _hash_token(p_token)
     AND expires_at > now()
   RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION _resolve_customer_session(TEXT) FROM PUBLIC;

-- ─── 3. Locked-down customer_profiles / profile_coupons RLS ─────────────────

DROP POLICY IF EXISTS "public_read_own_profile"        ON customer_profiles;
DROP POLICY IF EXISTS "public_read_own_profile_coupons" ON profile_coupons;
DROP POLICY IF EXISTS "public_use_own_profile_coupon"   ON profile_coupons;

-- customer_profiles: only owners can read/update directly; customers use RPCs.
-- Anon INSERT is still allowed (guarded by validation constraints in mig 016).

-- profile_coupons: no direct anonymous access. All customer reads/mutations
-- flow through session-authenticated RPCs.

-- ─── 4. Password verification RPC (rate-limited, session-issuing) ───────────

-- Replaces the raw verify_customer_password result with a session token so
-- the client never learns the profile_id in a bearer-usable form.

CREATE OR REPLACE FUNCTION sign_in_customer(
  p_shop_id  UUID,
  p_phone    TEXT,
  p_password TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_profile customer_profiles%ROWTYPE;
  v_token   TEXT;
BEGIN
  PERFORM _rate_limit_check(
    'customer_login',
    p_shop_id::TEXT || ':' || p_phone,
    8,
    INTERVAL '5 minutes',
    INTERVAL '15 minutes'
  );

  SELECT * INTO v_profile
  FROM customer_profiles
  WHERE shop_id = p_shop_id AND phone = p_phone;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_credentials' USING ERRCODE = '42501';
  END IF;

  IF v_profile.password IS NULL OR v_profile.password NOT LIKE '$2%' THEN
    RAISE EXCEPTION 'invalid_credentials' USING ERRCODE = '42501';
  END IF;

  IF v_profile.password <> extensions.crypt(p_password, v_profile.password) THEN
    RAISE EXCEPTION 'invalid_credentials' USING ERRCODE = '42501';
  END IF;

  PERFORM _rate_limit_reset('customer_login', p_shop_id::TEXT || ':' || p_phone);

  v_token := _issue_customer_session(v_profile.id, v_profile.shop_id);

  RETURN json_build_object(
    'session_token', v_token,
    'name',          v_profile.name,
    'phone',         v_profile.phone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sign_in_customer(UUID, TEXT, TEXT) TO anon, authenticated;

-- ─── 5. Customer profile creation RPC (rate-limited, returns session) ──────

CREATE OR REPLACE FUNCTION create_customer_profile(
  p_shop_id  UUID,
  p_name     TEXT,
  p_phone    TEXT,
  p_email    TEXT,
  p_birthday DATE,
  p_password TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_profile_id UUID;
  v_token      TEXT;
  v_welcome    coupons%ROWTYPE;
  v_label      TEXT;
BEGIN
  PERFORM _rate_limit_check(
    'customer_signup',
    p_shop_id::TEXT || ':' || p_phone,
    5,
    INTERVAL '1 hour',
    INTERVAL '1 hour'
  );

  IF p_name  IS NULL OR length(trim(p_name))  < 1 OR length(trim(p_name))  > 100 THEN
    RAISE EXCEPTION 'invalid_name'  USING ERRCODE = '22023';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF p_email IS NULL OR p_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'weak_password' USING ERRCODE = '22023';
  END IF;

  INSERT INTO customer_profiles(shop_id, name, phone, email, birthday, password)
  VALUES (
    p_shop_id,
    trim(p_name),
    p_phone,
    lower(trim(p_email)),
    p_birthday,
    extensions.crypt(p_password, extensions.gen_salt('bf'))
  )
  RETURNING id INTO v_profile_id;

  -- Assign welcome coupon if configured
  SELECT * INTO v_welcome
  FROM coupons
  WHERE shop_id = p_shop_id AND coupon_type = 'new_user' AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_label := CASE
      WHEN v_welcome.type = 'percentage' THEN 'Welcome ' || v_welcome.value || '% off'
      ELSE 'Welcome ₹' || v_welcome.value || ' off'
    END;
    INSERT INTO profile_coupons(profile_id, shop_id, coupon_id, coupon_code, label)
    VALUES (v_profile_id, p_shop_id, v_welcome.id, v_welcome.code, v_label);
  END IF;

  v_token := _issue_customer_session(v_profile_id, p_shop_id);

  RETURN json_build_object(
    'session_token', v_token,
    'name',          trim(p_name),
    'phone',         p_phone
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'profile_exists' USING ERRCODE = '23505';
END;
$$;

GRANT EXECUTE ON FUNCTION create_customer_profile(UUID, TEXT, TEXT, TEXT, DATE, TEXT) TO anon, authenticated;

-- ─── 6. Session-authenticated reads ────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_customer_profile(p_session_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session customer_sessions%ROWTYPE;
  v_result  JSON;
BEGIN
  v_session := _resolve_customer_session(p_session_token);
  IF v_session.id IS NULL THEN RETURN NULL; END IF;

  SELECT json_build_object(
    'id',       p.id,
    'shop_id',  p.shop_id,
    'name',     p.name,
    'phone',    p.phone,
    'email',    p.email,
    'birthday', p.birthday
  ) INTO v_result
  FROM customer_profiles p
  WHERE p.id = v_session.profile_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_profile(TEXT) TO anon, authenticated;

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
      'id',          pc.id,
      'coupon_code', pc.coupon_code,
      'label',       pc.label,
      'assigned_at', pc.assigned_at,
      'used_at',     pc.used_at
    ) ORDER BY pc.assigned_at DESC)
    FROM profile_coupons pc
    WHERE pc.profile_id = v_session.profile_id
  ), '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_coupons(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_customer_orders(p_session_token TEXT, p_limit INT DEFAULT 20)
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

CREATE OR REPLACE FUNCTION sign_out_customer(p_session_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_token IS NULL THEN RETURN; END IF;
  DELETE FROM customer_sessions WHERE token_hash = _hash_token(p_session_token);
END;
$$;

GRANT EXECUTE ON FUNCTION sign_out_customer(TEXT) TO anon, authenticated;

-- ─── 7. Orders / order_items: remove anonymous read + write ────────────────

DROP POLICY IF EXISTS "Anyone can read order by id"    ON orders;
DROP POLICY IF EXISTS "Anyone can create an order"     ON orders;
DROP POLICY IF EXISTS "Anyone can read order items"    ON order_items;
DROP POLICY IF EXISTS "Anyone can insert order items"  ON order_items;

-- Owners retain full access (via existing policies). All customer paths now
-- flow through get_order_by_token (read) and place_customer_order (write).

-- ─── 8. get_order_by_token: strip tracking_token from response ─────────────

CREATE OR REPLACE FUNCTION get_order_by_token(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_items JSON;
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
    'id',                  v_order.id,
    'order_number',        v_order.order_number,
    'status',              v_order.status,
    'payment_method',      v_order.payment_method,
    'payment_status',      v_order.payment_status,
    'order_type',          v_order.order_type,
    'subtotal',            v_order.subtotal,
    'tax_amount',          v_order.tax_amount,
    'packing_charge',      v_order.packing_charge,
    'discount_amount',     v_order.discount_amount,
    'total',               v_order.total,
    'notes',               v_order.notes,
    'coupon_code',         v_order.coupon_code,
    'cancellation_reason', v_order.cancellation_reason,
    'created_at',          v_order.created_at,
    'shop_id',             v_order.shop_id,
    'items',               COALESCE(v_items, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_by_token(UUID) TO anon, authenticated;

-- ─── 9. Transactional order placement (customer) ───────────────────────────
--
-- Items payload shape (jsonb):
-- [
--   {
--     "menu_item_id":  "uuid",
--     "quantity":      2,
--     "variant_id":    "uuid" | null,
--     "customizations":[ { "group": "...", "choice": "...", "price": 0 }, ... ]
--   },
--   ...
-- ]
--
-- Server re-derives all monetary values from menu_items (defence against
-- client-side price tampering) and clamps customization prices to >= 0.
-- Runs inside a single implicit transaction; menu_items rows are locked
-- FOR UPDATE to prevent overselling under concurrency.

CREATE OR REPLACE FUNCTION place_customer_order(
  p_shop_id        UUID,
  p_session_token  TEXT,       -- nullable → anonymous order
  p_items          JSONB,
  p_order_type     TEXT,       -- 'dine_in' | 'takeaway'
  p_payment_method TEXT,       -- 'cash' | 'upi'
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
  IF v_shop.status <> 'active' AND v_shop.status <> 'trial' THEN
    RAISE EXCEPTION 'shop_unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_payment_method = 'upi'  AND NOT v_shop.accepts_upi  THEN
    RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_payment_method = 'cash' AND NOT v_shop.accepts_cash THEN
    RAISE EXCEPTION 'payment_method_unavailable' USING ERRCODE = '42501';
  END IF;

  -- Resolve customer identity via session token, never trusting a raw profile id.
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

  -- Lock all involved menu_items rows in a single statement to avoid deadlocks.
  PERFORM 1 FROM menu_items
  WHERE id = ANY (
    SELECT (elem->>'menu_item_id')::UUID FROM jsonb_array_elements(p_items) elem
  )
  ORDER BY id
  FOR UPDATE;

  -- Iterate & validate each line. Compute canonical prices from DB.
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
    IF v_menu.stock_quantity IS NOT NULL AND v_menu.stock_quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_menu.name USING ERRCODE = '42501';
    END IF;

    -- Variant price (must exist in menu_items.variants)
    v_variant_price := v_menu.price;
    IF v_item ? 'variant_id' AND (v_item->>'variant_id') IS NOT NULL THEN
      SELECT elem INTO v_variant FROM jsonb_array_elements(v_menu.variants) elem
        WHERE elem->>'id' = v_item->>'variant_id';
      IF v_variant IS NULL THEN
        RAISE EXCEPTION 'invalid_variant' USING ERRCODE = '22023';
      END IF;
      v_variant_price := COALESCE((v_variant->>'price')::NUMERIC, v_menu.price);
    END IF;

    -- Customization sum: clamp to >= 0 and cap absurd values.
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

    -- Decrement stock
    IF v_menu.stock_quantity IS NOT NULL THEN
      UPDATE menu_items
         SET stock_quantity = stock_quantity - v_qty
       WHERE id = v_menu.id;
    END IF;
  END LOOP;

  -- Shop closed? Only allow if all items are instant.
  IF NOT v_shop.is_open AND NOT v_all_instant THEN
    RAISE EXCEPTION 'shop_closed' USING ERRCODE = '42501';
  END IF;

  -- Coupon validation
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

  -- Insert order_items and stock_logs in one pass per line.
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
         AND coupon_code = v_coupon.code
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

GRANT EXECUTE ON FUNCTION place_customer_order(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  TO anon, authenticated;

-- ─── 10. Transactional walk-in order placement (staff) ─────────────────────

CREATE OR REPLACE FUNCTION place_walkin_order(
  p_shop_id        UUID,
  p_items          JSONB,
  p_customer_name  TEXT,
  p_order_type     TEXT,
  p_payment_method TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          UUID := auth.uid();
  v_shop            shops%ROWTYPE;
  v_item            JSONB;
  v_menu            menu_items%ROWTYPE;
  v_qty             INTEGER;
  v_subtotal        NUMERIC := 0;
  v_packing         NUMERIC := 0;
  v_tax             NUMERIC := 0;
  v_total           NUMERIC;
  v_all_instant     BOOLEAN := true;
  v_status          TEXT;
  v_order_number    TEXT;
  v_order_id        UUID;
  v_tracking_token  UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM shops       WHERE id = p_shop_id AND owner_id = v_caller
    UNION ALL
    SELECT 1 FROM shop_staff  WHERE shop_id = p_shop_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart' USING ERRCODE = '22023';
  END IF;
  IF p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'invalid_order_type' USING ERRCODE = '22023';
  END IF;
  IF p_payment_method NOT IN ('cash', 'upi') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_shop FROM shops WHERE id = p_shop_id;

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
    IF v_menu.stock_quantity IS NOT NULL AND v_menu.stock_quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_menu.name USING ERRCODE = '42501';
    END IF;

    v_subtotal := v_subtotal + v_menu.price * v_qty;
    IF p_order_type = 'takeaway' AND v_menu.takeaway_price IS NOT NULL THEN
      v_packing := v_packing + v_menu.takeaway_price * v_qty;
    END IF;
    IF NOT COALESCE(v_menu.is_instant, false) THEN
      v_all_instant := false;
    END IF;

    IF v_menu.stock_quantity IS NOT NULL THEN
      UPDATE menu_items SET stock_quantity = stock_quantity - v_qty WHERE id = v_menu.id;
    END IF;
  END LOOP;

  v_tax   := round((v_subtotal + v_packing) * v_shop.tax_percent / 100.0, 2);
  v_total := v_subtotal + v_packing + v_tax;
  v_status := CASE WHEN v_all_instant THEN 'ready' ELSE 'pending' END;
  v_order_number := to_char(now(), 'YYMMDDHH24MISS') ||
                    lpad(floor(random() * 1000)::TEXT, 3, '0');

  INSERT INTO orders(
    shop_id, order_number, customer_name, customer_phone, status,
    payment_method, payment_status, order_type, is_anonymous, order_source,
    subtotal, tax_amount, packing_charge, total, discount_amount
  ) VALUES (
    p_shop_id, v_order_number,
    COALESCE(NULLIF(trim(p_customer_name), ''), 'Walk-in Guest'),
    'Walk-in', v_status, p_payment_method, 'pending', p_order_type, false, 'walkin',
    v_subtotal, v_tax, v_packing, v_total, 0
  )
  RETURNING id, tracking_token INTO v_order_id, v_tracking_token;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_menu FROM menu_items WHERE id = (v_item->>'menu_item_id')::UUID;
    v_qty := (v_item->>'quantity')::INT;

    INSERT INTO order_items(order_id, menu_item_id, name, price, quantity, subtotal, customizations)
    VALUES (v_order_id, v_menu.id, v_menu.name, v_menu.price, v_qty, v_menu.price * v_qty, '[]'::jsonb);

    IF v_menu.stock_quantity IS NOT NULL THEN
      INSERT INTO stock_logs(shop_id, menu_item_id, item_name, delta, reason, note)
      VALUES (p_shop_id, v_menu.id, v_menu.name, -v_qty, 'order', v_order_number);
    END IF;
  END LOOP;

  RETURN json_build_object(
    'order_id',       v_order_id,
    'order_number',   v_order_number,
    'tracking_token', v_tracking_token,
    'status',         v_status,
    'total',          v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION place_walkin_order(UUID, JSONB, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 11. Shop coupon lookup (safe surface for anonymous checkout preview) ──

CREATE OR REPLACE FUNCTION preview_coupon(p_shop_id UUID, p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon coupons%ROWTYPE;
BEGIN
  SELECT * INTO v_coupon FROM coupons
  WHERE shop_id = p_shop_id AND code = p_code AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN RETURN NULL; END IF;
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN RETURN NULL; END IF;

  RETURN json_build_object(
    'code',             v_coupon.code,
    'type',             v_coupon.type,
    'value',            v_coupon.value,
    'min_order_amount', v_coupon.min_order_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION preview_coupon(UUID, TEXT) TO anon, authenticated;

-- ─── 12. Storage bucket path-scoped policies ───────────────────────────────
-- All shop-assets writes must live under a top-level folder equal to the
-- caller's shop_id (as text). This prevents cross-tenant overwrite/delete.

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
DROP POLICY IF EXISTS "shop_assets_owner_insert"       ON storage.objects;
DROP POLICY IF EXISTS "shop_assets_owner_update"       ON storage.objects;
DROP POLICY IF EXISTS "shop_assets_owner_delete"       ON storage.objects;

CREATE POLICY "shop_assets_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'shop-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "shop_assets_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'shop-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM shops WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'shop-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "shop_assets_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'shop-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM shops WHERE owner_id = auth.uid()
    )
  );

-- Public SELECT policy from migration 008 remains as-is (bucket is public).

-- ─── 13. Retire the legacy password RPCs ──────────────────────────────────
--
-- We keep them defined for backward compatibility but revoke anon execute
-- so the frontend must migrate to sign_in_customer / create_customer_profile.

REVOKE EXECUTE ON FUNCTION verify_customer_password(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION hash_customer_password(TEXT)               FROM anon;

-- ─── 14. Housekeeping ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS orders_shop_created_idx
  ON orders(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_profile_created_idx
  ON orders(customer_profile_id, created_at DESC)
  WHERE customer_profile_id IS NOT NULL;

-- Nightly cleanup of expired sessions (call from a cron/scheduled job).
CREATE OR REPLACE FUNCTION purge_expired_customer_sessions()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deleted AS (
    DELETE FROM customer_sessions WHERE expires_at < now() RETURNING 1
  )
  SELECT COUNT(*)::INT FROM deleted;
$$;

REVOKE ALL ON FUNCTION purge_expired_customer_sessions() FROM PUBLIC;
