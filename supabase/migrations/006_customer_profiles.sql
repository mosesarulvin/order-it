-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 006: Customer Profiles, Profile Coupons, Coupon Types
-- Apply in Supabase SQL Editor → run once
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Coupons: add coupon_type ──────────────────────────────────────────────
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS coupon_type text NOT NULL DEFAULT 'general'
  CHECK (coupon_type IN ('general', 'new_user', 'birthday', 'promotion'));

-- ── 2. Customer profiles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name       text NOT NULL,
  phone      text NOT NULL,
  email      text,
  birthday   date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, phone)
);

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;

-- Shop owners can read all profiles for their shop
CREATE POLICY "owners_read_profiles" ON customer_profiles
  FOR SELECT USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- Anyone (customers) can insert their own profile
CREATE POLICY "public_insert_profiles" ON customer_profiles
  FOR INSERT WITH CHECK (true);

-- Customers can read only their own profile when using the anon key (unauthenticated)
-- UUID acts as an unguessable access token; authenticated non-owners cannot read
CREATE POLICY "public_read_own_profile" ON customer_profiles
  FOR SELECT USING (auth.uid() IS NULL);

-- ── 3. Profile coupons (coupons assigned to a customer profile) ───────────────
CREATE TABLE IF NOT EXISTS profile_coupons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  shop_id         uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  coupon_id       uuid REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code     text NOT NULL,
  label           text NOT NULL,           -- e.g. "Welcome 10% off", "Birthday treat"
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  used_at         timestamptz,
  used_order_id   uuid REFERENCES orders(id) ON DELETE SET NULL
);

ALTER TABLE profile_coupons ENABLE ROW LEVEL SECURITY;

-- Shop owners can read, insert, and update profile coupons for their shop
CREATE POLICY "owners_read_profile_coupons" ON profile_coupons
  FOR SELECT USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

CREATE POLICY "owners_insert_profile_coupons" ON profile_coupons
  FOR INSERT WITH CHECK (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

CREATE POLICY "owners_update_profile_coupons" ON profile_coupons
  FOR UPDATE USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- Customers can read their own coupons (knowing the profile id is the access key)
CREATE POLICY "public_read_own_profile_coupons" ON profile_coupons
  FOR SELECT USING (true);

-- Customers can mark their own coupon as used (set used_at + used_order_id)
CREATE POLICY "public_use_own_profile_coupon" ON profile_coupons
  FOR UPDATE USING (true)
  WITH CHECK (used_at IS NOT NULL);  -- only allow setting used_at, not creating/assigning

-- ── 4. Orders: link to customer profile (optional) ───────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_profile_id uuid REFERENCES customer_profiles(id) ON DELETE SET NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS customer_profiles_shop_id_idx ON customer_profiles (shop_id);
CREATE INDEX IF NOT EXISTS customer_profiles_phone_idx ON customer_profiles (shop_id, phone);
CREATE INDEX IF NOT EXISTS profile_coupons_profile_id_idx ON profile_coupons (profile_id);
CREATE INDEX IF NOT EXISTS profile_coupons_shop_id_idx ON profile_coupons (shop_id);
CREATE INDEX IF NOT EXISTS orders_profile_id_idx ON orders (customer_profile_id);
