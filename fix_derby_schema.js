// Quick script to fix derby schema
// Run with: node backend/fix_derby_schema.js

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'tbdff_test',
  user: 'postgres',
  password: 'password123',
});

async function fixDerbySchema() {
  const client = await pool.connect();

  try {
    console.log('Starting derby schema migration...');

    // Step 1: Add new field to drafts table
    console.log('Step 1: Adding derby_skipped_user_time_limit_seconds to drafts...');
    await client.query(`
      ALTER TABLE drafts
        ADD COLUMN IF NOT EXISTS derby_skipped_user_time_limit_seconds INTEGER
    `);
    console.log('✓ Done');

    // Step 2: Add new columns to draft_derby
    console.log('Step 2: Adding new columns to draft_derby...');
    await client.query(`
      ALTER TABLE draft_derby
        ADD COLUMN IF NOT EXISTS selection_order JSONB,
        ADD COLUMN IF NOT EXISTS current_turn_roster_id INTEGER REFERENCES rosters(id),
        ADD COLUMN IF NOT EXISTS current_turn_started_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS skipped_roster_ids JSONB DEFAULT '[]'
    `);
    console.log('✓ Done');

    // Step 3: Migrate data
    console.log('Step 3: Migrating data from old columns to new columns...');
    const result = await client.query(`
      UPDATE draft_derby
      SET
        selection_order = derby_order,
        current_turn_roster_id = (
          CASE
            WHEN derby_order IS NOT NULL AND current_turn IS NOT NULL
              AND current_turn < jsonb_array_length(derby_order)
            THEN (derby_order->>current_turn)::INTEGER
            ELSE NULL
          END
        ),
        current_turn_started_at = COALESCE(current_turn_started_at, updated_at),
        skipped_roster_ids = COALESCE(skipped_roster_ids, '[]'::jsonb)
      WHERE selection_order IS NULL AND derby_order IS NOT NULL
    `);
    console.log(`✓ Migrated ${result.rowCount} rows`);

    // Step 4: Handle NOT NULL constraint
    console.log('Step 4: Setting default for NULL selection_order...');
    await client.query(`
      UPDATE draft_derby
      SET selection_order = '[]'::jsonb
      WHERE selection_order IS NULL
    `);

    await client.query(`
      ALTER TABLE draft_derby
        ALTER COLUMN selection_order SET NOT NULL
    `);
    console.log('✓ Done');

    // Step 5: Drop old columns
    console.log('Step 5: Dropping old columns...');
    await client.query(`
      ALTER TABLE draft_derby
        DROP COLUMN IF EXISTS derby_order,
        DROP COLUMN IF EXISTS current_turn,
        DROP COLUMN IF EXISTS turn_deadline
    `);
    console.log('✓ Done');

    // Step 6: Create index
    console.log('Step 6: Creating index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_draft_derby_current_turn ON draft_derby(current_turn_roster_id)
    `);
    console.log('✓ Done');

    // Step 7: Verify
    console.log('\nVerifying schema...');
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'draft_derby'
      ORDER BY ordinal_position
    `);

    console.log('\nCurrent draft_derby columns:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixDerbySchema();
