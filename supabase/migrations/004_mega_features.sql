-- ─── PHASE 1: STOCK / INSTANT ITEMS ─────────────────────────────────────────
alter table menu_items
  add column if not exists is_instant boolean not null default false,
  add column if not exists stock_quantity integer default null,
  add column if not exists low_stock_threshold integer not null default 5,
  add column if not exists customization_groups jsonb default '[]'::jsonb;

-- ─── PHASE 2: ORDER CUSTOMIZATIONS & ANONYMOUS ───────────────────────────────
alter table order_items
  add column if not exists customizations jsonb default '[]'::jsonb;

alter table orders
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists coupon_code text default null,
  add column if not exists discount_amount numeric(10,2) not null default 0;

-- ─── STOCK LOGS ──────────────────────────────────────────────────────────────
create table if not exists stock_logs (
  id             uuid primary key default uuid_generate_v4(),
  shop_id        uuid not null references shops(id) on delete cascade,
  menu_item_id   uuid references menu_items(id) on delete set null,
  item_name      text not null,
  delta          integer not null,
  reason         text not null check (reason in ('order', 'restock', 'adjustment')),
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists stock_logs_shop_idx on stock_logs(shop_id);
create index if not exists stock_logs_item_idx on stock_logs(menu_item_id);
create index if not exists stock_logs_created_idx on stock_logs(created_at desc);

alter table stock_logs enable row level security;

drop policy if exists "Owners manage their stock logs" on stock_logs;
create policy "Owners manage their stock logs"
  on stock_logs for all using (
    exists (select 1 from shops where shops.id = stock_logs.shop_id and shops.owner_id = auth.uid())
  );

-- ─── COUPONS ─────────────────────────────────────────────────────────────────
create table if not exists coupons (
  id                uuid primary key default uuid_generate_v4(),
  shop_id           uuid not null references shops(id) on delete cascade,
  code              text not null,
  type              text not null check (type in ('percentage', 'amount')),
  value             numeric(10,2) not null,
  min_order_amount  numeric(10,2) not null default 0,
  max_uses          integer default null,
  used_count        integer not null default 0,
  expires_at        timestamptz default null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (shop_id, code)
);

create index if not exists coupons_shop_idx on coupons(shop_id);

alter table coupons enable row level security;

-- Owners can fully manage their coupons
drop policy if exists "Owners manage their coupons" on coupons;
create policy "Owners manage their coupons"
  on coupons for all using (
    exists (select 1 from shops where shops.id = coupons.shop_id and shops.owner_id = auth.uid())
  );

-- Public (unauthenticated) can read active coupons for validation at checkout
drop policy if exists "Public can read active coupons" on coupons;
create policy "Public can read active coupons"
  on coupons for select using (is_active = true);
