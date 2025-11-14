import pool from "../config/database";
import { logger } from "../config/logger";
import { setTransactionTimeouts } from "../utils/transactionTimeout";
import { BaseRepository } from "./BaseRepository";

export interface OpponentSelectionOrder {
  id: number;
  league_id: number;
  roster_id: number;
  selection_position: number;
  created_at: Date;
}

class OpponentSelectionOrderRepository extends BaseRepository<OpponentSelectionOrder> {
  constructor() {
    super('opponent_selection_order', 'id');
  }
}

const opponentSelectionOrderRepo = new OpponentSelectionOrderRepository();

/**
 * Set opponent selection order for a league
 */
export async function setOpponentSelectionOrder(
  leagueId: number,
  rosterPositions: Array<{ roster_id: number; selection_position: number }>
): Promise<OpponentSelectionOrder[]> {
  const client = await pool.connect();
  await setTransactionTimeouts(client);
  try {
    await client.query("BEGIN");

    // Delete existing opponent selection order if any
    await client.query("DELETE FROM opponent_selection_order WHERE league_id = $1", [
      leagueId,
    ]);

    // Insert new opponent selection order
    const orders: OpponentSelectionOrder[] = [];
    for (const { roster_id, selection_position } of rosterPositions) {
      const query = `
        INSERT INTO opponent_selection_order (league_id, roster_id, selection_position)
        VALUES ($1, $2, $3)
        RETURNING *
      `;

      const result = await client.query(query, [
        leagueId,
        roster_id,
        selection_position,
      ]);
      orders.push(result.rows[0]);
    }

    await client.query("COMMIT");
    logger.info(`[OpponentSelectionOrder] Set opponent selection order for league ${leagueId}`);
    return orders;
  } catch (error: any) {
    await client.query("ROLLBACK");
    logger.error("Error setting opponent selection order:", { error });

    if (error.code === "23505") {
      throw new Error("Duplicate selection position or roster in order");
    }

    throw new Error("Error setting opponent selection order");
  } finally {
    client.release();
  }
}

/**
 * Get opponent selection order for a league
 */
export async function getOpponentSelectionOrder(leagueId: number): Promise<OpponentSelectionOrder[]> {
  return opponentSelectionOrderRepo.findBy('league_id', leagueId, 'selection_position ASC');
}

/**
 * Get opponent selection order with roster and user details
 */
export async function getOpponentSelectionOrderWithDetails(leagueId: number): Promise<any[]> {
  try {
    const query = `
      SELECT
        o.*,
        r.roster_id as roster_number,
        r.settings,
        u.id as user_id,
        u.username
      FROM opponent_selection_order o
      LEFT JOIN rosters r ON o.roster_id = r.id
      LEFT JOIN users u ON r.user_id = u.id
      WHERE o.league_id = $1
      ORDER BY o.selection_position ASC
    `;

    const result = await pool.query(query, [leagueId]);

    // Add team_name from settings if available
    return result.rows.map(row => ({
      ...row,
      team_name: row.settings?.team_name || null,
    }));
  } catch (error) {
    logger.error("Error getting opponent selection order with details:", { error });
    throw new Error("Error getting opponent selection order with details");
  }
}

/**
 * Randomize opponent selection order
 */
export async function randomizeOpponentSelectionOrder(
  leagueId: number,
  rosterIds: number[]
): Promise<OpponentSelectionOrder[]> {
  try {
    // Shuffle roster IDs
    const shuffled = [...rosterIds].sort(() => Math.random() - 0.5);

    // Create roster position pairs
    const rosterPositions = shuffled.map((roster_id, index) => ({
      roster_id,
      selection_position: index + 1,
    }));

    logger.info(`[OpponentSelectionOrder] Randomizing order for league ${leagueId}`);
    return await setOpponentSelectionOrder(leagueId, rosterPositions);
  } catch (error) {
    logger.error("Error randomizing opponent selection order:", { error });
    throw new Error("Error randomizing opponent selection order");
  }
}

/**
 * Delete opponent selection order for a league
 */
export async function deleteOpponentSelectionOrder(leagueId: number): Promise<void> {
  try {
    const query = `DELETE FROM opponent_selection_order WHERE league_id = $1`;
    await pool.query(query, [leagueId]);
    logger.info(`[OpponentSelectionOrder] Deleted opponent selection order for league ${leagueId}`);
  } catch (error) {
    logger.error("Error deleting opponent selection order:", { error });
    throw new Error("Error deleting opponent selection order");
  }
}
