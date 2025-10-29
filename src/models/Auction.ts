import pool from "../config/database";
import { getDraftById } from "./Draft";

export interface AuctionNomination {
  id: number;
  draft_id: number;
  player_id: number;
  nominating_roster_id: number;
  winning_roster_id: number | null;
  winning_bid: number | null;
  status: "active" | "completed" | "passed";
  deadline: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuctionBid {
  id: number;
  nomination_id: number;
  roster_id: number;
  bid_amount: number; // Current visible bid
  max_bid: number; // Hidden proxy maximum
  is_winning: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RosterBudget {
  roster_id: number;
  starting_budget: number;
  spent: number;
  active_bids: number; // Sum of winning bids for active nominations
  reserved: number; // $1 per remaining slot if reserve_budget_per_slot enabled
  available: number; // starting_budget - spent - active_bids - reserved
}

// Nomination functions

export async function createNomination(data: {
  draft_id: number;
  player_id: number;
  nominating_roster_id: number;
  deadline?: Date | null;
}): Promise<AuctionNomination> {
  const result = await pool.query(
    `INSERT INTO auction_nominations
      (draft_id, player_id, nominating_roster_id, deadline)
    VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [data.draft_id, data.player_id, data.nominating_roster_id, data.deadline]
  );
  return result.rows[0];
}

export async function getNominationById(
  nomination_id: number
): Promise<AuctionNomination | null> {
  const result = await pool.query(
    `SELECT * FROM auction_nominations WHERE id = $1`,
    [nomination_id]
  );
  return result.rows[0] || null;
}

export async function getActiveNominations(
  draft_id: number
): Promise<AuctionNomination[]> {
  const result = await pool.query(
    `SELECT an.*,
      p.full_name as player_name,
      p.position as player_position,
      p.nfl_team as player_team
    FROM auction_nominations an
    LEFT JOIN players p ON an.player_id = p.player_id
    WHERE an.draft_id = $1 AND an.status = 'active'
    ORDER BY an.created_at ASC`,
    [draft_id]
  );
  return result.rows;
}

export async function completeNomination(
  nomination_id: number,
  winning_roster_id: number,
  winning_bid: number
): Promise<AuctionNomination> {
  const result = await pool.query(
    `UPDATE auction_nominations
    SET status = 'completed',
        winning_roster_id = $2,
        winning_bid = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *`,
    [nomination_id, winning_roster_id, winning_bid]
  );
  return result.rows[0];
}

export async function updateNominationStatus(
  nomination_id: number,
  status: "active" | "completed" | "passed"
): Promise<AuctionNomination> {
  const result = await pool.query(
    `UPDATE auction_nominations
    SET status = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *`,
    [nomination_id, status]
  );
  return result.rows[0];
}

// Bidding functions

export async function getBidsForNomination(
  nomination_id: number
): Promise<AuctionBid[]> {
  const result = await pool.query(
    `SELECT ab.*, r.team_name
    FROM auction_bids ab
    LEFT JOIN rosters r ON ab.roster_id = r.roster_id
    WHERE ab.nomination_id = $1
    ORDER BY ab.max_bid DESC, ab.created_at ASC`,
    [nomination_id]
  );
  return result.rows;
}

export async function placeBid(data: {
  nomination_id: number;
  roster_id: number;
  max_bid: number;
}): Promise<{
  success: boolean;
  currentBid: AuctionBid;
  previousWinner?: number;
  newWinner: number;
}> {
  // Get nomination and draft info
  const nomination = await getNominationById(data.nomination_id);
  if (!nomination) {
    throw new Error("Nomination not found");
  }

  if (nomination.status !== "active") {
    throw new Error("Nomination is not active");
  }

  const draft = await getDraftById(nomination.draft_id);
  if (!draft) {
    throw new Error("Draft not found");
  }

  // Validate bid against budget
  const validation = await validateBid(
    data.roster_id,
    nomination.draft_id,
    data.max_bid
  );
  if (!validation.valid) {
    throw new Error(validation.reason || "Invalid bid");
  }

  // Get current bids for nomination
  const currentBids = await getBidsForNomination(data.nomination_id);

  // Process proxy bidding logic
  const result = await processProxyBid(
    data.nomination_id,
    data.roster_id,
    data.max_bid,
    draft.min_bid,
    currentBids
  );

  return result;
}

async function processProxyBid(
  nomination_id: number,
  new_roster_id: number,
  new_max_bid: number,
  min_bid: number,
  existing_bids: AuctionBid[]
): Promise<{
  success: boolean;
  currentBid: AuctionBid;
  previousWinner?: number;
  newWinner: number;
}> {
  // Sort bids by max_bid DESC
  const sortedBids = [...existing_bids].sort((a, b) => b.max_bid - a.max_bid);

  // Get current winning bid amount (or 0 if no bids)
  const currentBidAmount =
    sortedBids.find((b) => b.is_winning)?.bid_amount || 0;
  const currentWinner = sortedBids.find((b) => b.is_winning);

  // Insert new bid
  const newBidResult = await pool.query(
    `INSERT INTO auction_bids
      (nomination_id, roster_id, bid_amount, max_bid, is_winning)
    VALUES ($1, $2, $3, $4, false)
    RETURNING *`,
    [
      nomination_id,
      new_roster_id,
      Math.max(currentBidAmount + min_bid, min_bid),
      new_max_bid,
    ]
  );

  const newBid: AuctionBid = newBidResult.rows[0];

  // Add new bid to sorted list and re-sort
  const allBids = [...sortedBids, newBid].sort(
    (a, b) => b.max_bid - a.max_bid
  );

  // Determine winner using proxy bidding logic
  let winningBid: AuctionBid;
  let winningAmount: number;

  if (allBids.length === 1) {
    // First bid - wins at min_bid
    winningBid = allBids[0];
    winningAmount = min_bid;
  } else {
    // Multiple bids - highest max_bid wins
    const highestBidder = allBids[0];
    const secondHighestBidder = allBids[1];

    winningBid = highestBidder;

    // Winner pays second highest max_bid + min_bid, or their own bid if it's less
    if (secondHighestBidder.max_bid + min_bid <= highestBidder.max_bid) {
      winningAmount = secondHighestBidder.max_bid + min_bid;
    } else {
      winningAmount = highestBidder.max_bid;
    }

    // Ensure winning amount is at least min_bid
    winningAmount = Math.max(winningAmount, min_bid);
  }

  // Update all bids - mark winner and update winning bid amount
  await pool.query(
    `UPDATE auction_bids
    SET is_winning = false
    WHERE nomination_id = $1`,
    [nomination_id]
  );

  const updatedWinningBid = await pool.query(
    `UPDATE auction_bids
    SET is_winning = true,
        bid_amount = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *`,
    [winningBid.id, winningAmount]
  );

  // Update nomination with current winning info
  await pool.query(
    `UPDATE auction_nominations
    SET winning_roster_id = $2,
        winning_bid = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1`,
    [nomination_id, winningBid.roster_id, winningAmount]
  );

  return {
    success: true,
    currentBid: updatedWinningBid.rows[0],
    previousWinner: currentWinner?.roster_id,
    newWinner: winningBid.roster_id,
  };
}

// Budget functions

export async function getRosterBudget(
  roster_id: number,
  draft_id: number
): Promise<RosterBudget> {
  const draft = await getDraftById(draft_id);
  if (!draft) {
    throw new Error("Draft not found");
  }

  // Get spent budget (completed auction purchases)
  const spentResult = await pool.query(
    `SELECT COALESCE(SUM(winning_bid), 0) as spent
    FROM auction_nominations
    WHERE draft_id = $1
      AND winning_roster_id = $2
      AND status = 'completed'`,
    [draft_id, roster_id]
  );
  const spent = parseInt(spentResult.rows[0].spent);

  // Get active bids (sum of winning bids on active nominations)
  const activeBidsResult = await pool.query(
    `SELECT COALESCE(SUM(ab.bid_amount), 0) as active_bids
    FROM auction_bids ab
    JOIN auction_nominations an ON ab.nomination_id = an.id
    WHERE an.draft_id = $1
      AND ab.roster_id = $2
      AND ab.is_winning = true
      AND an.status = 'active'`,
    [draft_id, roster_id]
  );
  const activeBids = parseInt(activeBidsResult.rows[0].active_bids);

  // Calculate reserved amount if reserve_budget_per_slot is enabled
  let reserved = 0;
  if (draft.reserve_budget_per_slot) {
    // Get roster size from draft rounds
    const rosterSize = draft.rounds || 15;

    // Count current players on roster
    const rosterResult = await pool.query(
      `SELECT roster_id FROM rosters WHERE roster_id = $1`,
      [roster_id]
    );

    if (rosterResult.rows.length > 0) {
      const roster = rosterResult.rows[0];
      const currentPlayerCount = roster.players ? roster.players.length : 0;

      // Get count of active nominations being won
      const activeWinsResult = await pool.query(
        `SELECT COUNT(*) as active_wins
        FROM auction_nominations
        WHERE draft_id = $1
          AND winning_roster_id = $2
          AND status = 'active'`,
        [draft_id, roster_id]
      );
      const activeWins = parseInt(activeWinsResult.rows[0].active_wins);

      const remainingSlots = rosterSize - currentPlayerCount - activeWins;
      reserved = Math.max(0, remainingSlots * 1); // $1 per remaining slot
    }
  }

  const startingBudget = draft.starting_budget;
  const available = startingBudget - spent - activeBids - reserved;

  return {
    roster_id,
    starting_budget: startingBudget,
    spent,
    active_bids: activeBids,
    reserved,
    available: Math.max(0, available),
  };
}

export async function validateBid(
  roster_id: number,
  draft_id: number,
  bid_amount: number
): Promise<{ valid: boolean; reason?: string }> {
  const budget = await getRosterBudget(roster_id, draft_id);

  if (bid_amount > budget.available) {
    return {
      valid: false,
      reason: `Insufficient budget. Available: $${budget.available}, Bid: $${bid_amount}`,
    };
  }

  return { valid: true };
}
