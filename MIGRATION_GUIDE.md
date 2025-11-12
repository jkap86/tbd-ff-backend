# Database Migration Guide

## Overview

This project uses automated database migrations with Heroku release phase. Migrations run automatically on every deploy **before** the web server starts.

## How It Works

### Heroku Release Phase

```procfile
release: npm run migrate  # Runs before web dynos start
web: npm start            # Starts after migrations succeed
```

**Deployment Flow:**
1. You push code to Heroku
2. Heroku builds your app
3. **Release phase:** Runs `npm run migrate`
   - If migrations fail → Deploy aborts (old version keeps running)
   - If migrations succeed → Continue to step 4
4. **Web phase:** Starts web dynos with new code

### Migration Tracking

Migrations are tracked in the `schema_migrations` table:

```sql
CREATE TABLE schema_migrations (
  version VARCHAR(255) PRIMARY KEY,      -- e.g., "042_add_feature.sql"
  applied_at TIMESTAMP DEFAULT NOW()     -- When migration was applied
);
```

**Key Features:**
- ✅ Only new migrations run on each deploy (idempotent)
- ✅ Each migration wrapped in transaction (atomic)
- ✅ Failed migrations rollback automatically
- ✅ Migrations run in alphabetical order (use numbered prefixes)

## Creating New Migrations

### 1. Naming Convention

```
{number}_{description}.sql

Examples:
076_add_user_preferences.sql
077_create_notifications_table.sql
078_add_index_on_email.sql
```

**Rules:**
- Use sequential numbers (no gaps OK, duplicates NOT OK)
- Use descriptive names (snake_case)
- Always use `.sql` extension

### 2. Write Migration SQL

```sql
-- 076_add_user_preferences.sql

-- Good: Idempotent (safe to run multiple times)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Bad: Not idempotent (fails on second run)
ALTER TABLE users ADD COLUMN preferences JSONB;  -- ❌ Will fail if column exists
CREATE INDEX idx_users_email ON users(email);    -- ❌ Will fail if index exists
```

### 3. Test Locally

```bash
# Run migrations locally
npm run migrate:dev

# Verify in psql
psql your_database
SELECT * FROM schema_migrations ORDER BY version;
```

### 4. Deploy to Production

```bash
git add src/migrations/076_add_user_preferences.sql
git commit -m "feat: add user preferences column"
git push heroku main

# Heroku will automatically:
# 1. Build app
# 2. Run migrations (release phase)
# 3. Start web server (if migrations succeed)
```

## Migration Best Practices

### ✅ Safe Migrations (Auto-Run OK)

These migrations are **non-blocking** and safe to run automatically:

```sql
-- Add columns with defaults
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

-- Add nullable columns
ALTER TABLE posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Create indexes concurrently (Postgres 9.2+)
-- Note: Cannot be in transaction, use separate migration
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_user_id ON posts(user_id);

-- Add foreign keys (non-blocking if table is small)
ALTER TABLE posts ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users(id);

-- Create new tables
CREATE TABLE IF NOT EXISTS notifications (...);
```

### ⚠️ Risky Migrations (Review Carefully)

These migrations **may block** and should be carefully reviewed:

```sql
-- Adding NOT NULL to existing column (blocks while backfilling)
-- Better: Add column as nullable, backfill, then add NOT NULL
ALTER TABLE users ADD COLUMN email VARCHAR(255);              -- Step 1
UPDATE users SET email = 'unknown@example.com' WHERE email IS NULL;  -- Step 2 (separate deploy)
ALTER TABLE users ALTER COLUMN email SET NOT NULL;            -- Step 3 (separate deploy)

-- Changing column types (requires table rewrite on large tables)
ALTER TABLE users ALTER COLUMN id TYPE BIGINT;  -- ⚠️ Locks table

-- Adding indexes on large tables (blocks writes)
CREATE INDEX idx_large_table_col ON large_table(col);  -- ⚠️ Use CONCURRENTLY instead
```

### ❌ Dangerous Migrations (Manual Only)

**NEVER** auto-run these without manual review:

```sql
-- Data loss
DROP TABLE old_table;
DROP COLUMN old_column;

-- Long-running operations on large tables
ALTER TABLE million_row_table ADD COLUMN x INTEGER;  -- May take minutes

-- Requires downtime
ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(500);  -- Table rewrite
```

## Monitoring Migrations

### View Migration Status

```bash
# Connect to Heroku Postgres
heroku pg:psql

# See all applied migrations
SELECT version, applied_at FROM schema_migrations ORDER BY version;

# Check latest migration
SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 1;
```

### View Deployment Logs

```bash
# See migration output during deploy
heroku releases
heroku releases:output v123  # Replace v123 with version number

# Real-time logs during deploy
heroku logs --tail
```

