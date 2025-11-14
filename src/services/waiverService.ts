import {
  createWaiverClaim,
  hasPendingClaimForPlayer,
  WaiverClaim,
} from "../models/WaiverClaim";
import {
  getRosterById,
  getRosterFAAB,
  addPlayerToRoster,
  removePlayerFromRoster,
  rosterHasPlayer,
  getRostersByLeagueId,
} from "../models/Roster";
import { createTransaction } from "../models/Transaction";
import pool from "../config/database";
import { withTransaction } from "../utils/transactionWrapper";
import { logger } from "../config/logger";

/**
 * Submit a waiver claim for a player
 */
export async function submitWaiverClaim(
  rosterId: number,
  playerId: number,
  dropPlayerId: number | null,
  bidAmount: number
): Promise<WaiverClaim> {
  try {
    // Get roster to validate
    const roster = await getRosterById(rosterId);
    if (!roster) {
      throw new Error("Roster not found");
    }

    // Validate bid amount against FAAB budget
    const faabBudget = await getRosterFAAB(rosterId);
    if (bidAmount > faabBudget) {
      throw new Error(`Bid amount ($${bidAmount}) exceeds FAAB budget ($${faabBudget})`);
    }

    if (bidAmount < 0) {
      throw new Error("Bid amount cannot be negative");
    }

    // Check if roster already has the player
    const hasPlayer = await rosterHasPlayer(rosterId, playerId);
    if (hasPlayer) {
      throw new Error("Cannot claim a player already on your roster");
    }

    // Check if player is available (not on any roster in the league)
    const isAvailable = await isPlayerAvailable(roster.league_id, playerId);
    if (!isAvailable) {
      throw new Error("Player is not available (already on a roster)");
    }

    // Check if roster already has a pending claim for this player
    const hasPending = await hasPendingClaimForPlayer(rosterId, playerId);
    if (hasPending) {
      throw new Error("You already have a pending claim for this player");
    }

    // If dropping a player, verify roster has that player
    if (dropPlayerId) {
      const hasDropPlayer = await rosterHasPlayer(rosterId, dropPlayerId);
      if (!hasDropPlayer) {
        throw new Error("Cannot drop a player not on your roster");
      }
    }

    // Create the waiver claim
    const claim = await createWaiverClaim({
      league_id: roster.league_id,
      roster_id: rosterId,
      player_id: playerId,
      drop_player_id: dropPlayerId,
      bid_amount: bidAmount,
    });

    return claim;
  } catch (error: any) {
    logger.error("Error submitting waiver claim:", error);
    throw error;
  }
}

/**
 * Process all pending waiver claims for a league with transaction isolation
 */
