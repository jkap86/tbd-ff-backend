import {
  createWaiverClaim,
  getPendingClaims,
  updateClaimStatus,
  hasPendingClaimForPlayer,
  WaiverClaim,
} from "../models/WaiverClaim";
import {
  getRosterById,
  getRosterFAAB,
  deductFAAB,
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
 * Process all pending waivers for a league (FAAB system)
 */
export async function processWaivers(leagueId: number): Promise<void> {
  try {
    console.log(`[WaiverService] Processing waivers for league ${leagueId}`);

    // Get all pending claims for this league
    const pendingClaims = await getPendingClaims(leagueId);

    if (pendingClaims.length === 0) {
      console.log(`[WaiverService] No pending claims for league ${leagueId}`);
      return;
    }

    console.log(`[WaiverService] Found ${pendingClaims.length} pending claims`);

    // Group claims by player_id
    const claimsByPlayer: { [playerId: number]: WaiverClaim[] } = {};
    pendingClaims.forEach((claim) => {
      if (!claimsByPlayer[claim.player_id]) {
        claimsByPlayer[claim.player_id] = [];
      }
      claimsByPlayer[claim.player_id].push(claim);
    });

    // Process each player's claims
    for (const [playerIdStr, claims] of Object.entries(claimsByPlayer)) {
      const playerId = parseInt(playerIdStr);
      console.log(`[WaiverService] Processing ${claims.length} claims for player ${playerId}`);

      // Check if player is still available
      const available = await isPlayerAvailable(leagueId, playerId);
      if (!available) {
        console.log(`[WaiverService] Player ${playerId} is no longer available`);
        // Mark all claims as failed
        for (const claim of claims) {
          await updateClaimStatus(claim.id, "failed", "Player is no longer available");
        }
        continue;
      }

      // Sort claims by bid amount (DESC), then by created_at (ASC) for tiebreaker
      claims.sort((a, b) => {
        if (b.bid_amount !== a.bid_amount) {
          return b.bid_amount - a.bid_amount;
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      // Try to award to highest bidder
      let awarded = false;
      for (const claim of claims) {
        if (awarded) {
          // Mark all other claims as failed
          await updateClaimStatus(claim.id, "failed", "Lost to higher bid");
          continue;
        }

        // Try to process this claim
        const success = await processIndividualClaim(claim);
        if (success) {
          awarded = true;
          console.log(
            `[WaiverService] Awarded player ${playerId} to roster ${claim.roster_id} for $${claim.bid_amount}`
          );
        } else {
          console.log(`[WaiverService] Failed to process claim ${claim.id}`);
        }
      }
    }

    console.log(`[WaiverService] Finished processing waivers for league ${leagueId}`);
  } catch (error: any) {
    console.error("[WaiverService] Error processing waivers:", error);
    throw error;
  }
}

/**
 * Process an individual waiver claim
 */
async function processIndividualClaim(claim: WaiverClaim): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get roster and validate FAAB budget
    const roster = await getRosterById(claim.roster_id);
    if (!roster) {
      await updateClaimStatus(claim.id, "failed", "Roster not found");
      await client.query("COMMIT");
      return false;
    }

    const faabBudget = await getRosterFAAB(claim.roster_id);
    if (claim.bid_amount > faabBudget) {
      await updateClaimStatus(
        claim.id,
        "failed",
        `Insufficient FAAB budget (need $${claim.bid_amount}, have $${faabBudget})`
      );
      await client.query("COMMIT");
      return false;
    }

    // Verify player is still available
    const available = await isPlayerAvailable(claim.league_id, claim.player_id);
    if (!available) {
      await updateClaimStatus(claim.id, "failed", "Player is no longer available");
      await client.query("COMMIT");
      return false;
    }

    // If dropping a player, verify they still have that player
    if (claim.drop_player_id) {
      const hasDropPlayer = await rosterHasPlayer(claim.roster_id, claim.drop_player_id);
      if (!hasDropPlayer) {
        await updateClaimStatus(claim.id, "failed", "Drop player is no longer on your roster");
        await client.query("COMMIT");
        return false;
      }
    }

    // Process the claim
    // 1. Deduct FAAB
    await deductFAAB(claim.roster_id, claim.bid_amount);

    // 2. Add player to roster
    await addPlayerToRoster(claim.roster_id, claim.player_id, "bench");

    // 3. Drop player if specified
    if (claim.drop_player_id) {
      await removePlayerFromRoster(claim.roster_id, claim.drop_player_id);
    }

    // 4. Create transaction record
    await createTransaction({
      league_id: claim.league_id,
      roster_id: claim.roster_id,
      transaction_type: "waiver",
      status: "processed",
      adds: [claim.player_id],
      drops: claim.drop_player_id ? [claim.drop_player_id] : [],
      waiver_bid: claim.bid_amount,
    });

    // 5. Mark claim as processed
    await updateClaimStatus(claim.id, "processed");

    await client.query("COMMIT");
    return true;
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error(`[WaiverService] Error processing claim ${claim.id}:`, error);
    await updateClaimStatus(claim.id, "failed", error.message || "Processing error");
    return false;
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
