-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 005: Reviews, Walk-in Orders, Feature Flags, Auto-schedule
-- Apply in Supabase SQL Editor → run once
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Orders: add order_source ──────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'qr'
  CHECK (order_source IN ('qr', 'walkin'));

-- ── 2. Shops: feature flags + auto-schedule ──────────────────────────────────
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS coupons_enabled  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reviews_enabled  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_schedule_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_open_time   text DEFAULT null,  -- HH:MM (24h)
  ADD COLUMN IF NOT EXISTS auto_close_time  text DEFAULT null;  -- HH:MM (24h)

-- ── 3. Reviews table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id      uuid REFERENCES orders(id) ON DELETE SET NULL,
  order_number  text,
  customer_name text NOT NULL DEFAULT 'Guest',
  rating        integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Shop owners can view all reviews for their shop
DROP POLICY IF EXISTS "owners_read_reviews" ON reviews;
CREATE POLICY "owners_read_reviews" ON reviews
  FOR SELECT USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- Anyone (customers) can insert a review
DROP POLICY IF EXISTS "public_insert_reviews" ON reviews;
CREATE POLICY "public_insert_reviews" ON reviews
  FOR INSERT WITH CHECK (true);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS reviews_shop_id_idx ON reviews (shop_id);
CREATE INDEX IF NOT EXISTS reviews_order_id_idx ON reviews (order_id);
CREATE INDEX IF NOT EXISTS orders_order_source_idx ON orders (order_source);