## Troubleshooting

### Migration Failed During Deploy

**Symptom:** Deploy failed, old version still running

**Fix:**
1. Check logs: `heroku releases:output`
2. Identify failed migration and error
3. Fix migration locally
4. Commit and push fix
5. Heroku will retry automatically

**Emergency Rollback:**
```bash
# Rollback to previous release
heroku rollback v122  # Replace with previous version

# Remove bad migration from tracking table (if needed)
heroku pg:psql
DELETE FROM schema_migrations WHERE version = '076_bad_migration.sql';
```

### Migration Stuck/Hanging

**Symptom:** Release phase takes >10 minutes

**Likely Cause:** Migration is blocked waiting for lock

**Fix:**
```bash
# Check for blocking queries
heroku pg:psql
SELECT * FROM pg_stat_activity WHERE state = 'active';

# Kill blocking query (if safe)
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE pid = <blocking_pid>;

# Cancel deployment
heroku releases:cancel
```

### Need to Skip a Migration

**Symptom:** Migration won't work, need to skip it

**Fix:**
```bash
# Manually mark migration as applied (without running it)
heroku pg:psql
INSERT INTO schema_migrations (version) VALUES ('076_skip_me.sql');

# Or remove migration file before deploy
git rm src/migrations/076_skip_me.sql
git commit -m "chore: remove problematic migration"
```

### Running Migrations Manually (Override Auto)

If you need to run migrations manually instead of using release phase:

```bash
# Option 1: One-off dyno
heroku run npm run migrate

# Option 2: Disable release phase temporarily
# Edit Procfile, comment out release line:
# release: npm run migrate
web: npm start

# Push, then run manually
git push heroku main
heroku run npm run migrate
```

## Advanced: Multi-Step Migrations

For complex schema changes that require multiple steps:

### Example: Making Column NOT NULL

**Step 1 Migration (076):** Add column as nullable
```sql
ALTER TABLE users ADD COLUMN email VARCHAR(255);
```

**Step 2 Backfill (Code Deploy):** Update application to write email
```typescript
// Application code now populates email field
```

**Step 3 Migration (077):** Backfill existing data
```sql
UPDATE users SET email = username || '@example.com' WHERE email IS NULL;
```

**Step 4 Migration (078):** Add NOT NULL constraint
```sql
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
```

**Why?** Each step is safe and non-blocking. Rushing to NOT NULL immediately would block the table during backfill.

## Testing Migrations Locally

### Setup Test Database

```bash
# Create test database
createdb tbd_ff_test

# Run migrations
DATABASE_URL=postgres://localhost/tbd_ff_test npm run migrate:dev

# Verify
psql tbd_ff_test
\dt  # List tables
SELECT * FROM schema_migrations;
```

### Test Idempotency

```bash
# Run migrations twice (should skip on second run)
npm run migrate:dev
npm run migrate:dev  # Should show "⊘ Skipping ... (already applied)"
```

### Test Rollback Safety

```bash
# Create test migration with intentional error
echo "SELECT * FROM nonexistent_table;" > src/migrations/999_test.sql

# Run migrations (should rollback and not record 999)
npm run migrate:dev  # Will fail

# Verify migration NOT recorded
psql tbd_ff_test
SELECT * FROM schema_migrations WHERE version = '999_test.sql';  -- Should be empty

# Clean up
rm src/migrations/999_test.sql
```

## FAQ

### Q: Can I rename a migration file after it's been deployed?

**A:** No. Once a migration is recorded in `schema_migrations`, renaming it will cause it to run again (duplicate work). If you must rename, manually update the tracking table.

### Q: What if two developers create the same migration number?

**A:** Git will show a conflict. Resolve by renumbering one of the migrations to the next available number.

### Q: Can I edit a migration after it's been deployed?

**A:** No. Once applied, migrations should be immutable. Create a new migration to make changes.

### Q: How do I handle migrations across branches?

**A:** Use high numbers for feature branches to avoid conflicts (e.g., 900-999). Renumber before merging to main.

### Q: What about down migrations (rollback)?

**A:** This project doesn't support down migrations. Instead, create a new forward migration to undo changes. This is safer and maintains audit trail.

## Summary

✅ **DO:**
- Use sequential numbering
- Make migrations idempotent
- Test locally before deploying
- Use `IF EXISTS` and `IF NOT EXISTS`
- Keep migrations small and focused
- Review risky migrations carefully

❌ **DON'T:**
- Modify migrations after deployment
- Create duplicate migration numbers
- Drop tables/columns without review
- Run blocking operations on large tables
- Skip the local testing step

---

**Need Help?** Check Heroku logs or review the migration script: `src/scripts/runMigrations.ts`
