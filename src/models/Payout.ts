import pool from "../config/database";

export interface LeaguePayout {
  id: number;
  league_id: number;
  roster_id: number;
  season: string;
  amount: number;
  rank: number;
  payout_type: "winner" | "runner_up" | "third_place" | "regular_season" | "points_leader" | "other";
  description?: string;
  paid_out: boolean;
  paid_out_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePayoutInput {
  league_id: number;
  roster_id: number;
  season: string;
  amount: number;
  rank: number;
  payout_type: "winner" | "runner_up" | "third_place" | "regular_season" | "points_leader" | "other";
  description?: string;
  paid_out?: boolean;
}

export interface PayoutWithDetails extends LeaguePayout {
  username?: string;
  team_name?: string;
  roster_number?: number;
}

/**
 * Get all payouts for a league
 */
export async function getByLeagueId(
  leagueId: number,
  season?: string
): Promise<PayoutWithDetails[]> {
  try {
    let query = `
      SELECT
        p.*,
        u.username,
        r.roster_id as roster_number,
        COALESCE(r.settings->>'team_name', u.username, 'Team ' || r.roster_id) as team_name
      FROM league_payouts p
      INNER JOIN rosters r ON p.roster_id = r.id
      INNER JOIN users u ON r.user_id = u.id
      WHERE p.league_id = $1
    `;

    const params: any[] = [leagueId];

    if (season) {
      query += ` AND p.season = $2`;
      params.push(season);
    }

    query += ` ORDER BY p.season DESC, p.rank ASC`;

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting payouts by league:", error);
    throw new Error("Error getting payouts by league");
  }
}

/**
 * Get payout history for a specific roster
 */
export async function getByRosterId(rosterId: number): Promise<LeaguePayout[]> {
  try {
    const query = `
      SELECT * FROM league_payouts
      WHERE roster_id = $1
      ORDER BY season DESC, rank ASC
    `;

    const result = await pool.query(query, [rosterId]);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting payouts by roster:", error);
    throw new Error("Error getting payouts by roster");
  }
}

/**
 * Get all payouts for a user across all leagues
 */
export async function getByUserId(userId: number): Promise<PayoutWithDetails[]> {
  try {
    const query = `
      SELECT
        p.*,
        l.name as league_name,
        r.roster_id as roster_number,
        COALESCE(r.settings->>'team_name', u.username, 'Team ' || r.roster_id) as team_name
      FROM league_payouts p
      INNER JOIN rosters r ON p.roster_id = r.id
      INNER JOIN users u ON r.user_id = u.id
      INNER JOIN leagues l ON p.league_id = l.id
      WHERE u.id = $1
      ORDER BY p.season DESC, p.amount DESC
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting payouts by user:", error);
    throw new Error("Error getting payouts by user");
  }
}

/**
 * Create a new payout record
 */
export async function create(
  payout: CreatePayoutInput
): Promise<LeaguePayout> {
  const {
    league_id,
    roster_id,
    season,
    amount,
    rank,
    payout_type,
    description,
    paid_out = false,
  } = payout;

  try {
    const query = `
      INSERT INTO league_payouts (
        league_id,
        roster_id,
        season,
        amount,
        rank,
        payout_type,
        description,
        paid_out
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      league_id,
      roster_id,
      season,
      amount,
      rank,
      payout_type,
      description || null,
      paid_out,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error: any) {
    console.error("Error creating payout:", error);

    // Handle unique constraint violations if they exist
    if (error.code === "23505") {
      throw new Error("Payout already exists for this roster, league, and season");
    }

    // Handle foreign key violations
    if (error.code === "23503") {
      if (error.constraint?.includes("league")) {
        throw new Error("League not found");
      }
      if (error.constraint?.includes("roster")) {
        throw new Error("Roster not found");
      }
    }

    throw new Error("Error creating payout");
  }
}

/**
 * Update a payout record
 */
export async function update(
  id: number,
  updates: Partial<LeaguePayout>
): Promise<LeaguePayout | null> {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Build dynamic update query based on provided fields
    if (updates.amount !== undefined) {
      fields.push(`amount = $${paramCount}`);
      values.push(updates.amount);
      paramCount++;
    }

    if (updates.rank !== undefined) {
      fields.push(`rank = $${paramCount}`);
      values.push(updates.rank);
      paramCount++;
    }

    if (updates.payout_type !== undefined) {
      fields.push(`payout_type = $${paramCount}`);
      values.push(updates.payout_type);
      paramCount++;
    }

    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount}`);
      values.push(updates.description);
      paramCount++;
    }

    if (updates.paid_out !== undefined) {
      fields.push(`paid_out = $${paramCount}`);
      values.push(updates.paid_out);
      paramCount++;

      // If marking as paid, set the timestamp
      if (updates.paid_out) {
        fields.push(`paid_out_at = CURRENT_TIMESTAMP`);
      }
    }

    if (fields.length === 0) {
      // No updates provided, return the existing record
      const query = "SELECT * FROM league_payouts WHERE id = $1";
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    }

    // Always update the updated_at timestamp
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id);

    const query = `
      UPDATE league_payouts
      SET ${fields.join(", ")}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error updating payout:", error);
    throw new Error("Error updating payout");
  }
}

