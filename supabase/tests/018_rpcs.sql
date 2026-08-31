-- pgTAP smoke tests for migration 018 (platform hardening).
--
-- Run against a shadow Supabase project via psql, e.g.:
--   psql "$SHADOW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/018_rpcs.sql
--
-- These tests assert the trust boundary: RPCs must reject invalid input,
-- unauthorized callers, and (for sign_in_customer) must eventually rate-limit.
-- Each block uses SAVEPOINTs so state is not persisted between assertions.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(8);

-- ── Setup: create a shop and a profile with a known password ─────────────────
SAVEPOINT tests_start;

INSERT INTO shops(id, owner_id, name, slug, status)
VALUES ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'Test Shop', 'testshop-pgt', 'active')
ON CONFLICT (id) DO NOTHING;

SELECT create_customer_profile(
  '11111111-1111-1111-1111-111111111111',
  'Test User',
  '9876543210',
  'test@example.com',
  DATE '1990-01-01',
  'Correct123'
) AS signup_result \gset

-- ── 1. sign_in_customer succeeds with correct password ──────────────────────
SELECT ok(
  (sign_in_customer('11111111-1111-1111-1111-111111111111', '9876543210', 'Correct123'))::text
    LIKE '%session_token%',
  'sign_in_customer returns a session token on valid credentials'
);

-- ── 2. sign_in_customer rejects wrong password ──────────────────────────────
PREPARE bad_pw AS SELECT sign_in_customer('11111111-1111-1111-1111-111111111111', '9876543210', 'WRONGPASS');
SELECT throws_ok('EXECUTE bad_pw', '42501', 'invalid_credentials',
  'sign_in_customer raises invalid_credentials on wrong password');

-- ── 3. sign_in_customer rejects unknown phone ───────────────────────────────
PREPARE bad_phone AS SELECT sign_in_customer('11111111-1111-1111-1111-111111111111', '9000000000', 'whatever');
SELECT throws_ok('EXECUTE bad_phone', '42501', 'invalid_credentials',
  'sign_in_customer raises invalid_credentials on unknown phone');

-- ── 4. Rate limit trips after repeated failures ─────────────────────────────
SAVEPOINT rate_limit_check;
DO $$
BEGIN
  FOR i IN 1..8 LOOP
    BEGIN
      PERFORM sign_in_customer('11111111-1111-1111-1111-111111111111', '9876543210', 'WRONGPASS');
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- expected
    END;
  END LOOP;
END $$;
SELECT throws_ok(
  $$ SELECT sign_in_customer('11111111-1111-1111-1111-111111111111', '9876543210', 'Correct123') $$,
  '42501',
  'rate_limited',
  'sign_in_customer rate-limits after repeated failures'
);
ROLLBACK TO rate_limit_check;

-- ── 5. get_customer_profile returns NULL for a bogus token ──────────────────
SELECT ok(
  get_customer_profile('deadbeef' || repeat('0', 60)) IS NULL,
  'get_customer_profile returns NULL for an unknown session token'
);

-- ── 6. get_customer_profile requires a token of minimum length ──────────────
SELECT ok(
  get_customer_profile('too-short') IS NULL,
  'get_customer_profile returns NULL for a too-short token'
);

-- ── 7. create_customer_profile rejects an invalid phone ─────────────────────
PREPARE bad_signup_phone AS SELECT create_customer_profile(
  '11111111-1111-1111-1111-111111111111',
  'X', '12345', 'x@y.com', DATE '1990-01-01', 'Correct123'
);
SELECT throws_ok('EXECUTE bad_signup_phone', '22023', 'invalid_phone',
  'create_customer_profile rejects invalid phone');

-- ── 8. place_walkin_order requires auth ────────────────────────────────────
SET LOCAL role TO anon;
PREPARE anon_walkin AS SELECT place_walkin_order(
  '11111111-1111-1111-1111-111111111111', '[]'::jsonb, 'x', 'dine_in', 'cash'
);
SELECT throws_ok('EXECUTE anon_walkin', '42501', 'auth_required',
  'place_walkin_order rejects anonymous callers');
RESET role;

SELECT * FROM finish();

ROLLBACK TO tests_start;
ROLLBACK;
