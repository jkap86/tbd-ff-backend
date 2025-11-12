/**
 * Auction bid service - handles business logic for auction bids
 *
 * TODO: Extract full bid processing logic from auctionController
 * Current: Placeholder service for budget validation utilities
 */

export interface BudgetCalculation {
  startingBudget: number;
  spent: number;
  activeBids: number;
  reserved: number;
  available: number;
}

/**
 * Calculate available budget for a roster
 */
export async function calculateAvailableBudget(
  draftId: number,
  rosterId: number,
  draft: any,
  excludeNominationId?: number
): Promise<BudgetCalculation> {
  const pool = (await import("../config/database")).default;

  // Calculate spent budget (completed purchases)
  const spentResult = await pool.query(
    `SELECT COALESCE(SUM(winning_bid), 0) as spent
     FROM auction_nominations
     WHERE draft_id = $1
       AND winning_roster_id = $2
       AND status = 'completed'`,
    [draftId, rosterId]
  );
  const spent = parseInt(spentResult.rows[0].spent);

  // Get active bids
  const activeBidsQuery = excludeNominationId
    ? `SELECT COALESCE(SUM(ab.bid_amount), 0) as active_bids
       FROM auction_bids ab
       JOIN auction_nominations an ON ab.nomination_id = an.id
       WHERE an.draft_id = $1
         AND ab.roster_id = $2
         AND ab.is_winning = true
         AND an.status = 'active'
         AND an.id != $3`
    : `SELECT COALESCE(SUM(ab.bid_amount), 0) as active_bids
       FROM auction_bids ab
       JOIN auction_nominations an ON ab.nomination_id = an.id
       WHERE an.draft_id = $1
         AND ab.roster_id = $2
         AND ab.is_winning = true
         AND an.status = 'active'`;

  const params = excludeNominationId
    ? [draftId, rosterId, excludeNominationId]
    : [draftId, rosterId];

  const activeBidsResult = await pool.query(activeBidsQuery, params);
  const activeBids = parseInt(activeBidsResult.rows[0].active_bids);

  // Calculate roster counts
  const playerCountResult = await pool.query(
    `SELECT COUNT(*) as player_count
     FROM auction_nominations
     WHERE draft_id = $1
       AND winning_roster_id = $2
       AND status = 'completed'`,
    [draftId, rosterId]
  );
  const playerCount = parseInt(playerCountResult.rows[0].player_count);

  const activeWinsQuery = excludeNominationId
    ? `SELECT COUNT(*) as active_wins
       FROM auction_nominations
       WHERE draft_id = $1
         AND winning_roster_id = $2
         AND status = 'active'
         AND id != $3`
    : `SELECT COUNT(*) as active_wins
       FROM auction_nominations
       WHERE draft_id = $1
         AND winning_roster_id = $2
         AND status = 'active'`;

  const activeWinsParams = excludeNominationId
    ? [draftId, rosterId, excludeNominationId]
    : [draftId, rosterId];

  const activeWinsResult = await pool.query(activeWinsQuery, activeWinsParams);
  const activeWins = parseInt(activeWinsResult.rows[0].active_wins);

  const rosterSize = draft.rounds || 15;
  const currentPlayerCount = playerCount + activeWins;
  const remainingSlots = rosterSize - currentPlayerCount - 1;

  // Calculate reserved amount
  const minBid = Math.max(draft.min_bid || 1, 1);
  let reserved = 0;
  if (draft.reserve_budget_per_slot && remainingSlots > 0) {
    reserved = remainingSlots * minBid;
  }

  const startingBudget = draft.starting_budget;
  const available = startingBudget - spent - activeBids - reserved;

  return {
    startingBudget,
    spent,
    activeBids,
    reserved,
    available,
  };
}
