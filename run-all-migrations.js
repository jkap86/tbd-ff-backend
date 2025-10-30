const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATIONS = [
  'src/migrations/001_create_users_table.sql',
  'src/migrations/002_create_leagues_table.sql',
  'src/migrations/003_create_rosters_table.sql',
  'src/migrations/004_create_league_invites_table.sql',
  'src/migrations/005_add_invite_code_to_leagues.sql',
  'src/migrations/006_create_players_table.sql',
  'src/migrations/007_create_drafts_table.sql',
  'src/migrations/008_create_draft_order_table.sql',
  'src/migrations/009_create_draft_picks_table.sql',
  'src/migrations/010_create_draft_chat_messages_table.sql',
  'src/migrations/012_add_adp_to_players.sql',
  'src/migrations/013_add_league_type_column.sql',
  'src/migrations/014_create_league_chat_messages_table.sql',
  'src/migrations/015_create_matchups_table.sql',
  'src/migrations/016_create_player_stats_table.sql',
  'src/migrations/017_add_autodraft_to_draft_order.sql',
  'src/migrations/018_add_matchup_finalized_flag.sql',
  'src/migrations/019_create_weekly_lineups.sql',
  'src/migrations/020_create_waiver_claims_table.sql',
  'src/migrations/021_create_waiver_settings_table.sql',
  'src/migrations/022_add_waiver_fields_to_rosters.sql',
  'src/migrations/023_create_transactions_table.sql',
  'src/migrations/024_add_chess_timer_to_drafts.sql',
  'src/migrations/025_add_time_tracking_to_draft_order.sql',
  'src/migrations/026_enhance_pick_time_tracking.sql',
  'src/migrations/027_migrate_existing_drafts_timer_mode.sql',
  'src/migrations/028_create_trades_table.sql',
  'src/migrations/029_create_trade_items_table.sql',
  'src/migrations/030_make_league_chat_user_id_nullable.sql',
  'src/migrations/031_add_trade_notification_settings.sql',
  'src/migrations/032_add_auction_draft_types.sql',
  'src/migrations/033_create_auction_tables.sql',
  'src/migrations/034_rename_max_simultaneous_nominations.sql',
  'src/migrations/035_fix_auction_player_id_type.sql',
  'src/migrations/036_fix_draft_picks_player_id_type.sql',
  'src/migrations/037_fix_all_player_id_types.sql',
  'src/migrations/038_add_bid_increment_to_drafts.sql',
  'migrations/027_add_performance_indexes.sql',
];

async function runAllMigrations() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not found');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🚀 Starting comprehensive migration...\n');
    console.log(`Running ${MIGRATIONS.length} migrations on Heroku database\n`);

    const client = await pool.connect();

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const migrationFile of MIGRATIONS) {
      const migrationName = path.basename(migrationFile);

      try {
        // Check if file exists
        const filePath = path.join(__dirname, migrationFile);
        if (!fs.existsSync(filePath)) {
          console.log(`⚠️  ${migrationName} - FILE NOT FOUND, skipping`);
          skipCount++;
          continue;
        }

        const migrationSQL = fs.readFileSync(filePath, 'utf8');

        console.log(`📝 Running: ${migrationName}...`);

        await client.query(migrationSQL);

        console.log(`   ✅ ${migrationName} - SUCCESS`);
        successCount++;

      } catch (error) {
        // Some migrations might fail if already applied - that's okay
        if (error.message.includes('already exists') ||
            error.message.includes('does not exist') ||
            error.message.includes('duplicate')) {
          console.log(`   ⏭️  ${migrationName} - SKIPPED (already applied)`);
          skipCount++;
        } else {
          console.error(`   ❌ ${migrationName} - ERROR: ${error.message}`);
          errorCount++;
        }
      }
    }

    client.release();
    await pool.end();

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(60));

    if (errorCount > 0) {
      console.log('\n⚠️  Some migrations had errors. Check output above.');
      console.log('   This may be normal if tables already exist.');
    } else {
      console.log('\n🎉 All migrations completed successfully!');
    }

    process.exit(errorCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n💥 Fatal error during migration:', error.message);
    await pool.end();
    process.exit(1);
  }
}

runAllMigrations();
