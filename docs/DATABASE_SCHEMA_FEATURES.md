# Database Schema Documentation: Feature Tables

This document provides comprehensive schema documentation for the feature tables in the TBD Fantasy Football database.

**Last Updated:** 2025-01-14
**Database:** PostgreSQL

---

## Summary

This documentation covers **10 feature tables** across 7 functional categories.

### Tables Documented

1. **Auction Tables (2):** auction_nominations, auction_bids
2. **Waiver Tables (2):** waiver_claims, waiver_settings
3. **Trade Tables (2):** trades, trade_items
4. **Matchup Tables (1):** matchups
5. **Lineup Tables (1):** weekly_lineups
6. **Transaction Tables (1):** transactions
7. **Stats Tables (1):** player_stats

---

## Key Relationships

- **Auctions:** draft → nominations → bids
- **Waivers:** league → waiver_settings (1:1), league → waiver_claims (1:N)
- **Trades:** league → trades → trade_items
- **Matchups:** league → matchups (supports playoffs and median matchups)
- **Lineups:** roster → weekly_lineups (JSONB starters array)
- **Transactions:** league/roster → transactions (JSONB adds/drops)
- **Stats:** players → player_stats (60+ stat columns)

---

## Critical Unique Constraints

| Table | Unique Constraint | Purpose |
|-------|------------------|---------|
| auction_nominations | (draft_id, player_id) | Each player nominated once per draft |
| waiver_settings | league_id | One settings record per league |
| matchups | (league_id, week, roster1_id) | roster1 appears once per week |
| weekly_lineups | (roster_id, week, season) | One lineup per roster per week |
| player_stats | (player_id, week, season, season_type) | One stat line per player per week |

**Note:** waiver_claims has NO unique constraint - multiple claims can exist for the same player.

---

## JSONB Field Structures

### weekly_lineups.starters

Array of starter slot assignments (includes bench slots):

```json
[
  {"slot": "QB", "player_id": 4881},
  {"slot": "RB1", "player_id": 7523},
  {"slot": "FLEX", "player_id": 7571},
  {"slot": "BN1", "player_id": 5927},
  {"slot": "BN2", "player_id": null}
]
```

**Structure:** Each object has `slot` (string) and `player_id` (integer or null)

### transactions.adds / transactions.drops

Arrays of player IDs (VARCHAR):

```json
{
  "adds": ["4881", "7523"],
  "drops": ["6794"]
}
```

---

## Business Logic Highlights

### Auction Bids (Proxy Bidding)

- **bid_amount:** Visible bid (calculated for proxy bids)
- **max_bid:** Hidden maximum the user is willing to pay
- **Winner pays:** Minimum needed to beat 2nd place

### Waiver Claims

**Processing Order:**
- **FAAB:** Highest bid first, then earliest created_at
- **Rolling:** By waiver_position, then earliest created_at

**Transaction Isolation:** SERIALIZABLE during batch processing

**Status Flow:** pending → processed | failed | cancelled

### Trades

**Status Flow:** pending → accepted | rejected | cancelled

**Authorization:**
- Accept/Reject: Receiver only
- Cancel: Proposer only

### Matchups

**Features:**
- Standard head-to-head matchups
- Bye weeks (roster2_id = NULL)
- Playoff matchups with seeding, brackets, tiebreakers
- League median matchups (is_median_matchup = true)

**Playoff Fields:**
- playoff_round: wildcard, quarterfinal, semifinal, final, third_place
- seed1/seed2: Playoff seeding (1-12)
- tiebreaker_used: Method used to break ties

### Player Stats

**Coverage:** 60+ columns including:
- Passing: attempts, completions, yards, TDs, INTs, 2pt, first downs, 40+ plays
- Rushing: attempts, yards, TDs, 2pt, first downs, 40+ plays
- Receiving: targets, receptions, yards, TDs, 2pt, first downs, 40+ plays
- Kicking: FGs by distance, extra points
- Defense/ST: TDs, interceptions, fumbles, sacks, safeties
- IDP: tackles, TFL, QB hits, passes defended

---

## Foreign Key Cascade Summary

