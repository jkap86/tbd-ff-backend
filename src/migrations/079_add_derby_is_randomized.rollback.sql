-- Rollback: Remove is_randomized flag from draft_derby table

ALTER TABLE draft_derby
DROP COLUMN IF EXISTS is_randomized;
