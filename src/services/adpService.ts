import pool from "../config/database";

/**
 * Calculate ADP from completed drafts
 */
export async function calculateADP(season: string): Promise<{
  updated: number;
  errors: string[];
}> {
  console.log(`[ADP] Calculating ADP for ${season} season...`);

  const errors: string[] = [];

  try {
    // Calculate ADP for all draft types combined
    await calculateADPByType(season, "all", null);

    // Calculate ADP for snake drafts
    await calculateADPByType(season, "snake", null);

    // Calculate ADP for auction drafts
    await calculateADPByType(season, "auction", null);

    // Calculate ADP by league size (10, 12, 14-team)
    for (const size of [10, 12, 14]) {
      await calculateADPByType(season, "all", size);
      await calculateADPByType(season, "snake", size);
    }

    // Get count of updated records
    const countResult = await pool.query(
      "SELECT COUNT(*) as count FROM player_adp WHERE season = $1",
      [season]
    );
    const updated = parseInt(countResult.rows[0]?.count || "0");

    console.log(`[ADP] Calculation complete for ${season}. ${updated} ADP records.`);
    return { updated, errors };
  } catch (error: any) {
    console.error("[ADP] Calculation failed:", error);
    throw error;
  }
}

async function calculateADPByType(
  season: string,
  draftType: string,
  leagueSize: number | null
): Promise<void> {
  // Build query to get average pick position per player
  let query = `
    INSERT INTO player_adp (player_id, season, draft_type, league_size, adp, min_pick, max_pick, times_drafted, last_updated)
    SELECT
      dp.player_id,
      $1 as season,
      $2 as draft_type,
      $3 as league_size,
      AVG(dp.pick_number)::DECIMAL(5,2) as adp,
      MIN(dp.pick_number) as min_pick,
      MAX(dp.pick_number) as max_pick,
      COUNT(*)::INTEGER as times_drafted,
      CURRENT_TIMESTAMP
    FROM draft_picks dp
    INNER JOIN drafts d ON d.id = dp.draft_id
    INNER JOIN leagues l ON l.id = d.league_id
    WHERE l.season = $1
    AND d.status = 'completed'
    AND dp.player_id IS NOT NULL
  `;

  const params: any[] = [season, draftType, leagueSize];

  // Filter by draft type if not 'all'
  if (draftType !== "all") {
    query += ` AND d.draft_type = $2`;
  }

  // Filter by league size if specified
  if (leagueSize !== null) {
    query += ` AND l.total_rosters = $3`;
  }

  query += `
    GROUP BY dp.player_id
    HAVING COUNT(*) >= 3
    ON CONFLICT (player_id, season, draft_type, league_size)
    DO UPDATE SET
      adp = EXCLUDED.adp,
      min_pick = EXCLUDED.min_pick,
      max_pick = EXCLUDED.max_pick,
      times_drafted = EXCLUDED.times_drafted,
      last_updated = CURRENT_TIMESTAMP
  `;

  await pool.query(query, params);
}

/**
 * Get ADP for a specific player
 */
export async function getPlayerADP(
  playerId: string,
  season: string,
  draftType: string = "all",
  leagueSize: number | null = null
): Promise<any | null> {
  const result = await pool.query(
    `SELECT * FROM player_adp
     WHERE player_id = $1
     AND season = $2
     AND draft_type = $3
     AND ($4::INTEGER IS NULL OR league_size = $4)
     ORDER BY
       CASE WHEN league_size IS NULL THEN 0 ELSE 1 END,
       league_size
     LIMIT 1`,
    [playerId, season, draftType, leagueSize]
  );

  return result.rows[0] || null;
}

/**
 * Get top players by ADP
 */
export async function getTopPlayersByADP(
  season: string,
  limit: number = 200,
  draftType: string = "all",
  leagueSize: number | null = null,
  position?: string
): Promise<any[]> {
  let query = `
    SELECT
      adp.player_id,
      adp.adp,
      adp.min_pick,
      adp.max_pick,
      adp.times_drafted,
      p.full_name,
      p.position,
      p.team
    FROM player_adp adp
    INNER JOIN players p ON p.player_id = adp.player_id
    WHERE adp.season = $1
    AND adp.draft_type = $2
    AND ($3::INTEGER IS NULL OR adp.league_size = $3)
  `;

  const params: any[] = [season, draftType, leagueSize];
  let paramCount = 3;

  if (position) {
    paramCount++;
    query += ` AND p.position = $${paramCount}`;
    params.push(position);
  }

  query += ` ORDER BY adp.adp ASC LIMIT $${paramCount + 1}`;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Sync Sleeper ADP as fallback
 * Use search_rank from Sleeper when app doesn't have enough data
 */
export async function syncSleeperADP(season: string): Promise<void> {
  console.log("[ADP] Syncing Sleeper search_rank as ADP fallback...");

  // This uses the existing search_rank field in players table
  // We'll create virtual ADP records based on search_rank for players not drafted yet
  await pool.query(
    `
    INSERT INTO player_adp (player_id, season, draft_type, league_size, adp, min_pick, max_pick, times_drafted, last_updated)
    SELECT
      player_id,
      $1 as season,
      'all' as draft_type,
      NULL as league_size,
      search_rank::DECIMAL(5,2) as adp,
      search_rank as min_pick,
      search_rank as max_pick,
      0 as times_drafted,
      CURRENT_TIMESTAMP
    FROM players
    WHERE search_rank IS NOT NULL
    AND search_rank > 0
    AND NOT EXISTS (
      SELECT 1 FROM player_adp
      WHERE player_adp.player_id = players.player_id
      AND player_adp.season = $1
      AND player_adp.draft_type = 'all'
      AND player_adp.league_size IS NULL
    )
    ON CONFLICT (player_id, season, draft_type, league_size)
    DO NOTHING
  `,
    [season]
  );

  console.log("[ADP] Sleeper ADP sync complete");
}
