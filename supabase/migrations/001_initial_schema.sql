-- OrderIt Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── SHOPS ────────────────────────────────────────────────────────────────────
create table if not exists shops (
  id            uuid primary key default uuid_generate_v4(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  slug          text not null unique,
  description   text,
  logo_url      text,
  phone         text,
  address       text,
  currency      text not null default 'INR',
  is_open       boolean not null default true,
  tax_percent   numeric(5,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists shops_slug_idx on shops(slug);

-- ─── MENU CATEGORIES ─────────────────────────────────────────────────────────
create table if not exists menu_categories (
  id          uuid primary key default uuid_generate_v4(),
  shop_id     uuid not null references shops(id) on delete cascade,
  name        text not null,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists menu_categories_shop_idx on menu_categories(shop_id);

-- ─── MENU ITEMS ───────────────────────────────────────────────────────────────
create table if not exists menu_items (
  id           uuid primary key default uuid_generate_v4(),
  shop_id      uuid not null references shops(id) on delete cascade,
  category_id  uuid not null references menu_categories(id) on delete cascade,
  name         text not null,
  description  text,
  price        numeric(10,2) not null default 0,
  image_url    text,
  is_available boolean not null default true,
  is_popular   boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists menu_items_shop_idx on menu_items(shop_id);
create index if not exists menu_items_category_idx on menu_items(category_id);

-- ─── ORDERS ───────────────────────────────────────────────────────────────────
create table if not exists orders (
  id               uuid primary key default uuid_generate_v4(),
  shop_id          uuid not null references shops(id) on delete cascade,
  order_number     text not null,
  customer_name    text not null,
  customer_phone   text not null,
  status           text not null default 'pending'
                   check (status in ('pending','confirmed','preparing','ready','completed','cancelled')),
  payment_method   text not null default 'cash'
                   check (payment_method in ('upi','cash')),
  payment_status   text not null default 'pending'
                   check (payment_status in ('pending','paid','failed')),
  subtotal         numeric(10,2) not null default 0,
  tax_amount       numeric(10,2) not null default 0,
  total            numeric(10,2) not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists orders_shop_idx on orders(shop_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_created_idx on orders(created_at desc);

-- ─── ORDER ITEMS ──────────────────────────────────────────────────────────────
create table if not exists order_items (
  id           uuid primary key default uuid_generate_v4(),
  order_id     uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,
  name         text not null,
  price        numeric(10,2) not null,
  quantity     integer not null default 1,
  subtotal     numeric(10,2) not null,
  created_at   timestamptz not null default now()
);

create index if not exists order_items_order_idx on order_items(order_id);

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger shops_updated_at before update on shops
  for each row execute function update_updated_at();

create trigger menu_items_updated_at before update on menu_items
  for each row execute function update_updated_at();

create trigger orders_updated_at before update on orders
  for each row execute function update_updated_at();

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table shops enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- Shops: owners can CRUD their own shop
create policy "Shop owners manage their shop"
  on shops for all using (auth.uid() = owner_id);

-- Menu categories: owners manage theirs; public can read
create policy "Owners manage their categories"
  on menu_categories for all using (
    exists (select 1 from shops where shops.id = menu_categories.shop_id and shops.owner_id = auth.uid())
  );
create policy "Public can read active categories"
  on menu_categories for select using (is_active = true);

-- Menu items: owners manage theirs; public can read available items
create policy "Owners manage their menu items"
  on menu_items for all using (
    exists (select 1 from shops where shops.id = menu_items.shop_id and shops.owner_id = auth.uid())
  );
create policy "Public can read available items"
  on menu_items for select using (is_available = true);

-- Orders: owners see their shop's orders; anyone can insert/read their own by id
create policy "Shop owners see their orders"
  on orders for all using (
    exists (select 1 from shops where shops.id = orders.shop_id and shops.owner_id = auth.uid())
  );
create policy "Anyone can create an order"
  on orders for insert with check (true);
create policy "Anyone can read order by id"
  on orders for select using (true);

-- Order items: same as orders
create policy "Shop owners see their order items"
  on order_items for all using (
    exists (
      select 1 from orders o
      join shops s on s.id = o.shop_id
      where o.id = order_items.order_id and s.owner_id = auth.uid()
    )
  );
create policy "Anyone can insert order items"
  on order_items for insert with check (true);
create policy "Anyone can read order items"
  on order_items for select using (true);

-- ─── REALTIME ─────────────────────────────────────────────────────────────────
-- Enable Realtime on orders table (run in Supabase dashboard if not automatic)
-- alter publication supabase_realtime add table orders;

-- ─── STORAGE BUCKET ───────────────────────────────────────────────────────────
-- Create via Supabase dashboard: Storage > New Bucket > "menu-images" (Public)
-- Or run:
-- insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true);
