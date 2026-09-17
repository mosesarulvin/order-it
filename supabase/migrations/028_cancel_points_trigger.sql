-- Up migration

-- 1. Update the check constraint to allow cancellation transaction types
ALTER TABLE public.points_transactions DROP CONSTRAINT IF EXISTS points_transactions_type_check;
ALTER TABLE public.points_transactions ADD CONSTRAINT points_transactions_type_check CHECK (type IN ('earn', 'redeem', 'manual', 'expire', 'cancel_refund', 'cancel_revoke'));

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_cancelled_order_points()
RETURNS TRIGGER AS $$
DECLARE
    v_tx public.points_transactions%ROWTYPE;
    v_points_to_revoke INTEGER := 0;
    v_points_to_refund INTEGER := 0;
    v_profile_id UUID := NULL;
BEGIN
    -- Only run when status changes to 'cancelled'
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        
        -- Find all earn/redeem transactions for this order
        FOR v_tx IN 
            SELECT * FROM public.points_transactions 
            WHERE order_id = NEW.id AND type IN ('earn', 'redeem')
        LOOP
            v_profile_id := v_tx.profile_id;
            
            IF v_tx.type = 'earn' THEN
                v_points_to_revoke := v_points_to_revoke + v_tx.delta;
                
                -- Insert a cancel_revoke transaction
                INSERT INTO public.points_transactions (profile_id, shop_id, order_id, delta, type, note)
                VALUES (v_tx.profile_id, v_tx.shop_id, NEW.id, -v_tx.delta, 'cancel_revoke', 'Revoked earned points for cancelled order');
            ELSIF v_tx.type = 'redeem' THEN
                -- redeem delta is negative, so we refund the absolute value (which is -v_tx.delta)
                v_points_to_refund := v_points_to_refund - v_tx.delta;
                
                -- Insert a cancel_refund transaction
                INSERT INTO public.points_transactions (profile_id, shop_id, order_id, delta, type, note)
                VALUES (v_tx.profile_id, v_tx.shop_id, NEW.id, -v_tx.delta, 'cancel_refund', 'Refunded spent points for cancelled order');
            END IF;
        END LOOP;

        -- Update the customer's balance if there's any change
        IF v_profile_id IS NOT NULL AND (v_points_to_revoke > 0 OR v_points_to_refund > 0) THEN
            UPDATE public.reward_points
            SET 
                balance = GREATEST(0, balance - v_points_to_revoke + v_points_to_refund),
                total_earned = GREATEST(0, total_earned - v_points_to_revoke),
                total_redeemed = GREATEST(0, total_redeemed - v_points_to_refund),
                updated_at = now()
            WHERE profile_id = v_profile_id AND shop_id = NEW.shop_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach the trigger to the orders table
DROP TRIGGER IF EXISTS on_order_cancelled_points ON public.orders;
CREATE TRIGGER on_order_cancelled_points
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_cancelled_order_points();
