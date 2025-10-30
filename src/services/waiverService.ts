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
    console.error("Error submitting waiver claim:", error);
    throw error;
  }
}

/**
 * Process all pending waiver claims for a league with transaction isolation
 */
export async function processWaivers(leagueId: number): Promise<void> {
  const client = await pool.connect();

  try {
    // Begin transaction with SERIALIZABLE isolation level
    // This prevents phantom reads and ensures consistent view of data
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

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

    console.log(`Processing ${pendingClaims.length} waiver claims for league ${leagueId}`);

    for (const claim of pendingClaims) {
      try {
        // Skip if player already claimed in this batch
        if (claimedPlayerIds.has(claim.player_id)) {
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW(), failure_reason = $2 WHERE id = $3",
            ["failed", "Player already claimed in this batch", claim.id]
          );
          console.log(`Claim ${claim.id} failed: Player already claimed in this batch`);
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
          console.log(`Claim ${claim.id} failed: Player not available`);
          continue;
        }

        // Get roster FAAB budget
        const rosterResult = await client.query(
          "SELECT faab_budget FROM rosters WHERE id = $1",
          [claim.roster_id]
        );

        if (rosterResult.rows.length === 0) {
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW(), failure_reason = $2 WHERE id = $3",
            ["failed", "Roster not found", claim.id]
          );
          console.log(`Claim ${claim.id} failed: Roster not found`);
          continue;
        }

        const faabBudget = rosterResult.rows[0].faab_budget;

        if (claim.bid_amount > faabBudget) {
          // Insufficient FAAB - mark as failed
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW(), failure_reason = $2 WHERE id = $3",
            ["failed", `Insufficient FAAB (need $${claim.bid_amount}, have $${faabBudget})`, claim.id]
          );
          console.log(`Claim ${claim.id} failed: Insufficient FAAB`);
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
              console.log(`Claim ${claim.id} failed: Drop player not on roster`);
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

        console.log(`Claim ${claim.id} processed successfully`);
      } catch (claimError: any) {
        console.error(`Error processing claim ${claim.id}:`, claimError);
        // Mark individual claim as failed but continue with others
        await client.query(
          "UPDATE waiver_claims SET status = $1, processed_at = NOW(), failure_reason = $2 WHERE id = $3",
          ["failed", claimError.message || "Processing error", claim.id]
        );
      }
    }

    // Commit transaction
    await client.query("COMMIT");
    console.log(`Successfully processed ${pendingClaims.length} waiver claims for league ${leagueId}`);
  } catch (error: any) {
    // Rollback on any error
    await client.query("ROLLBACK");
    console.error("Error processing waivers:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Pick up a free agent immediately (no waiver claim needed)
 */
export async function pickupFreeAgent(
  rosterId: number,
  playerId: number,
  dropPlayerId: number | null
): Promise<any> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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

    await client.query("COMMIT");
    return transaction;
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Error picking up free agent:", error);
    throw error;
  } finally {
    client.release();
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
    console.error("Error checking player availability:", error);
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
    console.error("Error getting available players:", error);
    throw error;
  }
}