**Deleting a league cascades to:**
- waiver_settings, waiver_claims, trades, matchups, transactions

**Deleting a roster cascades to:**
- waiver_claims, transactions, trade_items, auction_bids, weekly_lineups

**Deleting a draft cascades to:**
- auction_nominations → auction_bids

**Deleting a trade cascades to:**
- trade_items

---

## Migration File Reference

### Auction Tables
- 033_create_auction_tables.sql
- 035_fix_auction_player_id_type.sql
- 087_add_bid_deadline_to_nominations.sql

### Waiver Tables
- 020_create_waiver_claims_table.sql
- 021_create_waiver_settings_table.sql
- 037_fix_all_player_id_types.sql

### Trade Tables
- 028_create_trades_table.sql
- 029_create_trade_items_table.sql

### Matchup Tables
- 015_create_matchups_table.sql
- 018_add_matchup_finalized_flag.sql
- 039_add_playoff_fields_to_matchups.sql
- 041_add_league_median_settings.sql

### Lineup Tables
- 019_create_weekly_lineups.sql

### Transaction Tables
- 023_create_transactions_table.sql

### Stats Tables
- 016_create_player_stats_table.sql
- 045_add_advanced_stats.sql

### Performance Indexes
- 048_add_performance_indexes.sql
- 074_add_missing_performance_indexes.sql
- 089_add_missing_composite_indexes.sql

---

## Common Query Patterns

### Get active auction nominations
```sql
SELECT * FROM auction_nominations WHERE draft_id = ? AND status = 'active';
```

### Get pending waiver claims for processing
```sql
SELECT * FROM waiver_claims
WHERE league_id = ? AND status = 'pending'
ORDER BY bid_amount DESC, created_at ASC;
```

### Get roster weekly lineup
```sql
SELECT starters FROM weekly_lineups
WHERE roster_id = ? AND week = ? AND season = ?;
```

### Get player season stats aggregate
```sql
SELECT SUM(passing_yards), SUM(passing_touchdowns)
FROM player_stats
WHERE player_id = ? AND season = ? AND season_type = 'regular';
```

---

## Testing Considerations

### Critical Test Cases

**Auction Bids:**
- Verify proxy bidding calculation
- Test budget validation
- Ensure only one is_winning = true per nomination

**Waiver Claims:**
- Test FAAB processing order (highest bid wins)
- Test rolling waiver order (by waiver_position)
- Verify SERIALIZABLE transaction isolation
- Test failure reasons (insufficient FAAB, player unavailable)

**Trades:**
- Verify atomic processing
- Test authorization (receiver accepts, proposer cancels)
- Ensure both rosters get transaction records

**Matchups:**
- Test bye weeks (roster2_id = NULL)
- Test playoff bracket generation
- Verify median matchup calculations

**Weekly Lineups:**
- Verify JSONB structure integrity
- Test lineup locking
- Ensure bench slots (BN prefix) are included

---

## Related Documentation

- **[TRUTHS.md](./TRUTHS.md)** - System invariants, constraints, and business rules
- **src/migrations/** - Complete schema definitions and modifications

---

## Table Summary

| Table | Rows Documented | Key Features |
|-------|----------------|--------------|
| auction_nominations | 11 columns | Proxy bidding, deadline tracking |
| auction_bids | 8 columns | Proxy bidding support, is_winning flag |
| waiver_claims | 11 columns | FAAB/rolling processing, failure tracking |
| waiver_settings | 9 columns | League-level waiver configuration |
| trades | 12 columns | Atomic processing, status flow |
| trade_items | 6 columns | Player movement tracking |
| matchups | 22 columns | Playoffs, median matchups, tiebreakers |
| weekly_lineups | 7 columns | JSONB starters array |
| transactions | 10 columns | JSONB adds/drops arrays |
| player_stats | 60+ columns | Comprehensive stat tracking |

**Total:** 10 tables, 150+ columns documented

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-14 | Initial feature schema documentation |

---

**For Developers:** View current schema using:

```sql
\d+ table_name  -- PostgreSQL describe table
```

This documentation reflects the schema as of the latest migrations. Always verify against the actual database for production environments.
