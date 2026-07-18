-- Phase 2: Custom Shop Branding & Logo

-- Add logo column
ALTER TABLE shops ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add brand color columns
-- We allow NULLs here. A NULL value implies the "Default" orange theme should be used.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS brand_primary TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS brand_secondary TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS brand_accent TEXT;

-- We don't strictly need a 'theme_type' column (like 'default' vs 'custom') because we can simply
-- check if brand_primary IS NULL to know it's using the default theme, keeping things simple.
