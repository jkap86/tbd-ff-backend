-- Migration 073: Enforce NOT NULL on required columns
--
-- ISSUE: Migration 005 added invite_code column with UNIQUE constraint but allows NULL.
-- However, all existing leagues were backfilled with codes via UPDATE statement.
-- New leagues should be required to have invite codes for security and usability.

-- ============================================================================
-- LEAGUES.INVITE_CODE: Enforce NOT NULL
-- ============================================================================

-- First, verify all existing leagues have invite codes
-- (This should be true due to migration 005's UPDATE statement)
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM leagues
  WHERE invite_code IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'Cannot set invite_code to NOT NULL: % leagues have NULL invite codes. Run backfill first.',
      null_count;
  END IF;
END $$;

-- Set NOT NULL constraint
ALTER TABLE leagues
  ALTER COLUMN invite_code SET NOT NULL;

COMMENT ON COLUMN leagues.invite_code
  IS 'Unique 6-character invite code for joining league (required, auto-generated)';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify constraint was added:
-- SELECT column_name, is_nullable, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'leagues' AND column_name = 'invite_code';
--
-- Expected result: is_nullable = 'NO'

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- ALTER TABLE leagues ALTER COLUMN invite_code DROP NOT NULL;