/**
 * Create multiple payouts at once (batch operation)
 * Uses a transaction to ensure all-or-nothing
 */
export async function createPayoutStructure(
  leagueId: number,
  season: string,
  structure: Array<{
    rosterId: number;
    amount: number;
    rank: number;
    type: "winner" | "runner_up" | "third_place" | "regular_season" | "points_leader" | "other";
    description?: string;
  }>
): Promise<LeaguePayout[]> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const createdPayouts: LeaguePayout[] = [];

    for (const payout of structure) {
      const query = `
        INSERT INTO league_payouts (
          league_id,
          roster_id,
          season,
          amount,
          rank,
          payout_type,
          description,
          paid_out
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const values = [
        leagueId,
        payout.rosterId,
        season,
        payout.amount,
        payout.rank,
        payout.type,
        payout.description || null,
        false, // payouts start as unpaid
      ];

      const result = await client.query(query, values);
      createdPayouts.push(result.rows[0]);
    }

    await client.query("COMMIT");
    return createdPayouts;
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Error creating payout structure:", error);

    // Handle specific errors
    if (error.code === "23505") {
      throw new Error("One or more payouts already exist for this league and season");
    }

    if (error.code === "23503") {
      if (error.constraint?.includes("league")) {
        throw new Error("League not found");
      }
      if (error.constraint?.includes("roster")) {
        throw new Error("One or more rosters not found");
      }
    }

    throw new Error("Error creating payout structure");
  } finally {
    client.release();
  }
}

/**
 * Delete a payout record
 */
export async function deletePayout(id: number): Promise<boolean> {
  try {
    const query = `
      DELETE FROM league_payouts
      WHERE id = $1
      RETURNING id
    `;

    const result = await pool.query(query, [id]);
    return result.rows.length > 0;
  } catch (error: any) {
    console.error("Error deleting payout:", error);
    throw new Error("Error deleting payout");
  }
}

/**
 * Get a single payout by ID
 */
export async function getById(id: number): Promise<LeaguePayout | null> {
  try {
    const query = `SELECT * FROM league_payouts WHERE id = $1`;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error getting payout by ID:", error);
    throw new Error("Error getting payout by ID");
  }
}

/**
 * Mark a payout as paid
 */
export async function markAsPaid(id: number): Promise<LeaguePayout | null> {
  try {
    const query = `
      UPDATE league_payouts
      SET paid_out = true,
          paid_out_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error marking payout as paid:", error);
    throw new Error("Error marking payout as paid");
  }
}

/**
 * Get total payout amount for a league/season
 */
export async function getTotalPayoutAmount(
  leagueId: number,
  season?: string
): Promise<number> {
  try {
    let query = `
      SELECT COALESCE(SUM(amount), 0) as total
      FROM league_payouts
      WHERE league_id = $1
    `;

    const params: any[] = [leagueId];

    if (season) {
      query += ` AND season = $2`;
      params.push(season);
    }

    const result = await pool.query(query, params);
    return parseFloat(result.rows[0].total) || 0;
  } catch (error: any) {
    console.error("Error getting total payout amount:", error);
    throw new Error("Error getting total payout amount");
  }
}
