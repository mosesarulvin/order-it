-- Add calories column to menu_items table
ALTER TABLE public.menu_items
ADD COLUMN calories INT DEFAULT NULL;
