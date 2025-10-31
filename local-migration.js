require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const migrations = [
  'src/migrations/039_add_playoff_fields_to_matchups.sql',
  'src/migrations/040_create_playoff_settings.sql',
  'src/migrations/041_add_league_median_settings.sql',
  'src/migrations/042_add_pick_expiration_to_draft_order.sql',
  'src/migrations/042_create_draft_audit_log.sql',
  'src/migrations/043_add_injury_tracking.sql',
  'src/migrations/044_create_adp_tracking.sql',
  'src/migrations/045_add_advanced_stats.sql',
  'src/migrations/046_expand_scoring_settings.sql',
  'src/migrations/047_add_is_admin_to_users.sql',
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function run() {
  try {
    console.log('🚀 Running missing migrations...\n');
    const client = await pool.connect();

    for (const migrationFile of migrations) {
      const filePath = path.join(__dirname, migrationFile);
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  ${migrationFile} - FILE NOT FOUND`);
        continue;
      }

      const sql = fs.readFileSync(filePath, 'utf8');
      try {
        await client.query(sql);
        console.log(`✅ ${path.basename(migrationFile)}`);
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('does not exist')) {
          console.log(`⏭️  ${path.basename(migrationFile)} - already applied`);
        } else {
          console.error(`❌ ${path.basename(migrationFile)}: ${err.message}`);
        }
      }
    }

    client.release();
    await pool.end();
    console.log('\n✨ Done!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
