# Manual Derby Migration Steps

## If migrations fail, follow these steps:

### Option A: Using the Node.js script (RECOMMENDED)

1. **First, ensure the draft_derby table exists by running migrations up to 060**:
   ```bash
   cd backend
   npm run migrate
   ```

2. **If migration 060 fails, manually create the table with old schema**:
   ```sql
   CREATE TABLE IF NOT EXISTS draft_derby (
     id SERIAL PRIMARY KEY,
     draft_id INTEGER UNIQUE NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
     status VARCHAR(20) DEFAULT 'pending',
     derby_order JSONB,
     current_turn INTEGER,
     turn_deadline TIMESTAMP,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

3. **Run the fix script**:
   ```bash
   node backend/fix_derby_schema.js
   ```

4. **Mark migrations as complete**:
   ```sql
   INSERT INTO schema_migrations (migration) VALUES
     ('060_create_draft_derby_table.sql'),
     ('061_create_draft_derby_selections_table.sql'),
     ('061_recreate_draft_derby_selections.sql'),
     ('062_add_league_chat_notification_preference.sql'),
     ('063_add_derby_skipped_user_timer.sql'),
     ('064_migrate_derby_schema.sql')
   ON CONFLICT DO NOTHING;
   ```

### Option B: Direct SQL in pgAdmin

1. Open pgAdmin
2. Connect to `tbdff_test` database
3. Run `backend/manual_derby_migration.sql`
4. Mark migrations as complete (see step 4 above)

### Option C: Fresh Database (CLEANEST)

1. **Backup any data you need**

2. **Drop and recreate database**:
   ```sql
   DROP DATABASE tbdff_test;
   CREATE DATABASE tbdff_test;
   ```

3. **Run all migrations**:
   ```bash
   cd backend
   npm run migrate
   ```

## Verification

After migration, verify the schema:

```sql
-- Check draft_derby columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'draft_derby'
ORDER BY ordinal_position;

-- Should show:
-- id, integer, NO
-- draft_id, integer, NO
-- status, character varying, YES
-- selection_order, jsonb, NO
-- current_turn_roster_id, integer, YES
-- current_turn_started_at, timestamp, YES
-- skipped_roster_ids, jsonb, YES
-- created_at, timestamp, YES
-- updated_at, timestamp, YES

-- Check drafts table for new field
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'drafts'
  AND column_name = 'derby_skipped_user_time_limit_seconds';
-- Should return 1 row
```

## If Something Goes Wrong

If you encounter errors:

1. Check which migrations have run:
   ```sql
   SELECT * FROM schema_migrations ORDER BY id DESC LIMIT 10;
   ```

2. Check if draft_derby table exists:
   ```sql
   SELECT tablename FROM pg_tables WHERE tablename = 'draft_derby';
   ```

3. If table has old schema, drop and recreate:
   ```sql
   DROP TABLE IF EXISTS draft_derby CASCADE;
   DROP TABLE IF EXISTS draft_derby_selections CASCADE;
   ```
   Then run migrations again.
