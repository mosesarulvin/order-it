-- Create a function to efficiently calculate dashboard stats on the database side
create or replace function get_dashboard_stats(p_shop_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_today timestamptz := current_date;
  v_ninety_days_ago timestamptz := current_date - interval '90 days';
  v_total_orders bigint;
  v_pending_orders bigint;
  v_today_revenue numeric;
  v_total_revenue numeric;
begin
  -- Total orders (last 90 days)
  select count(*) into v_total_orders
  from orders
  where shop_id = p_shop_id and created_at >= v_ninety_days_ago;

  -- Pending orders
  select count(*) into v_pending_orders
  from orders
  where shop_id = p_shop_id and created_at >= v_ninety_days_ago
  and status in ('pending', 'confirmed', 'preparing');

  -- Today's revenue
  select coalesce(sum(total), 0) into v_today_revenue
  from orders
  where shop_id = p_shop_id and created_at >= v_today
  and status != 'cancelled' and payment_status = 'paid';

  -- Total revenue (last 90 days)
  select coalesce(sum(total), 0) into v_total_revenue
  from orders
  where shop_id = p_shop_id and created_at >= v_ninety_days_ago
  and status != 'cancelled' and payment_status = 'paid';

  return json_build_object(
    'total_orders', v_total_orders,
    'pending_orders', v_pending_orders,
    'today_revenue', v_today_revenue,
    'total_revenue', v_total_revenue
  );
end;
$$;
