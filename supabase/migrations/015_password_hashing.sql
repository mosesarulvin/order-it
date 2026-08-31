-- Enable pgcrypto for bcrypt password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash a password for storage (used by frontend on profile creation)
CREATE OR REPLACE FUNCTION hash_customer_password(p_password TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.crypt(p_password, extensions.gen_salt('bf'));
$$;

-- Verify a customer password. Supports:
--   - bcrypt hashes (new accounts: stored value starts with $2)
--   - plaintext (legacy accounts: auto-upgrades to bcrypt on successful login)
CREATE OR REPLACE FUNCTION verify_customer_password(
  p_shop_id UUID,
  p_phone   TEXT,
  p_password TEXT
)
RETURNS TABLE(id UUID, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_profile customer_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM customer_profiles
  WHERE shop_id = p_shop_id AND phone = p_phone;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_profile.password LIKE '$2%' THEN
    -- Bcrypt hash: constant-time comparison
    IF v_profile.password = extensions.crypt(p_password, v_profile.password) THEN
      RETURN QUERY SELECT v_profile.id, v_profile.name;
    END IF;
  ELSE
    -- Legacy plaintext: verify then upgrade to bcrypt
    IF v_profile.password = p_password THEN
      UPDATE customer_profiles
        SET password = extensions.crypt(p_password, extensions.gen_salt('bf'))
        WHERE id = v_profile.id;
      RETURN QUERY SELECT v_profile.id, v_profile.name;
    END IF;
  END IF;
END;
$$;

-- Grant execute to anonymous/authenticated roles so the frontend can call them
GRANT EXECUTE ON FUNCTION hash_customer_password(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_customer_password(UUID, TEXT, TEXT) TO anon, authenticated;
