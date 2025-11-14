import pool from "../config/database";
import { logger } from "../config/logger";
import { BaseRepository } from "./BaseRepository";

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
 * TransactionRepository - Extends BaseRepository for common CRUD operations
 * Provides reusable database methods with automatic error handling
 */
class TransactionRepository extends BaseRepository<Transaction> {
  constructor() {
    super('transactions', 'id');
  }
}

// Create singleton instance
const transactionRepo = new TransactionRepository();

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
    logger.error("Error creating transaction:", { error });
    throw new Error("Error creating transaction");
  }
}

/**
 * Get all transactions for a league with pagination support
 */
export async function getTransactionsByLeague(
  leagueId: number,
  limit: number = 50,
  offset: number = 0
): Promise<any[]> {
  try {
    const query = `
      SELECT t.*, r.user_id, u.username, r.roster_id
      FROM transactions t
      JOIN rosters r ON t.roster_id = r.id
      JOIN users u ON r.user_id = u.id
      WHERE t.league_id = $1
      ORDER BY t.processed_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [leagueId, limit, offset]);
    return result.rows;
  } catch (error: any) {
    logger.error("Error getting transactions by league:", { error });
    throw new Error("Error getting transactions by league");
  }
}

/**
 * Get all transactions for a specific roster with pagination support
 */
export async function getTransactionsByRoster(
  rosterId: number,
  limit: number = 50,
  offset: number = 0
): Promise<Transaction[]> {
  try {
    const query = `
      SELECT * FROM transactions
      WHERE roster_id = $1
      ORDER BY processed_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [rosterId, limit, offset]);
    return result.rows;
  } catch (error: any) {
    logger.error("Error getting transactions by roster:", { error });
    throw new Error("Error getting transactions by roster");
  }
}

/**
 * Get a single transaction by ID
 * REFACTORED: Now uses BaseRepository.findById (was 15 lines, now 3 lines, saved 12 lines)
 */
export async function getTransactionById(transactionId: number): Promise<Transaction | null> {
  return transactionRepo.findById(transactionId);
}

/**
 * Get total count of transactions for a league
 */
export async function getTransactionsCountByLeague(leagueId: number): Promise<number> {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM transactions
      WHERE league_id = $1
    `;

    const result = await pool.query(query, [leagueId]);
    return parseInt(result.rows[0].count, 10);
  } catch (error: any) {
    logger.error("Error getting transactions count:", { error });
    throw new Error("Error getting transactions count");
  }
}

/**
 * Get total count of transactions for a roster
 */
export async function getTransactionsCountByRoster(rosterId: number): Promise<number> {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM transactions
      WHERE roster_id = $1
    `;

    const result = await pool.query(query, [rosterId]);
    return parseInt(result.rows[0].count, 10);
  } catch (error: any) {
    logger.error("Error getting transactions count by roster:", { error });
    throw new Error("Error getting transactions count by roster");
  }
}

/**
 * Get recent transactions for a league with player details and pagination support
 */
export async function getTransactionsWithPlayerDetails(
  leagueId: number,
  limit: number = 50,
  offset: number = 0
): Promise<any[]> {
  try {
    const query = `
      SELECT t.*, r.user_id, u.username, r.roster_id
      FROM transactions t
      JOIN rosters r ON t.roster_id = r.id
      JOIN users u ON r.user_id = u.id
      WHERE t.league_id = $1
      ORDER BY t.processed_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [leagueId, limit, offset]);
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
    logger.error("Error getting transactions with player details:", { error });
    throw new Error("Error getting transactions with player details");
  }
}
