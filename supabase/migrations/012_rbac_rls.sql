-- Final RBAC RLS Migration

-- 1. Update shop_invites to allow 'owner' role
alter table shop_invites drop constraint if exists shop_invites_role_check;
alter table shop_invites add constraint shop_invites_role_check check (role in ('owner', 'manager', 'staff'));

-- 2. Update accept_invite to handle owner transfers
create or replace function accept_invite(p_invite_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_invite record;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite from shop_invites where id = p_invite_id for update;

  if not found then
    raise exception 'Invite not found or already used';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'Invite has expired';
  end if;

  -- Insert into shop_staff
  insert into shop_staff (shop_id, user_id, role)
  values (v_invite.shop_id, v_user_id, v_invite.role)
  on conflict (shop_id, user_id) do update set role = excluded.role;

  -- If this was an owner invite, transfer the shop's owner_id
  if v_invite.role = 'owner' then
    update shops set owner_id = v_user_id where id = v_invite.shop_id;
  end if;

  delete from shop_invites where id = p_invite_id;

  return json_build_object('success', true, 'shop_id', v_invite.shop_id, 'role', v_invite.role);
end;
$$;

-- 3. Update Orders RLS (All staff can manage orders)
drop policy if exists "Shop owners see their orders" on orders;
create policy "Staff see their orders" on orders for select using (
  exists (select 1 from shop_staff where shop_staff.shop_id = orders.shop_id and shop_staff.user_id = auth.uid())
  or exists (select 1 from shops where shops.id = orders.shop_id and shops.owner_id = auth.uid())
);

drop policy if exists "Shop owners can update orders" on orders;
create policy "Staff can update orders" on orders for update using (
  exists (select 1 from shop_staff where shop_staff.shop_id = orders.shop_id and shop_staff.user_id = auth.uid())
  or exists (select 1 from shops where shops.id = orders.shop_id and shops.owner_id = auth.uid())
);

-- 4. Update Order Items RLS (All staff can manage order items)
drop policy if exists "Shop owners see their order items" on order_items;
create policy "Staff see their order items" on order_items for select using (
  exists (
    select 1 from orders 
    where orders.id = order_items.order_id and (
      exists (select 1 from shop_staff where shop_staff.shop_id = orders.shop_id and shop_staff.user_id = auth.uid())
      or exists (select 1 from shops where shops.id = orders.shop_id and shops.owner_id = auth.uid())
    )
  )
);

drop policy if exists "Shop owners can update order items" on order_items;
create policy "Staff can update order items" on order_items for update using (
  exists (
    select 1 from orders 
    where orders.id = order_items.order_id and (
      exists (select 1 from shop_staff where shop_staff.shop_id = orders.shop_id and shop_staff.user_id = auth.uid())
      or exists (select 1 from shops where shops.id = orders.shop_id and shops.owner_id = auth.uid())
    )
  )
);


-- 5. Update Menu Categories RLS (Owners and Managers can manage)
drop policy if exists "Owners manage their categories" on menu_categories;
create policy "Owners and managers manage categories" on menu_categories for all using (
  exists (select 1 from shop_staff where shop_staff.shop_id = menu_categories.shop_id and shop_staff.user_id = auth.uid() and role in ('owner', 'manager'))
  or exists (select 1 from shops where shops.id = menu_categories.shop_id and shops.owner_id = auth.uid())
);

-- 6. Update Menu Items RLS (Owners and Managers can manage)
drop policy if exists "Owners manage their menu items" on menu_items;
create policy "Owners and managers manage menu items" on menu_items for all using (
  exists (select 1 from shop_staff where shop_staff.shop_id = menu_items.shop_id and shop_staff.user_id = auth.uid() and role in ('owner', 'manager'))
  or exists (select 1 from shops where shops.id = menu_items.shop_id and shops.owner_id = auth.uid())
);
