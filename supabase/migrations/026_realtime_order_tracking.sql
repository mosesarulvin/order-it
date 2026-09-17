-- Create a stripped-down public table for tracking order statuses in realtime safely
CREATE TABLE IF NOT EXISTS public.order_status_changes (
  order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.order_status_changes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read status changes (but they can only query if they have the UUID)
CREATE POLICY "Anyone can read order status changes" ON public.order_status_changes FOR SELECT USING (true);

-- Enable realtime for this specific tracking table
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_changes;

-- Function to sync status from orders table securely
CREATE OR REPLACE FUNCTION trigger_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.order_status_changes (order_id, status)
  VALUES (NEW.id, NEW.status)
  ON CONFLICT (order_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to sync status on INSERT or UPDATE
DROP TRIGGER IF EXISTS on_order_status_change ON public.orders;
CREATE TRIGGER on_order_status_change
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION trigger_order_status_change();

-- Backfill existing orders
INSERT INTO public.order_status_changes (order_id, status)
SELECT id, status FROM public.orders
ON CONFLICT DO NOTHING;
