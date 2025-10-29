import pool from "../config/database";

export interface Transaction {
  id: number;
  league_id: number;
  roster_id: number;
  transaction_type: "waiver" | "free_agent" | "trade" | "add" | "drop";
  status: "processed" | "pending" | "failed";
  adds: number[]; // Array of player IDs added
  drops: number[]; // Array of player IDs dropped
  waiver_bid: number | null;
  processed_at: Date;
  created_at: Date;
}

export interface CreateTransactionInput {
  league_id: number;
  roster_id: number;
  transaction_type: "waiver" | "free_agent" | "trade" | "add" | "drop";
  status?: "processed" | "pending" | "failed";
  adds?: number[];
  drops?: number[];
  waiver_bid?: number | null;
}

/**
 * Create a new transaction
 */
export async function createTransaction(
  data: CreateTransactionInput
): Promise<Transaction> {
  const {
    league_id,
    roster_id,
    transaction_type,
    status = "processed",
    adds = [],
    drops = [],
    waiver_bid = null,
  } = data;

  try {
    const query = `
      INSERT INTO transactions (
        league_id,
        roster_id,
        transaction_type,
        status,
        adds,
        drops,
        waiver_bid,
        processed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const values = [
      league_id,
      roster_id,
      transaction_type,
      status,
      JSON.stringify(adds),
      JSON.stringify(drops),
      waiver_bid,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error: any) {
    console.error("Error creating transaction:", error);
    throw new Error("Error creating transaction");
  }
}

/**
 * Get all transactions for a league
 */
export async function getTransactionsByLeague(
  leagueId: number,
  limit: number = 50
): Promise<any[]> {
  try {
    const query = `
      SELECT t.*, r.user_id, u.username, r.roster_id
      FROM transactions t
      JOIN rosters r ON t.roster_id = r.id
      JOIN users u ON r.user_id = u.id
      WHERE t.league_id = $1
      ORDER BY t.processed_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [leagueId, limit]);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting transactions by league:", error);
    throw new Error("Error getting transactions by league");
  }
}

/**
 * Get all transactions for a specific roster
 */
export async function getTransactionsByRoster(
  rosterId: number,
  limit: number = 50
): Promise<Transaction[]> {
  try {
    const query = `
      SELECT * FROM transactions
      WHERE roster_id = $1
      ORDER BY processed_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [rosterId, limit]);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting transactions by roster:", error);
    throw new Error("Error getting transactions by roster");
  }
}

/**
 * Get a single transaction by ID
 */
export async function getTransactionById(transactionId: number): Promise<Transaction | null> {
  try {
    const query = `SELECT * FROM transactions WHERE id = $1`;
    const result = await pool.query(query, [transactionId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error getting transaction by ID:", error);
    throw new Error("Error getting transaction by ID");
  }
}

/**
 * Get recent transactions for a league with player details
 */
export async function getTransactionsWithPlayerDetails(
  leagueId: number,
  limit: number = 50
): Promise<any[]> {
  try {
    const query = `
      SELECT t.*, r.user_id, u.username, r.roster_id
      FROM transactions t
      JOIN rosters r ON t.roster_id = r.id
      JOIN users u ON r.user_id = u.id
      WHERE t.league_id = $1
      ORDER BY t.processed_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [leagueId, limit]);
    const transactions = result.rows;

    // Get all unique player IDs from transactions
    const playerIds = new Set<number>();
    transactions.forEach((txn) => {
      if (txn.adds && Array.isArray(txn.adds)) {
        txn.adds.forEach((id: number) => playerIds.add(id));
      }
      if (txn.drops && Array.isArray(txn.drops)) {
        txn.drops.forEach((id: number) => playerIds.add(id));
      }
    });

    // Fetch player details if there are any player IDs
    let playerMap: { [key: number]: any } = {};
    if (playerIds.size > 0) {
      const playerQuery = `
        SELECT id, player_id, full_name, position, team
        FROM players
        WHERE id = ANY($1)
      `;
      const playerResult = await pool.query(playerQuery, [Array.from(playerIds)]);
      playerMap = playerResult.rows.reduce((acc: any, player: any) => {
        acc[player.id] = player;
        return acc;
      }, {});
    }

    // Attach player details to transactions
    return transactions.map((txn) => ({
      ...txn,
      adds_details: (txn.adds || []).map((id: number) => playerMap[id] || null),
      drops_details: (txn.drops || []).map((id: number) => playerMap[id] || null),
    }));
  } catch (error: any) {
    console.error("Error getting transactions with player details:", error);
    throw new Error("Error getting transactions with player details");
  }
}
