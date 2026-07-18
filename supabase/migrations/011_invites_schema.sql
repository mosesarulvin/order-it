-- Schema for Shop Invites

create table if not exists shop_invites (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  role text not null check (role in ('manager', 'staff')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

alter table shop_invites enable row level security;

-- Owners can create and read invites for their shop
drop policy if exists "Owners manage invites" on shop_invites;
create policy "Owners manage invites" on shop_invites for all using (
  exists (select 1 from shops where id = shop_invites.shop_id and owner_id = auth.uid())
);

-- Public can read invites to verify them on the signup page
drop policy if exists "Anyone can read invites" on shop_invites;
create policy "Anyone can read invites" on shop_invites for select using (true);

-- RPC Function to safely accept an invite and bypass RLS on shop_staff
create or replace function accept_invite(p_invite_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_invite record;
  v_user_id uuid := auth.uid();
begin
  -- Ensure user is logged in
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Find and lock the invite
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

  -- Delete the invite so it can't be reused
  delete from shop_invites where id = p_invite_id;

  return json_build_object('success', true, 'shop_id', v_invite.shop_id, 'role', v_invite.role);
end;
$$;
