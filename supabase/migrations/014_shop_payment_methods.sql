-- Add accepts_upi and accepts_cash columns to shops table
ALTER TABLE public.shops 
ADD COLUMN accepts_upi BOOLEAN DEFAULT true,
ADD COLUMN accepts_cash BOOLEAN DEFAULT true;
