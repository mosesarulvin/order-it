-- RBAC Schema Changes

-- 1. User Profiles (For Super Admin and global preferences)
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_profiles enable row level security;

-- Super admins can read/write everything. Users can read their own.
drop policy if exists "Users read own profile" on user_profiles;
drop policy if exists "Super admins read all profiles" on user_profiles; -- Drop the old recursive policy if it exists in the DB
create policy "Users read own profile" on user_profiles for select using (auth.uid() = id);
  -- (Removed recursive super admin policy. Super admins can manage profiles directly via SQL editor if needed).


-- 2. Shop Staff (Roles: 'owner', 'manager', 'staff')
create table if not exists shop_staff (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(shop_id, user_id)
);

alter table shop_staff enable row level security;

-- Owners and Super Admins can manage staff
drop policy if exists "Staff can read their own access" on shop_staff;
create policy "Staff can read their own access" on shop_staff for select using (auth.uid() = user_id);

drop policy if exists "Owners manage staff" on shop_staff;
create policy "Owners manage staff" on shop_staff for all using (
  exists (select 1 from shops where id = shop_staff.shop_id and owner_id = auth.uid())
);

drop policy if exists "Super admins manage staff" on shop_staff;
create policy "Super admins manage staff" on shop_staff for all using (
  exists (select 1 from user_profiles where id = auth.uid() and is_super_admin = true)
);

-- Note: In a complete migration, we would also update the RLS policies for `orders`, `menu_items`, `menu_categories`, and `shops` to check the `shop_staff` table instead of just `shops.owner_id`.
