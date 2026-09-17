-- 1. Update get_order_by_token to include original_price
CREATE OR REPLACE FUNCTION get_order_by_token(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT row_to_json(t)
    FROM (
      SELECT o.id, o.shop_id, o.order_number, o.status, o.payment_method, o.payment_status,
             o.order_type, o.customer_name, o.customer_phone, o.coupon_code, o.notes,
             o.subtotal, o.tax_amount, o.packing_charge, o.discount_amount, o.total,
             o.created_at,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id', oi.id,
                 'menu_item_id', oi.menu_item_id,
                 'name', oi.name,
                 'price', oi.price,
                 'original_price', oi.original_price,
                 'quantity', oi.quantity,
                 'subtotal', oi.subtotal,
                 'customizations', oi.customizations
               ))
               FROM order_items oi WHERE oi.order_id = o.id
             ), '[]'::json) AS items
      FROM orders o
      WHERE o.tracking_token = p_token
    ) t
  ), '{}'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_by_token(UUID) TO anon, authenticated;

-- 2. Update get_customer_orders to include original_price
CREATE OR REPLACE FUNCTION get_customer_orders(p_session_token TEXT, p_limit INT DEFAULT 30)
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
             o.order_type, o.customer_name, o.customer_phone, o.coupon_code, o.notes,
             o.subtotal, o.tax_amount, o.packing_charge, o.discount_amount, o.total,
             o.created_at,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id', oi.id,
                 'menu_item_id', oi.menu_item_id,
                 'name', oi.name,
                 'price', oi.price,
                 'original_price', oi.original_price,
                 'quantity', oi.quantity,
                 'subtotal', oi.subtotal,
                 'customizations', oi.customizations
               ))
               FROM order_items oi WHERE oi.order_id = o.id
             ), '[]'::json) AS items
      FROM orders o
      WHERE o.customer_profile_id = v_session.profile_id
      ORDER BY o.created_at DESC
      LIMIT p_limit
    ) t
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_orders(TEXT, INT) TO anon, authenticated;
