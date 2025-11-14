import {
  getTrade,
  getTradeItems,
  updateTradeStatus,
  Trade,
} from "../models/Trade";
import { withTransaction } from "../utils/transactionWrapper";

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
  return withTransaction(async (client) => {
    // Validate rosters exist and are in same league
    const rostersResult = await client.query(
      `SELECT id, league_id, starters, bench, taxi, ir
       FROM rosters
       WHERE id = ANY($1::int[])`,
      [[params.proposer_roster_id, params.receiver_roster_id]]
    );

    if (rostersResult.rows.length !== 2) {
      throw new Error("Invalid roster");
    }

    const proposerRoster = rostersResult.rows.find(r => r.id === params.proposer_roster_id);
    const receiverRoster = rostersResult.rows.find(r => r.id === params.receiver_roster_id);

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
    const tradeResult = await client.query(
      `INSERT INTO trades (league_id, proposer_roster_id, receiver_roster_id, proposer_message, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        params.league_id,
        params.proposer_roster_id,
        params.receiver_roster_id,
        params.message || null,
        'pending'
      ]
    );

    const trade = tradeResult.rows[0];

    // Get player names for trade items
    const allPlayerIds = [...params.players_giving, ...params.players_receiving];
    const playersResult = await client.query(
      `SELECT player_id, full_name FROM players WHERE player_id = ANY($1::int[])`,
      [allPlayerIds]
    );

    const playerMap = new Map(playersResult.rows.map(p => [p.player_id, p.full_name]));

    // Add items proposer is giving
    for (const playerId of params.players_giving) {
      await client.query(
        `INSERT INTO trade_items (trade_id, from_roster_id, to_roster_id, player_id, player_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          trade.id,
          params.proposer_roster_id,
          params.receiver_roster_id,
          playerId,
          playerMap.get(playerId) || null
        ]
      );
    }

    // Add items proposer is receiving
    for (const playerId of params.players_receiving) {
      await client.query(
        `INSERT INTO trade_items (trade_id, from_roster_id, to_roster_id, player_id, player_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          trade.id,
          params.receiver_roster_id,
          params.proposer_roster_id,
          playerId,
          playerMap.get(playerId) || null
        ]
      );
    }

    return trade;
  });
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
  return withTransaction(async (client) => {
    const trade = await getTrade(tradeId);
    if (!trade) {
      throw new Error("Trade not found");
    }

    if (trade.status !== "pending") {
      throw new Error("Trade has already been processed");
    }

    // Get all trade items
    const items = await getTradeItems(tradeId);

    // Move each player between rosters
    for (const item of items) {
      // Get both rosters
      const rostersResult = await client.query(
        `SELECT id, starters, bench, taxi, ir
         FROM rosters
         WHERE id = ANY($1::int[])
         FOR UPDATE`,
        [[item.from_roster_id, item.to_roster_id]]
      );

      const fromRoster = rostersResult.rows.find(r => r.id === item.from_roster_id);
      const toRoster = rostersResult.rows.find(r => r.id === item.to_roster_id);

      if (!fromRoster || !toRoster) {
        throw new Error("Roster not found in trade");
      }

      // Remove player from giving roster
      let fromBench = fromRoster.bench || [];
      let fromStarters = fromRoster.starters || [];

      // Check if player is in bench
      if (fromBench.includes(item.player_id)) {
        fromBench = fromBench.filter((id: number) => id !== item.player_id);
        await client.query(
          `UPDATE rosters SET bench = $1 WHERE id = $2`,
          [JSON.stringify(fromBench), item.from_roster_id]
        );
      } else {
        // Remove from starters
        fromStarters = fromStarters.map((slot: any) =>
          slot.player_id === item.player_id ? { ...slot, player_id: null } : slot
        );
        await client.query(
          `UPDATE rosters SET starters = $1 WHERE id = $2`,
          [JSON.stringify(fromStarters), item.from_roster_id]
        );
      }

      // Add player to receiving roster's bench
      const toBench = toRoster.bench || [];
      toBench.push(item.player_id);
      await client.query(
        `UPDATE rosters SET bench = $1 WHERE id = $2`,
        [JSON.stringify(toBench), item.to_roster_id]
      );
    }

    // Update trade status
    const tradeUpdateResult = await client.query(
      `UPDATE trades
       SET status = $1, responded_at = NOW(), processed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      ['accepted', tradeId]
    );

    const updatedTrade = tradeUpdateResult.rows[0];

    // Create transaction records
    const proposerAdds = items.filter((i) => i.to_roster_id === trade.proposer_roster_id).map((i) => i.player_id);
    const proposerDrops = items.filter((i) => i.from_roster_id === trade.proposer_roster_id).map((i) => i.player_id);

    await client.query(
      `INSERT INTO transactions (league_id, roster_id, transaction_type, status, adds, drops, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        trade.league_id,
        trade.proposer_roster_id,
        'trade',
        'processed',
        JSON.stringify(proposerAdds),
        JSON.stringify(proposerDrops)
      ]
    );

    const receiverAdds = items.filter((i) => i.to_roster_id === trade.receiver_roster_id).map((i) => i.player_id);
    const receiverDrops = items.filter((i) => i.from_roster_id === trade.receiver_roster_id).map((i) => i.player_id);

    await client.query(
      `INSERT INTO transactions (league_id, roster_id, transaction_type, status, adds, drops, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        trade.league_id,
        trade.receiver_roster_id,
        'trade',
        'processed',
        JSON.stringify(receiverAdds),
        JSON.stringify(receiverDrops)
      ]
    );

    return updatedTrade;
  });
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
