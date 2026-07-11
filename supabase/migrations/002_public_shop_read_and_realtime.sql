-- Migration 002: Fix public shop read + enable realtime on orders
-- Run this in your Supabase SQL Editor

-- ─── PUBLIC READ ON SHOPS ─────────────────────────────────────────────────────
-- Customers browsing the menu need to read shop info (name, slug, is_open, etc.)
-- Without this policy, anonymous users get "Shop not found" on every menu page.
create policy "Public can read shops"
  on shops for select using (true);

-- ─── REALTIME ON ORDERS ───────────────────────────────────────────────────────
-- Required for the customer order-tracking page and kitchen/orders dashboard
-- to receive live status updates via postgres_changes subscriptions.
alter publication supabase_realtime add table orders;
