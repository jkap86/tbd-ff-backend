-- Migration 075: Document migration renumbering
--
-- This is a no-op migration to document the renumbering of duplicate migrations.
-- No schema changes are made in this migration - it exists solely for documentation.

-- ============================================================================
-- DUPLICATE MIGRATION RESOLUTION
-- ============================================================================

-- The following duplicate migration numbers were identified during schema review:
--
-- DUPLICATE 042:
--   - 042_add_pick_expiration_to_draft_order.sql (KEPT AS 042)
--   - 042_create_draft_audit_log.sql (SHOULD BE RENUMBERED TO 067)
--
-- DUPLICATE 061:
--   - 061_create_draft_derby_selections_table.sql (KEPT AS 061, marked deprecated)
--   - 061_recreate_draft_derby_selections.sql (SHOULD BE RENUMBERED TO 068)
--
-- DUPLICATE 066:
--   - 066_add_bestball_setting.sql (NO-OP PLACEHOLDER - DELETE)
--   - 066_create_league_chat_read_status_table.sql (KEPT AS 066)
--
-- MISSING 011:
--   - Migration 011 is missing from sequence (jumps from 010 to 012)
--   - This may have been an intentional skip or a deleted migration
--   - No action needed, but documented here for clarity

-- ============================================================================
-- RECOMMENDED FILE RENAMING
-- ============================================================================

-- Manual file system operations required (cannot be done via SQL):
--
-- 1. Rename files:
--    mv 042_create_draft_audit_log.sql 067_create_draft_audit_log.sql
--    mv 061_recreate_draft_derby_selections.sql 068_recreate_draft_derby_selections.sql
--
-- 2. Delete no-op placeholder:
--    rm 066_add_bestball_setting.sql
--
-- 3. Update migration tracking table (if exists):
--    UPDATE schema_migrations SET version = 67 WHERE version = 42 AND name LIKE '%audit_log%';
--    UPDATE schema_migrations SET version = 68 WHERE version = 61 AND name LIKE '%recreate%';
--    DELETE FROM schema_migrations WHERE version = 66 AND name LIKE '%bestball%';

-- ============================================================================
-- CORRECTED MIGRATION SEQUENCE (After Renumbering)
-- ============================================================================

-- 001-010: Initial schema
-- 011: MISSING (gap documented)
-- 012-041: Feature additions
-- 042: add_pick_expiration_to_draft_order
-- 043-059: More features
-- 060-061: Draft derby
-- 062-066: Additional features
-- 067: create_draft_audit_log (formerly 042)
-- 068: recreate_draft_derby_selections (formerly 061)
-- 069-070: Latest features
-- 071-075: Fix migrations (this schema review)

-- ============================================================================
-- NO-OP EXECUTION
-- ============================================================================

-- This migration performs no actual schema changes
SELECT 1 AS migration_075_documentation_only;

COMMENT ON TABLE draft_audit_log
  IS 'Audit trail for draft events, errors, and commissioner actions. Created in migration 067 (formerly 042_duplicate).';

COMMENT ON TABLE draft_derby_selections
  IS 'Records which roster selected which draft position during the derby. Recreated in migration 068 (formerly 061_duplicate).';

COMMENT ON TABLE league_chat_read_status
  IS 'Tracks when users last read chat messages. Created in migration 066 (bestball placeholder removed).';

-- ============================================================================
-- END OF DOCUMENTATION
-- ============================================================================
