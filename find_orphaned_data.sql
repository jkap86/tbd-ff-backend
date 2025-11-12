-- Find all orphaned player_id references before adding foreign keys
-- Run this to see what data needs cleanup

-- 1. Orphaned player_stats records
SELECT 'player_stats' as table_name, COUNT(*) as orphaned_count
FROM player_stats ps
WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.player_id = ps.player_id);

SELECT 'player_stats_sample' as info, player_id, COUNT(*) as stat_count
FROM player_stats ps
WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.player_id = ps.player_id)
GROUP BY player_id
ORDER BY stat_count DESC
LIMIT 10;

-- 2. Orphaned draft_picks records
SELECT 'draft_picks' as table_name, COUNT(*) as orphaned_count
FROM draft_picks dp
WHERE dp.player_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM players p WHERE p.player_id = dp.player_id);

-- 3. Orphaned auction_nominations records
SELECT 'auction_nominations' as table_name, COUNT(*) as orphaned_count
FROM auction_nominations an
WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.player_id = an.player_id);

-- 4. Orphaned waiver_claims.player_id records
SELECT 'waiver_claims.player_id' as table_name, COUNT(*) as orphaned_count
FROM waiver_claims wc
WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.player_id = wc.player_id);

-- 5. Orphaned waiver_claims.drop_player_id records
SELECT 'waiver_claims.drop_player_id' as table_name, COUNT(*) as orphaned_count
FROM waiver_claims wc
WHERE wc.drop_player_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM players p WHERE p.player_id = wc.drop_player_id);

-- 6. Orphaned trade_items records
SELECT 'trade_items' as table_name, COUNT(*) as orphaned_count
FROM trade_items ti
WHERE ti.player_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM players p WHERE p.player_id = ti.player_id);

-- 7. Orphaned keeper_selections records
SELECT 'keeper_selections' as table_name, COUNT(*) as orphaned_count
FROM keeper_selections ks
WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.player_id = ks.player_id);

-- 8. Orphaned adp_tracking records
SELECT 'adp_tracking' as table_name, COUNT(*) as orphaned_count
FROM adp_tracking at
WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.player_id = at.player_id);

-- Summary
SELECT 'TOTAL ORPHANED RECORDS' as summary;
