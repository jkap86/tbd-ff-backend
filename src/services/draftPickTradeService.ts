import pool from "../config/database";

export interface DraftPickTrade {
  id: number;
  league_id: number;
  from_roster_id: number;
  to_roster_id: number;
  season: string;
  round: number;
  original_roster_id: number | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  proposed_at: Date;
  resolved_at: Date | null;
}

export interface ProposeDraftPickTradeInput {
  league_id: number;
  from_roster_id: number;
  to_roster_id: number;
  season: string;
  round: number;
  original_roster_id?: number | null;
}

/**
 * Propose a draft pick trade
 */
export async function proposeTrade(tradeData: ProposeDraftPickTradeInput): Promise<DraftPickTrade> {
  const { league_id, from_roster_id, to_roster_id, season, round, original_roster_id } = tradeData;

  // Validate round
  if (round < 1 || round > 20) {
    throw new Error("Draft round must be between 1 and 20");
  }

  // Validate different rosters
  if (from_roster_id === to_roster_id) {
    throw new Error("Cannot trade pick to yourself");
  }

  // Check if from_roster actually owns this pick
  const ownershipCheck = await checkPickOwnership(from_roster_id, season, round);
  if (!ownershipCheck.owns) {
    throw new Error(ownershipCheck.reason || "Roster does not own this pick");
  }

  try {
    const query = `
      INSERT INTO draft_pick_trades (
        league_id,
        from_roster_id,
        to_roster_id,
        season,
        round,
        original_roster_id,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *
    `;

    const values = [
      league_id,
      from_roster_id,
      to_roster_id,
      season,
      round,
      original_roster_id || from_roster_id // If not specified, from_roster is original owner
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error: any) {
    console.error("Error proposing draft pick trade:", error);
    throw error;
  }
}

/**
 * Accept a draft pick trade
 */
export async function acceptTrade(tradeId: number, acceptingRosterId: number): Promise<DraftPickTrade> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get trade details
    const tradeQuery = await client.query(
      `SELECT * FROM draft_pick_trades WHERE id = $1`,
      [tradeId]
    );

    if (tradeQuery.rows.length === 0) {
      throw new Error("Trade not found");
    }

    const trade = tradeQuery.rows[0];

    // Verify accepting roster is the recipient
    if (trade.to_roster_id !== acceptingRosterId) {
      throw new Error("Only the receiving roster can accept this trade");
    }

    // Verify trade is still pending
    if (trade.status !== 'pending') {
      throw new Error(`Trade is ${trade.status}, cannot accept`);
    }

    // Update trade status
    const updateResult = await client.query(
      `UPDATE draft_pick_trades
       SET status = 'accepted', resolved_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [tradeId]
    );

    // Update draft_picks table if draft already exists for this season
    // This marks which roster actually owns the pick
    await client.query(
      `UPDATE draft_picks
       SET traded_to_roster_id = $1
       WHERE roster_id = $2 AND round = $3
       AND draft_id IN (
         SELECT d.id FROM drafts d
         INNER JOIN leagues l ON d.league_id = l.id
         WHERE l.id = $4 AND l.current_season = $5
       )`,
      [trade.to_roster_id, trade.from_roster_id, trade.round, trade.league_id, trade.season]
    );

    await client.query('COMMIT');

    return updateResult.rows[0];
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error("Error accepting draft pick trade:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Decline a draft pick trade
 */
export async function declineTrade(tradeId: number, decliningRosterId: number): Promise<DraftPickTrade> {
  try {
    // Get trade details
    const tradeQuery = await pool.query(
      `SELECT * FROM draft_pick_trades WHERE id = $1`,
      [tradeId]
    );

    if (tradeQuery.rows.length === 0) {
      throw new Error("Trade not found");
    }

    const trade = tradeQuery.rows[0];

    // Verify declining roster is the recipient
    if (trade.to_roster_id !== decliningRosterId) {
      throw new Error("Only the receiving roster can decline this trade");
    }

    // Verify trade is still pending
    if (trade.status !== 'pending') {
      throw new Error(`Trade is ${trade.status}, cannot decline`);
    }

    // Update trade status
    const result = await pool.query(
      `UPDATE draft_pick_trades
       SET status = 'declined', resolved_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [tradeId]
    );

    return result.rows[0];
  } catch (error: any) {
    console.error("Error declining draft pick trade:", error);
    throw error;
  }
}

/**
 * Get all tradeable picks for a roster
 * Returns picks they can trade (haven't been traded away)
 */
export async function getTradeablePicksByRoster(
  rosterId: number,
  leagueId: number,
  season: string
): Promise<any[]> {
  try {
    // Get all picks this roster originally owned
    const query = `
      SELECT
        $3 as season,
        generate_series as round,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM draft_pick_trades
            WHERE from_roster_id = $1
            AND round = generate_series
            AND season = $3
            AND status = 'accepted'
          ) THEN FALSE
          ELSE TRUE
        END as tradeable
      FROM generate_series(1, 18) -- Assuming 18 rounds max
      WHERE NOT EXISTS (
        SELECT 1 FROM draft_pick_trades
        WHERE from_roster_id = $1
        AND round = generate_series
        AND season = $3
        AND status = 'accepted'
      )
    `;

    const result = await pool.query(query, [rosterId, leagueId, season]);
    return result.rows.filter(r => r.tradeable);
  } catch (error: any) {
    console.error("Error getting tradeable picks:", error);
    throw error;
  }
}

/**
 * Get all draft pick trades for a league
 */
export async function getTradesByLeague(leagueId: number): Promise<DraftPickTrade[]> {
  try {
    const query = `
      SELECT t.*,
        r1.settings->>'team_name' as from_team_name,
        r2.settings->>'team_name' as to_team_name,
        u1.username as from_username,
        u2.username as to_username
      FROM draft_pick_trades t
      INNER JOIN rosters r1 ON t.from_roster_id = r1.id
      INNER JOIN rosters r2 ON t.to_roster_id = r2.id
      INNER JOIN users u1 ON r1.user_id = u1.id
      INNER JOIN users u2 ON r2.user_id = u2.id
      WHERE t.league_id = $1
      ORDER BY t.proposed_at DESC
    `;

    const result = await pool.query(query, [leagueId]);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting trades by league:", error);
    throw error;
  }
}

/**
 * Check if a roster owns a specific pick
 */
async function checkPickOwnership(
  rosterId: number,
  season: string,
  round: number
): Promise<{ owns: boolean; reason?: string }> {
  try {
    // Check if this pick has been traded away
    const tradeCheck = await pool.query(
      `SELECT id FROM draft_pick_trades
       WHERE from_roster_id = $1 AND season = $2 AND round = $3 AND status = 'accepted'`,
      [rosterId, season, round]
    );

    if (tradeCheck.rows.length > 0) {
      return { owns: false, reason: "This pick has already been traded away" };
    }

    return { owns: true };
  } catch (error: any) {
    return { owns: false, reason: error.message || "Failed to verify pick ownership" };
  }
}
