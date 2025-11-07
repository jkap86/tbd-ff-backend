-- Seed schema_migrations table for existing production database
-- Run this ONCE on your production database BEFORE deploying the new migration system
--
-- This script marks all migrations up to 070 as "already applied" so the new
-- migration tracking system doesn't try to re-run them.
--
-- New migrations 071-075 will run automatically on next deploy.

-- Create the tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mark all existing migrations as applied (001-070)
-- These have already been manually run on your production database
INSERT INTO schema_migrations (version, applied_at) VALUES
  ('001_create_users_table.sql', NOW()),
  ('002_create_leagues_table.sql', NOW()),
  ('003_create_rosters_table.sql', NOW()),
  ('004_create_league_invites_table.sql', NOW()),
  ('005_add_invite_code_to_leagues.sql', NOW()),
  ('006_create_players_table.sql', NOW()),
  ('007_create_drafts_table.sql', NOW()),
  ('008_create_draft_order_table.sql', NOW()),
  ('009_create_draft_picks_table.sql', NOW()),
  ('010_create_draft_chat_messages_table.sql', NOW()),
  ('012_add_adp_to_players.sql', NOW()),
  ('013_add_league_type_column.sql', NOW()),
  ('014_create_league_chat_messages_table.sql', NOW()),
  ('015_create_matchups_table.sql', NOW()),
  ('016_create_player_stats_table.sql', NOW()),
  ('017_add_autodraft_to_draft_order.sql', NOW()),
  ('018_add_matchup_finalized_flag.sql', NOW()),
  ('019_create_weekly_lineups.sql', NOW()),
  ('020_create_waiver_claims_table.sql', NOW()),
  ('021_create_waiver_settings_table.sql', NOW()),
  ('022_add_waiver_fields_to_rosters.sql', NOW()),
  ('023_create_transactions_table.sql', NOW()),
  ('024_add_chess_timer_to_drafts.sql', NOW()),
  ('025_add_time_tracking_to_draft_order.sql', NOW()),
  ('026_enhance_pick_time_tracking.sql', NOW()),
  ('027_migrate_existing_drafts_timer_mode.sql', NOW()),
  ('028_create_trades_table.sql', NOW()),
  ('029_create_trade_items_table.sql', NOW()),
  ('030_make_league_chat_user_id_nullable.sql', NOW()),
  ('031_add_trade_notification_settings.sql', NOW()),
  ('032_add_auction_draft_types.sql', NOW()),
  ('033_create_auction_tables.sql', NOW()),
  ('034_rename_max_simultaneous_nominations.sql', NOW()),
  ('035_fix_auction_player_id_type.sql', NOW()),
  ('036_fix_draft_picks_player_id_type.sql', NOW()),
  ('037_fix_all_player_id_types.sql', NOW()),
  ('038_add_bid_increment_to_drafts.sql', NOW()),
  ('039_add_playoff_fields_to_matchups.sql', NOW()),
  ('040_create_playoff_settings.sql', NOW()),
  ('041_add_league_median_settings.sql', NOW()),
  ('042_add_pick_expiration_to_draft_order.sql', NOW()),
  ('042_create_draft_audit_log.sql', NOW()),
  ('043_add_injury_tracking.sql', NOW()),
  ('044_create_adp_tracking.sql', NOW()),
  ('045_add_advanced_stats.sql', NOW()),
  ('046_expand_scoring_settings.sql', NOW()),
  ('047_add_is_admin_to_users.sql', NOW()),
  ('048_add_performance_indexes.sql', NOW()),
  ('049_add_record_columns_to_rosters.sql', NOW()),
  ('050_add_waiver_position_to_rosters.sql', NOW()),
  ('051_create_keeper_selections.sql', NOW()),
  ('052_create_draft_pick_trades.sql', NOW()),
  ('053_create_season_history.sql', NOW()),
  ('054_add_current_season_to_leagues.sql', NOW()),
  ('055_add_traded_pick_to_draft_picks.sql', NOW()),
  ('056_create_push_tokens.sql', NOW()),
  ('057_create_notification_preferences.sql', NOW()),
  ('058_create_notification_history.sql', NOW()),
  ('059_add_derby_columns_to_drafts.sql', NOW()),
  ('060_create_draft_derby_table.sql', NOW()),
  ('061_create_draft_derby_selections_table.sql', NOW()),
  ('061_recreate_draft_derby_selections.sql', NOW()),
  ('062_add_league_chat_notification_preference.sql', NOW()),
  ('063_add_derby_skipped_user_timer.sql', NOW()),
  ('064_migrate_derby_schema.sql', NOW()),
  ('065_fix_draft_derby_status_constraint.sql', NOW()),
  ('066_add_bestball_setting.sql', NOW()),
  ('066_create_league_chat_read_status_table.sql', NOW()),
  ('069_create_payment_tables.sql', NOW()),
  ('070_add_draft_start_time_fields.sql', NOW())
ON CONFLICT (version) DO NOTHING;

-- Verify the seed
SELECT
  COUNT(*) as total_migrations_seeded,
  MIN(applied_at) as first_applied,
  MAX(applied_at) as last_applied
FROM schema_migrations;

-- Show all seeded migrations
SELECT version, applied_at
FROM schema_migrations
ORDER BY version;

-- Expected result: 70 migrations seeded
-- Next deploy will automatically run: 071, 072, 073, 074, 075
