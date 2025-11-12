# Deploying Migration Tracking to Existing Database

## Problem

Your production database already has migrations 001-070 applied manually. The new migration tracking system doesn't know this, so it will try to re-run all migrations on first deploy (which will fail).

## Solution

Run the `seed_existing_migrations.sql` script **ONCE** on your production database **BEFORE** deploying the new code.

---

## Step-by-Step Instructions

### Option 1: Using Heroku CLI (Recommended)

```bash
# 1. Connect to your Heroku Postgres database
heroku pg:psql -a tbd-ff

# 2. Run the seed script (copy/paste the entire content)
# Or pipe it directly:
```

From your local machine:
```bash
cd backend
heroku pg:psql -a tbd-ff < seed_existing_migrations.sql
```

### Option 2: Using Heroku Dashboard

1. Go to Heroku Dashboard → tbd-ff app → Resources tab
2. Click on "Heroku Postgres" add-on
3. Click "Settings" → "View Credentials"
4. Use credentials with your favorite Postgres client (pgAdmin, DBeaver, etc.)
5. Run `seed_existing_migrations.sql`

---

## What This Script Does

1. **Creates** `schema_migrations` table if it doesn't exist
2. **Inserts** records for migrations 001-070 (marks them as already applied)
3. **Verifies** the seed (shows count and list)

**Output you should see:**
```
INSERT 0 70
 total_migrations_seeded | first_applied | last_applied
-------------------------+---------------+--------------
                      70 | 2025-11-07... | 2025-11-07...
```

---

## After Running the Seed Script

Once the seed script is run on production:

### 1. Deploy the New Code

```bash
git push heroku main
```

### 2. What Will Happen on Deploy

```
-----> Running release command...
Starting migrations...
✓ Migration tracking table ready
✓ Found 70 previously applied migrations
✓ Found 75 total migration files

⊘ Skipping 001_create_users_table.sql (already applied)
⊘ Skipping 002_create_leagues_table.sql (already applied)
...
⊘ Skipping 070_add_draft_start_time_fields.sql (already applied)

Running migration: 071_fix_foreign_key_constraints.sql
✓ Migration 071_fix_foreign_key_constraints.sql completed successfully

Running migration: 072_fix_draft_derby_selections_fk.sql
✓ Migration 072_fix_draft_derby_selections_fk.sql completed successfully

Running migration: 073_add_missing_not_null_constraints.sql
✓ Migration 073_add_missing_not_null_constraints.sql completed successfully

Running migration: 074_add_missing_performance_indexes.sql
✓ Migration 074_add_missing_performance_indexes.sql completed successfully

Running migration: 075_document_migration_renumbering.sql
✓ Migration 075_document_migration_renumbering.sql completed successfully

✓ All migrations completed successfully!
  - Total migrations: 75
  - Already applied: 70
  - Newly applied: 5

-----> Starting web dynos...
```

---

## Verification After Deploy

### Check Migration Status

```bash
heroku pg:psql -a tbd-ff

-- See total count
SELECT COUNT(*) FROM schema_migrations;
-- Should show: 75

-- See latest migrations
SELECT version, applied_at
FROM schema_migrations
ORDER BY applied_at DESC
LIMIT 10;

-- Should show 071-075 with recent timestamps
```

### Check Foreign Keys Were Restored

```bash
heroku pg:psql -a tbd-ff

-- Verify foreign keys exist
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('player_stats', 'draft_picks', 'waiver_claims', 'trade_items')
ORDER BY tc.table_name;

-- Should see foreign keys on player_id columns
```

---

## Troubleshooting

### "relation schema_migrations already exists"

This means you already ran the seed script. It's idempotent, so running it again is safe (it uses `ON CONFLICT DO NOTHING`).

### "relation users already exists" after deploy

This means the seed script wasn't run, and the migration system tried to re-run migration 001.

**Fix:**
```bash
# Rollback the deploy
heroku rollback

# Run the seed script
heroku pg:psql -a tbd-ff < seed_existing_migrations.sql

# Deploy again
git push heroku main
```

### Only 4 new migrations ran (not 5)

Check if migration 073 failed due to existing data violating NOT NULL constraint on `leagues.invite_code`. If so:

```bash
# Check if any leagues have NULL invite_code
heroku pg:psql -a tbd-ff
SELECT id, name, invite_code FROM leagues WHERE invite_code IS NULL;

# Backfill them
UPDATE leagues SET invite_code = upper(substr(md5(random()::text), 1, 6))
WHERE invite_code IS NULL;

# Then re-run migration 073 manually
\i src/migrations/073_add_missing_not_null_constraints.sql
```

---

## Important Notes

### This is a ONE-TIME Operation

You only need to run `seed_existing_migrations.sql` **ONCE** on your production database. After that, all future migrations will be tracked automatically.

### Future Migrations Just Work

After this initial setup, creating and deploying new migrations is simple:

1. Create `076_your_new_feature.sql` in `src/migrations/`
2. `git add` and `git commit`
3. `git push heroku main`
4. Heroku automatically runs migration 076 during release phase

No manual steps needed!

### Staging Environment

If you have a staging environment, run the seed script there first to test:

```bash
heroku pg:psql -a tbd-ff-staging < seed_existing_migrations.sql
git push staging main
```

---

## Quick Command Summary

```bash
# 1. Seed the migrations table (ONE TIME ONLY)
heroku pg:psql -a tbd-ff < seed_existing_migrations.sql

# 2. Deploy the new code
git push heroku main

# 3. Verify it worked
heroku pg:psql -a tbd-ff -c "SELECT COUNT(*) FROM schema_migrations"
# Should show: 75

# 4. Done! Future deploys will auto-run new migrations
```

---

## Need Help?

- See `MIGRATION_GUIDE.md` for ongoing migration development
- See `EXECUTIVE_SUMMARY.md` for what migrations 071-075 do
- Check Heroku logs: `heroku logs --tail`
