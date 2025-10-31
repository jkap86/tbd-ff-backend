import pool from "../config/database";
import {
  createTrade,
  addTradeItem,
  getTrade,
  updateTradeStatus,
  getTradeItems,
  Trade,
} from "../models/Trade";
import { getRosterById, addPlayerToRoster, removePlayerFromRoster } from "../models/Roster";
import { getPlayerById } from "../models/Player";
import { createTransaction } from "../models/Transaction";
import { setTransactionTimeouts } from "../utils/transactionTimeout";

export interface ProposeTradeParams {
  league_id: number;
  proposer_roster_id: number;
  receiver_roster_id: number;
  players_giving: number[]; // Player IDs proposer is giving
  players_receiving: number[]; // Player IDs proposer is receiving
  message?: string;
}

/**
 * Propose a new trade
 */
export async function proposeTrade(
  params: ProposeTradeParams
): Promise<Trade> {
  const client = await pool.connect();
    await setTransactionTimeouts(client);

  try {
    await client.query("BEGIN");

    // Validate rosters exist and are in same league
    const proposerRoster = await getRosterById(params.proposer_roster_id);
    const receiverRoster = await getRosterById(params.receiver_roster_id);

    if (!proposerRoster || !receiverRoster) {
      throw new Error("Invalid roster");
    }

    if (proposerRoster.league_id !== params.league_id || receiverRoster.league_id !== params.league_id) {
      throw new Error("Rosters must be in the same league");
    }

    if (proposerRoster.id === receiverRoster.id) {
      throw new Error("Cannot trade with yourself");
    }

    // Validate proposer owns all players they're giving
    for (const playerId of params.players_giving) {
      if (!rosterHasPlayer(proposerRoster, playerId)) {
        throw new Error(`Proposer does not own player ${playerId}`);
      }
    }

    // Validate receiver owns all players they're giving
    for (const playerId of params.players_receiving) {
      if (!rosterHasPlayer(receiverRoster, playerId)) {
        throw new Error(`Receiver does not own player ${playerId}`);
      }
    }

    // Create trade
    const trade = await createTrade({
      league_id: params.league_id,
      proposer_roster_id: params.proposer_roster_id,
      receiver_roster_id: params.receiver_roster_id,
      proposer_message: params.message,
    });

    // Add items proposer is giving
    for (const playerId of params.players_giving) {
      const player = await getPlayerById(playerId);
      await addTradeItem({
        trade_id: trade.id,
        from_roster_id: params.proposer_roster_id,
        to_roster_id: params.receiver_roster_id,
        player_id: playerId,
        player_name: player?.full_name,
      });
    }

    // Add items proposer is receiving
    for (const playerId of params.players_receiving) {
      const player = await getPlayerById(playerId);
      await addTradeItem({
        trade_id: trade.id,
        from_roster_id: params.receiver_roster_id,
        to_roster_id: params.proposer_roster_id,
        player_id: playerId,
        player_name: player?.full_name,
      });
    }

    await client.query("COMMIT");
    return trade;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Accept a trade (and immediately process it)
 */
export async function acceptTrade(
  tradeId: number,
  acceptorRosterId: number
): Promise<Trade> {
  const trade = await getTrade(tradeId);

  if (!trade) {
    throw new Error("Trade not found");
  }

  if (trade.status !== "pending") {
    throw new Error("Trade is not pending");
  }

  if (trade.receiver_roster_id !== acceptorRosterId) {
    throw new Error("Only the receiver can accept this trade");
  }

  // Process the trade immediately
  return await processTrade(tradeId);
}

/**
 * Reject a trade
 */
export async function rejectTrade(
  tradeId: number,
  rejecterId: number,
  reason?: string
): Promise<Trade> {
  const trade = await getTrade(tradeId);

  if (!trade) {
    throw new Error("Trade not found");
  }

  if (trade.status !== "pending") {
    throw new Error("Trade is not pending");
  }

  if (trade.receiver_roster_id !== rejecterId) {
    throw new Error("Only the receiver can reject this trade");
  }

  return await updateTradeStatus(tradeId, "rejected", {
    rejection_reason: reason,
    responded_at: new Date(),
  });
}

/**
 * Cancel a trade (proposer only)
 */
export async function cancelTrade(
  tradeId: number,
  proposerId: number
): Promise<Trade> {
  const trade = await getTrade(tradeId);

  if (!trade) {
    throw new Error("Trade not found");
  }

  if (trade.status !== "pending") {
    throw new Error("Trade is not pending");
  }

  if (trade.proposer_roster_id !== proposerId) {
    throw new Error("Only the proposer can cancel this trade");
  }

  return await updateTradeStatus(tradeId, "cancelled");
}

/**
 * Process a trade (move players between rosters)
 */
export async function processTrade(tradeId: number): Promise<Trade> {
  const client = await pool.connect();
    await setTransactionTimeouts(client);

  try {
    await client.query("BEGIN");

    const trade = await getTrade(tradeId);
    if (!trade) {
      throw new Error("Trade not found");
    }

    if (trade.status !== "pending") {
      throw new Error("Trade has already been processed");
    }

    // Get all trade items
    const items = await getTradeItems(tradeId);

    // Move each player
    for (const item of items) {
      // Remove player from giving roster
      await removePlayerFromRoster(item.from_roster_id, item.player_id);

      // Add player to receiving roster
      await addPlayerToRoster(item.to_roster_id, item.player_id);
    }

    // Update trade status
    const updatedTrade = await updateTradeStatus(tradeId, "accepted", {
      responded_at: new Date(),
      processed_at: new Date(),
    });

    // Create transaction records
    await createTransaction({
      league_id: trade.league_id,
      roster_id: trade.proposer_roster_id,
      transaction_type: "trade",
      status: "processed",
      adds: items
        .filter((i) => i.to_roster_id === trade.proposer_roster_id)
        .map((i) => i.player_id),
      drops: items
        .filter((i) => i.from_roster_id === trade.proposer_roster_id)
        .map((i) => i.player_id),
    });

    await createTransaction({
      league_id: trade.league_id,
      roster_id: trade.receiver_roster_id,
      transaction_type: "trade",
      status: "processed",
      adds: items
        .filter((i) => i.to_roster_id === trade.receiver_roster_id)
        .map((i) => i.player_id),
      drops: items
        .filter((i) => i.from_roster_id === trade.receiver_roster_id)
        .map((i) => i.player_id),
    });

    await client.query("COMMIT");
    return updatedTrade;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if a roster has a player
 */
function rosterHasPlayer(roster: any, playerId: number): boolean {
  // Check starters
  if (roster.starters) {
    const starterIds = roster.starters.map((s: any) => s.player_id);
    if (starterIds.includes(playerId)) {
      return true;
    }
  }

  // Check bench
  if (roster.bench && roster.bench.includes(playerId)) {
    return true;
  }

  // Check taxi
  if (roster.taxi && roster.taxi.includes(playerId)) {
    return true;
  }

  // Check IR
  if (roster.ir && roster.ir.includes(playerId)) {
    return true;
  }

  return false;
}
