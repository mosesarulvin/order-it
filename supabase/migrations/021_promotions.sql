-- Migration for promotions feature
CREATE TYPE promotion_target_type AS ENUM ('category', 'item', 'all');
CREATE TYPE promotion_discount_type AS ENUM ('percentage', 'flat');

CREATE TABLE public.promotions (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    image_url TEXT,
    discount_type promotion_discount_type NOT NULL DEFAULT 'percentage',
    discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
    target_type promotion_target_type NOT NULL DEFAULT 'all',
    target_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    valid_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
 
-- Index for fast lookup by shop
CREATE INDEX idx_promotions_shop_id ON public.promotions(shop_id);

-- RLS Policies
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- 1. Public can view active promotions for a shop
CREATE POLICY "Public can view active promotions" ON public.promotions
    FOR SELECT USING (is_active = true AND (valid_until IS NULL OR valid_until > NOW()));

-- 2. Shop owners can CRUD their own promotions
CREATE POLICY "Owners can view all their promotions" ON public.promotions
    FOR SELECT USING (shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can insert promotions" ON public.promotions
    FOR INSERT WITH CHECK (shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can update their promotions" ON public.promotions
    FOR UPDATE USING (shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can delete their promotions" ON public.promotions
    FOR DELETE USING (shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid()));

-- Set up realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.promotions;