export async function processWaivers(leagueId: number): Promise<void> {
  return withTransaction(async (client) => {
    // Using SERIALIZABLE isolation level to prevent phantom reads
    // and ensure consistent view of data

    // Lock the league row to prevent concurrent processing
    await client.query(
      "SELECT id FROM leagues WHERE id = $1 FOR UPDATE",
      [leagueId]
    );

    // Get pending claims sorted by bid amount within transaction
    const pendingClaimsResult = await client.query(
      `SELECT wc.*, r.user_id, r.league_id
       FROM waiver_claims wc
       JOIN rosters r ON wc.roster_id = r.id
       WHERE r.league_id = $1
         AND wc.status = 'pending'
       ORDER BY wc.bid_amount DESC, wc.created_at ASC
       FOR UPDATE OF wc`,
      [leagueId]
    );

    const pendingClaims = pendingClaimsResult.rows;

    // Track processed players in this batch to prevent duplicates
    const claimedPlayerIds = new Set<string>();

    // OPTIMIZATION: Batch fetch all roster FAAB budgets in a single query
    // This prevents N+1 query problem (was: 1 query per claim)
    const uniqueRosterIds = [...new Set(pendingClaims.map((c: any) => c.roster_id))];
    const faabBudgetsResult = await client.query(
      `SELECT id, faab_budget FROM rosters WHERE id = ANY($1::int[])`,
      [uniqueRosterIds]
    );

    // Create Map for O(1) lookup during claim processing
    const faabBudgetMap = new Map<number, number>();
    faabBudgetsResult.rows.forEach((row: any) => {
      faabBudgetMap.set(row.id, row.faab_budget);
    });

    logger.info(`Processing ${pendingClaims.length} waiver claims for league ${leagueId}`);

    for (const claim of pendingClaims) {
      try {
        // Skip if player already claimed in this batch
        if (claimedPlayerIds.has(claim.player_id)) {
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW(), failure_reason = $2 WHERE id = $3",
            ["failed", "Player already claimed in this batch", claim.id]
          );
          logger.info(`Claim ${claim.id} failed: Player already claimed in this batch`);
          continue;
        }

        // Check if player is available (not on any roster in this league)
        const playerAvailabilityResult = await client.query(
          `SELECT COUNT(*) as count
           FROM rosters r
           WHERE r.league_id = $1
             AND (
               r.starters @> $2::jsonb OR
               r.bench @> $2::jsonb OR
               r.taxi @> $2::jsonb OR
               r.ir @> $2::jsonb
             )`,
          [leagueId, JSON.stringify([claim.player_id])]
        );

        const isAvailable = parseInt(playerAvailabilityResult.rows[0].count) === 0;

        if (!isAvailable) {
          // Player taken - mark claim as failed
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW(), failure_reason = $2 WHERE id = $3",
            ["failed", "Player not available", claim.id]
          );
          logger.info(`Claim ${claim.id} failed: Player not available`);
          continue;
        }

        // Get roster FAAB budget from pre-fetched Map (O(1) lookup)
        const faabBudget = faabBudgetMap.get(claim.roster_id);

        if (faabBudget === undefined) {
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW(), failure_reason = $2 WHERE id = $3",
            ["failed", "Roster not found", claim.id]
          );
          logger.info(`Claim ${claim.id} failed: Roster not found`);
          continue;
        }

        if (claim.bid_amount > faabBudget) {
          // Insufficient FAAB - mark as failed
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW(), failure_reason = $2 WHERE id = $3",
            ["failed", `Insufficient FAAB (need $${claim.bid_amount}, have $${faabBudget})`, claim.id]
          );
          logger.info(`Claim ${claim.id} failed: Insufficient FAAB`);
          continue;
        }

        // Get current roster to add player
        const currentRosterResult = await client.query(
          "SELECT bench FROM rosters WHERE id = $1",
          [claim.roster_id]
        );

        let bench = currentRosterResult.rows[0].bench || [];

        // If drop_player_id is specified, verify ownership and remove
        if (claim.drop_player_id) {
          const hasDropPlayer = bench.includes(claim.drop_player_id);
          if (!hasDropPlayer) {
            // Check starters too
            const startersResult = await client.query(
              "SELECT starters FROM rosters WHERE id = $1",
              [claim.roster_id]
            );
            const starters = startersResult.rows[0].starters || [];
            const inStarters = starters.some((slot: any) => slot.player_id === claim.drop_player_id);

            if (!inStarters) {
              await client.query(
                "UPDATE waiver_claims SET status = $1, processed_at = NOW(), failure_reason = $2 WHERE id = $3",
                ["failed", "Drop player not on roster", claim.id]
              );
              logger.info(`Claim ${claim.id} failed: Drop player not on roster`);
              continue;
            }
          }

          // Remove from bench
          bench = bench.filter((id: string) => id !== claim.drop_player_id);
        }

        // Add player to bench
        bench.push(claim.player_id);

        // Update roster with new player and deducted FAAB
        await client.query(
          "UPDATE rosters SET bench = $1, faab_budget = faab_budget - $2 WHERE id = $3",
          [JSON.stringify(bench), claim.bid_amount, claim.roster_id]
        );

        // Mark claim as successful
        await client.query(
          "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
          ["processed", claim.id]
        );

        // Track claimed player
        claimedPlayerIds.add(claim.player_id);

        // Create transaction record
        await client.query(
          `INSERT INTO transactions (league_id, roster_id, transaction_type, status, adds, drops, waiver_bid, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            claim.league_id,
            claim.roster_id,
            'waiver',
            'processed',
            JSON.stringify([claim.player_id]),
            claim.drop_player_id ? JSON.stringify([claim.drop_player_id]) : JSON.stringify([]),
            claim.bid_amount
          ]
        );

        logger.info(`Claim ${claim.id} processed successfully`);
      } catch (claimError: any) {
        logger.error(`Error processing claim ${claim.id}:`, claimError);
        // Mark individual claim as failed but continue with others
        await client.query(
          "UPDATE waiver_claims SET status = $1, processed_at = NOW(), failure_reason = $2 WHERE id = $3",
          ["failed", claimError.message || "Processing error", claim.id]
        );
      }
    }

    logger.info(`Successfully processed ${pendingClaims.length} waiver claims for league ${leagueId}`);
  }, { isolationLevel: "SERIALIZABLE" });
}

/**
 * Pick up a free agent immediately (no waiver claim needed)
 */
export async function pickupFreeAgent(
  rosterId: number,
  playerId: number,
  dropPlayerId: number | null
): Promise<any> {
  // NOTE: This function doesn't use withTransaction because it calls model functions
  // that use the global pool instead of a transaction client. Converting this would
  // require updating all model functions to accept an optional client parameter.
  try {
    // Get roster to validate
    const roster = await getRosterById(rosterId);
    if (!roster) {
      throw new Error("Roster not found");
    }

    // Check if roster already has the player
    const hasPlayer = await rosterHasPlayer(rosterId, playerId);
    if (hasPlayer) {
      throw new Error("Cannot add a player already on your roster");
    }

    // Check if player is available
    const available = await isPlayerAvailable(roster.league_id, playerId);
    if (!available) {
      throw new Error("Player is not available (already on a roster)");
    }

    // If dropping a player, verify roster has that player
    if (dropPlayerId) {
      const hasDropPlayer = await rosterHasPlayer(rosterId, dropPlayerId);
      if (!hasDropPlayer) {
        throw new Error("Cannot drop a player not on your roster");
      }
    }

    // 1. Add player to roster
    await addPlayerToRoster(rosterId, playerId, "bench");

    // 2. Drop player if specified
    if (dropPlayerId) {
      await removePlayerFromRoster(rosterId, dropPlayerId);
    }

    // 3. Create transaction record
    const transaction = await createTransaction({
      league_id: roster.league_id,
      roster_id: rosterId,
      transaction_type: "free_agent",
      status: "processed",
      adds: [playerId],
      drops: dropPlayerId ? [dropPlayerId] : [],
    });

    return transaction;
  } catch (error: any) {
    logger.error("Error picking up free agent:", error);
    throw error;
  }
}

/**
 * Check if a player is available (not on any roster in the league)
 */
export async function isPlayerAvailable(leagueId: number, playerId: number): Promise<boolean> {
  try {
    const rosters = await getRostersByLeagueId(leagueId);

    for (const roster of rosters) {
      const hasPlayer = await rosterHasPlayer(roster.id, playerId);
      if (hasPlayer) {
        return false;
      }
    }

    return true;
  } catch (error: any) {
    logger.error("Error checking player availability:", error);
    throw error;
  }
}

/**
 * Get all available players in a league (not on any roster)
 */
export async function getAvailablePlayers(leagueId: number): Promise<number[]> {
  try {
    // Get all players
    const allPlayersQuery = `SELECT id FROM players`;
    const allPlayersResult = await pool.query(allPlayersQuery);
    const allPlayerIds = allPlayersResult.rows.map((row) => row.id);

    // Get all rosters in the league
    const rosters = await getRostersByLeagueId(leagueId);

    // Collect all rostered player IDs
    const rosteredPlayerIds = new Set<number>();
    for (const roster of rosters) {
      // Get players from starters
      const starterPlayerIds = (roster.starters || [])
        .map((slot: any) => slot.player_id)
        .filter((id: any) => id != null);
      starterPlayerIds.forEach((id: number) => rosteredPlayerIds.add(id));

      // Get players from bench, taxi, IR
      (roster.bench || []).forEach((id: number) => rosteredPlayerIds.add(id));
      (roster.taxi || []).forEach((id: number) => rosteredPlayerIds.add(id));
      (roster.ir || []).forEach((id: number) => rosteredPlayerIds.add(id));
    }

    // Return players not on any roster
    return allPlayerIds.filter((id) => !rosteredPlayerIds.has(id));
  } catch (error: any) {
    logger.error("Error getting available players:", error);
    throw error;
  }
}
