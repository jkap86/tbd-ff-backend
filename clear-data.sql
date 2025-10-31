-- Clear all data from tables while preserving structure
-- Order matters due to foreign key constraints

-- Clear dependent tables first
TRUNCATE TABLE draft_chat_messages CASCADE;
TRUNCATE TABLE draft_picks CASCADE;
TRUNCATE TABLE draft_order CASCADE;
TRUNCATE TABLE auction_bids CASCADE;
TRUNCATE TABLE auction_nominations CASCADE;
TRUNCATE TABLE weekly_lineups CASCADE;
TRUNCATE TABLE player_stats CASCADE;
TRUNCATE TABLE matchups CASCADE;
TRUNCATE TABLE waiver_claims CASCADE;
TRUNCATE TABLE waiver_settings CASCADE;
TRUNCATE TABLE transactions CASCADE;
TRUNCATE TABLE trade_items CASCADE;
TRUNCATE TABLE trades CASCADE;
TRUNCATE TABLE league_chat_messages CASCADE;
TRUNCATE TABLE league_invites CASCADE;
TRUNCATE TABLE rosters CASCADE;
TRUNCATE TABLE drafts CASCADE;
TRUNCATE TABLE playoff_settings CASCADE;
TRUNCATE TABLE league_median_settings CASCADE;
TRUNCATE TABLE leagues CASCADE;
TRUNCATE TABLE players CASCADE;
TRUNCATE TABLE player_adp CASCADE;
TRUNCATE TABLE users CASCADE;

-- Reset sequences to start IDs from 1
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE leagues_id_seq RESTART WITH 1;
ALTER SEQUENCE rosters_id_seq RESTART WITH 1;
ALTER SEQUENCE drafts_id_seq RESTART WITH 1;
ALTER SEQUENCE draft_picks_id_seq RESTART WITH 1;
ALTER SEQUENCE matchups_id_seq RESTART WITH 1;
ALTER SEQUENCE waiver_claims_id_seq RESTART WITH 1;
ALTER SEQUENCE transactions_id_seq RESTART WITH 1;
ALTER SEQUENCE trades_id_seq RESTART WITH 1;
ALTER SEQUENCE auction_nominations_id_seq RESTART WITH 1;
ALTER SEQUENCE auction_bids_id_seq RESTART WITH 1;

SELECT 'All data cleared successfully!' as status;
