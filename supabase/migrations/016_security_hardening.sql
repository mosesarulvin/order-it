-- ── 1. Orders: tighten anonymous INSERT policy ───────────────────────────────
-- Replace the unrestricted WITH CHECK (true) with financial and field sanity checks

DROP POLICY IF EXISTS "Anyone can create an order" ON orders;

CREATE POLICY "Anyone can create an order" ON orders
  FOR INSERT WITH CHECK (
    total            >= 0
    AND subtotal     >= 0
    AND tax_amount   >= 0
    AND packing_charge >= 0
    AND (discount_amount IS NULL OR discount_amount >= 0)
    AND (notes IS NULL OR length(notes) <= 500)
  );

-- ── 2. customer_profiles: enforce bcrypt passwords at DB level ────────────────
-- Upgrade any existing plaintext passwords before adding the constraint
UPDATE customer_profiles
  SET password = extensions.crypt(password, extensions.gen_salt('bf'))
  WHERE password IS NOT NULL AND password NOT LIKE '$2%';

-- All future passwords must be bcrypt hashes (set by hash_customer_password RPC)
ALTER TABLE customer_profiles
  DROP CONSTRAINT IF EXISTS customer_profiles_password_hashed;
ALTER TABLE customer_profiles
  ADD CONSTRAINT customer_profiles_password_hashed
  CHECK (password LIKE '$2%');

-- Tighten the anonymous INSERT policy with basic field validation
DROP POLICY IF EXISTS "public_insert_profiles" ON customer_profiles;

CREATE POLICY "public_insert_profiles" ON customer_profiles
  FOR INSERT WITH CHECK (
    length(trim(name))  BETWEEN 1 AND 100
    AND length(trim(phone)) BETWEEN 5 AND 20
    AND password LIKE '$2%'
  );

-- ── 3. shop_invites: remove enumerable public read, replace with a minimal RPC ─
DROP POLICY IF EXISTS "Anyone can read invites" ON shop_invites;

-- Returns only the fields the sign-up page needs; SECURITY DEFINER bypasses RLS
CREATE OR REPLACE FUNCTION get_invite_preview(p_invite_id UUID)
RETURNS TABLE(shop_name TEXT, role TEXT, expires_at TIMESTAMPTZ, is_valid BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.name::TEXT,
    i.role::TEXT,
    i.expires_at,
    (i.expires_at > now()) AS is_valid
  FROM shop_invites i
  JOIN shops s ON s.id = i.shop_id
  WHERE i.id = p_invite_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_invite_preview(UUID) TO anon, authenticated;
