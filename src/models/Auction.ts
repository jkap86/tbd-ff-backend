import pool from "../config/database";
import { getDraftById } from "./Draft";

export interface AuctionNomination {
  id: number;
  draft_id: number;
  player_id: string;
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
  player_id: string;
  nominating_roster_id: number;
  deadline?: Date | null;
}): Promise<AuctionNomination> {
  // Get draft to check min_bid
  const { getDraftById } = await import("./Draft");
  const draft = await getDraftById(data.draft_id);
  const minBid = Math.max(draft?.min_bid || 1, 1);

  const result = await pool.query(
    `INSERT INTO auction_nominations
      (draft_id, player_id, nominating_roster_id, deadline)
    VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [data.draft_id, data.player_id, data.nominating_roster_id, data.deadline]
  );

  const nominationId = result.rows[0].id;

  // Automatically place opening bid at minimum bid amount for nominating team
  await pool.query(
    `INSERT INTO auction_bids
      (nomination_id, roster_id, max_bid, bid_amount, is_winning)
    VALUES ($1, $2, $3, $4, true)`,
    [nominationId, data.nominating_roster_id, minBid, minBid]
  );

  // Fetch the nomination with player and team details
  const detailedResult = await pool.query(
    `SELECT an.*,
      p.full_name as player_name,
      p.position as player_position,
      p.team as player_team,
      COALESCE(r.settings->>'team_name', u.username) as nominating_team_name
    FROM auction_nominations an
    LEFT JOIN players p ON an.player_id = p.player_id
    LEFT JOIN rosters r ON an.nominating_roster_id = r.id
    LEFT JOIN users u ON r.user_id = u.id
    WHERE an.id = $1`,
    [nominationId]
  );

  return detailedResult.rows[0];
}

export async function getNominationById(
  nomination_id: number
): Promise<AuctionNomination | null> {
  const result = await pool.query(
    `SELECT an.*,
      p.full_name as player_name,
      p.position as player_position,
      p.team as player_team,
      COALESCE(nr.settings->>'team_name', nu.username) as nominating_team_name
    FROM auction_nominations an
    LEFT JOIN players p ON an.player_id = p.player_id
    LEFT JOIN rosters nr ON an.nominating_roster_id = nr.id
    LEFT JOIN users nu ON nr.user_id = nu.id
    WHERE an.id = $1`,
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
      p.team as player_team,
      COALESCE(nr.settings->>'team_name', nu.username) as nominating_team_name,
      COALESCE(wr.settings->>'team_name', wu.username) as winning_team_name
    FROM auction_nominations an
    LEFT JOIN players p ON an.player_id = p.player_id
    LEFT JOIN rosters nr ON an.nominating_roster_id = nr.id
    LEFT JOIN users nu ON nr.user_id = nu.id
    LEFT JOIN rosters wr ON an.winning_roster_id = wr.id
    LEFT JOIN users wu ON wr.user_id = wu.id
    WHERE an.draft_id = $1 AND an.status = 'active'
    ORDER BY an.created_at ASC`,
    [draft_id]
  );
  return result.rows;
}

export async function getAllNominations(
  draft_id: number
): Promise<AuctionNomination[]> {
  const result = await pool.query(
    `SELECT an.*,
      p.full_name as player_name,
      p.position as player_position,
      p.team as player_team,
      COALESCE(nr.settings->>'team_name', nu.username) as nominating_team_name,
      COALESCE(wr.settings->>'team_name', wu.username) as winning_team_name
    FROM auction_nominations an
    LEFT JOIN players p ON an.player_id = p.player_id
    LEFT JOIN rosters nr ON an.nominating_roster_id = nr.id
    LEFT JOIN users nu ON nr.user_id = nu.id
    LEFT JOIN rosters wr ON an.winning_roster_id = wr.id
    LEFT JOIN users wu ON wr.user_id = wu.id
    WHERE an.draft_id = $1
    ORDER BY an.created_at DESC`,
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

export async function updateNominationDeadline(
  nomination_id: number,
  deadline: Date
): Promise<AuctionNomination> {
  const result = await pool.query(
    `UPDATE auction_nominations
    SET deadline = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *`,
    [nomination_id, deadline]
  );
  return result.rows[0];
}

// Bidding functions

export async function getBidsForNomination(
  nomination_id: number
): Promise<AuctionBid[]> {
  const result = await pool.query(
    `SELECT ab.*,
      COALESCE(r.settings->>'team_name', u.username) as team_name
    FROM auction_bids ab
    LEFT JOIN rosters r ON ab.roster_id = r.id
    LEFT JOIN users u ON r.user_id = u.id
    WHERE ab.nomination_id = $1
    ORDER BY ab.max_bid DESC, ab.created_at ASC`,
    [nomination_id]
  );
  return result.rows;
}

export async function getAllBidsForDraft(
  draft_id: number
): Promise<AuctionBid[]> {
  const result = await pool.query(
    `SELECT ab.*,
      COALESCE(r.settings->>'team_name', u.username) as team_name
    FROM auction_bids ab
    LEFT JOIN rosters r ON ab.roster_id = r.id
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN auction_nominations an ON ab.nomination_id = an.id
    WHERE an.draft_id = $1
    ORDER BY ab.created_at DESC`,
    [draft_id]
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

  // Validate bid against budget, roster size, and bid increment
  const validation = await validateBid(
    data.roster_id,
    nomination.draft_id,
    data.max_bid,
    data.nomination_id
  );
  if (!validation.valid) {
    throw new Error(validation.reason || "Invalid bid");
  }

  // Get current bids for nomination
  const currentBids = await getBidsForNomination(data.nomination_id);

  // Ensure min_bid is at least 1
  const minBid = Math.max(draft.min_bid || 1, 1);

  // For slow auctions, use proxy bidding. For regular auctions, use direct bidding
  let result;
  if (draft.draft_type === "slow_auction") {
    result = await processProxyBid(
      data.nomination_id,
      data.roster_id,
      data.max_bid,
      minBid,
      currentBids
    );
  } else {
    // Regular auction - direct bidding (max_bid = bid_amount)
    result = await processDirectBid(
      data.nomination_id,
      data.roster_id,
      data.max_bid,
      minBid,
      currentBids
    );
  }

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

async function processDirectBid(
  nomination_id: number,
  new_roster_id: number,
  bid_amount: number,
  _min_bid: number,
  existing_bids: AuctionBid[]
): Promise<{
  success: boolean;
  currentBid: AuctionBid;
  previousWinner?: number;
  newWinner: number;
}> {
  // Get current winning bid
  const currentWinner = existing_bids.find((b) => b.is_winning);

  // In direct bidding, bid_amount and max_bid are the same
  const newBidResult = await pool.query(
    `INSERT INTO auction_bids
      (nomination_id, roster_id, bid_amount, max_bid, is_winning)
    VALUES ($1, $2, $3, $4, true)
    RETURNING *`,
    [nomination_id, new_roster_id, bid_amount, bid_amount]
  );

  const newBid: AuctionBid = newBidResult.rows[0];

  // Mark all other bids as not winning
  await pool.query(
    `UPDATE auction_bids
    SET is_winning = false
    WHERE nomination_id = $1 AND id != $2`,
    [nomination_id, newBid.id]
  );

  // Update nomination with current winning info
  await pool.query(
    `UPDATE auction_nominations
    SET winning_roster_id = $2,
        winning_bid = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1`,
    [nomination_id, new_roster_id, bid_amount]
  );

  return {
    success: true,
    currentBid: newBid,
    previousWinner: currentWinner?.roster_id,
    newWinner: new_roster_id,
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
  bid_amount: number,
  nomination_id?: number
): Promise<{ valid: boolean; reason?: string }> {
  // Get draft settings
  const draft = await getDraftById(draft_id);
  if (!draft) {
    return { valid: false, reason: "Draft not found" };
  }

  // 1. Check budget availability
  const budget = await getRosterBudget(roster_id, draft_id);

  if (bid_amount > budget.available) {
    return {
      valid: false,
      reason: `Insufficient budget. Available: $${budget.available}, Bid: $${bid_amount}`,
    };
  }

  // 2. Check roster size (don't allow bidding if roster is full)
  const rosterSize = draft.rounds || 15;
  const wonPlayersResult = await pool.query(
    `SELECT COUNT(*) as player_count
    FROM auction_nominations
    WHERE draft_id = $1
      AND winning_roster_id = $2
      AND status = 'completed'`,
    [draft_id, roster_id]
  );

  const playerCount = parseInt(wonPlayersResult.rows[0].player_count);

  if (playerCount >= rosterSize) {
    return {
      valid: false,
      reason: `Roster is full (${playerCount}/${rosterSize} players)`,
    };
  }

  // 3. Check minimum bid and bid increment
  if (nomination_id) {
    const currentBids = await getBidsForNomination(nomination_id);
    const sortedBids = [...currentBids].sort((a, b) => b.bid_amount - a.bid_amount);
    const currentHighBid = sortedBids.length > 0 ? sortedBids[0].bid_amount : 0;

    const minBid = Math.max(draft.min_bid || 1, 1);
    const bidIncrement = draft.bid_increment || 1;
    const requiredBid = currentHighBid === 0 ? minBid : currentHighBid + bidIncrement;

    if (bid_amount < requiredBid) {
      return {
        valid: false,
        reason: `Bid must be at least $${requiredBid} (current bid: $${currentHighBid}, increment: $${bidIncrement})`,
      };
    }
  }

  return { valid: true };
}

/**
 * Check if auction draft is complete
 * Returns true if all rosters have filled all their slots OR no budget remains for any team
 */
export async function isAuctionComplete(draft_id: number): Promise<boolean> {
  const draft = await getDraftById(draft_id);
  if (!draft) {
    return false;
  }

  // Get all rosters in the league
  const { getRostersByLeagueId } = await import("./Roster");
  const rosters = await getRostersByLeagueId(draft.league_id);

  const rosterSize = draft.rounds || 15;

  // Check each roster
  for (const roster of rosters) {
    // Count completed nominations won by this roster (use roster.id, not roster_id)
    const wonPlayersResult = await pool.query(
      `SELECT COUNT(*) as player_count
      FROM auction_nominations
      WHERE draft_id = $1
        AND winning_roster_id = $2
        AND status = 'completed'`,
      [draft_id, roster.id]
    );

    const playerCount = parseInt(wonPlayersResult.rows[0].player_count);

    // If any roster hasn't filled all slots, draft is not complete
    if (playerCount < rosterSize) {
      // Also check if they have budget to continue
      const budget = await getRosterBudget(roster.id, draft_id);

      // If they have no available budget and still have slots, they can't continue
      // But the draft isn't complete yet unless ALL teams are in this state
      if (budget.available >= draft.min_bid) {
        // They can still bid
        return false;
      }
    }
  }

  // All rosters either filled their slots OR ran out of budget
  return true;
}

/**
 * Assign won auction players to rosters
 * This populates each roster with their won players, auto-filling starters
 */
export async function assignAuctionPlayersToRosters(
  draft_id: number
): Promise<void> {
  try {
    console.log(
      `[AssignAuctionPlayers] Starting roster assignment for draft ${draft_id}`
    );

    // Get draft info to get league_id
    const draft = await getDraftById(draft_id);
    if (!draft) {
      throw new Error("Draft not found");
    }

    const leagueId = draft.league_id;

    // Get all completed nominations with winning bids
    const nominationsQuery = `
      SELECT winning_roster_id, player_id
      FROM auction_nominations
      WHERE draft_id = $1
        AND status = 'completed'
        AND winning_roster_id IS NOT NULL
      ORDER BY created_at
    `;
    const nominationsResult = await pool.query(nominationsQuery, [draft_id]);
    const nominations = nominationsResult.rows;

    console.log(
      `[AssignAuctionPlayers] Found ${nominations.length} won players to assign`
    );

    // Group players by roster (maintaining auction order)
    const playersByRoster: { [key: number]: string[] } = {};
    for (const nomination of nominations) {
      const rosterId = nomination.winning_roster_id;
      if (!playersByRoster[rosterId]) {
        playersByRoster[rosterId] = [];
      }
      playersByRoster[rosterId].push(nomination.player_id);
    }

    // Import functions we need
    const { updateRoster, getRosterById } = await import("./Roster");
    const { getLeagueById } = await import("./League");

    // Update each roster with their won players
    for (const [rosterIdStr, playerIds] of Object.entries(playersByRoster)) {
      const rosterId = parseInt(rosterIdStr);
      console.log(
        `[AssignAuctionPlayers] Auto-populating roster ${rosterId} with ${playerIds.length} players`
      );

      // Get existing roster to preserve BN slots
      const existingRoster = await getRosterById(rosterId);

      // Auto-populate starters from won players
      // Note: autoPopulateStarters is not exported, we need to implement similar logic here
      const { starters, bench } = await autoPopulateAuctionStarters(
        rosterId,
        playerIds,
        leagueId
      );

      // Get BN slots from existing roster and assign bench players to them
      const bnSlots =
        existingRoster?.starters?.filter((slot: any) =>
          slot.slot?.startsWith("BN")
        ) || [];

      // Assign bench players to BN slots
      for (let i = 0; i < bnSlots.length && i < bench.length; i++) {
        bnSlots[i].player_id = bench[i];
      }

      // Combine non-BN starters with BN slots
      const allStarters = [...starters, ...bnSlots];

      // Remaining bench players (more than BN slots available)
      const remainingBench = bench.slice(bnSlots.length);

      await updateRoster(rosterId, {
        starters: allStarters,
        bench: remainingBench,
      });

      // Also populate weekly lineups for all weeks with these starters
      const league = await getLeagueById(leagueId);

      if (league) {
        const startWeek = league.settings?.start_week || 1;
        const playoffWeekStart = league.settings?.playoff_week_start || 15;
        const { updateWeeklyLineup } = await import("./WeeklyLineup");

        console.log(
          `[AssignAuctionPlayers] Populating weekly lineups for roster ${rosterId} from week ${startWeek} to ${playoffWeekStart - 1}`
        );

        // Filter out BN slots for weekly lineups
        const nonBenchStarters = starters.filter((slot: any) => {
          const slotName = slot.slot || "";
          return !slotName.startsWith("BN");
        });

        for (let week = startWeek; week < playoffWeekStart; week++) {
          try {
            await updateWeeklyLineup(
              rosterId,
              week,
              league.season,
              nonBenchStarters
            );
          } catch (error) {
            console.error(
              `[AssignAuctionPlayers] Failed to populate week ${week} lineup:`,
              error
            );
          }
        }
      }
    }

    console.log(
      `[AssignAuctionPlayers] Successfully assigned players to rosters and populated weekly lineups`
    );
  } catch (error) {
    console.error("Error assigning auction players to rosters:", error);
    throw new Error("Error assigning auction players to rosters");
  }
}

/**
 * Auto-populate starters from auction won players
 * Similar to the function in Draft.ts but works with auction nominations
 */
async function autoPopulateAuctionStarters(
  rosterId: number,
  playerIds: string[],
  leagueId: number
): Promise<{ starters: any[]; bench: string[] }> {
  try {
    // Get league roster positions
    const { getLeagueById } = await import("./League");
    const league = await getLeagueById(leagueId);

    if (!league || !league.roster_positions) {
      console.log(
        `[AutoPopulate] No roster positions found, all players to bench`
      );
      return { starters: [], bench: playerIds };
    }

    const rosterPositions = league.roster_positions;

    // Get player details (position info)
    const playersQuery = `
      SELECT player_id, position
      FROM players
      WHERE player_id = ANY($1)
    `;
    const playersResult = await pool.query(playersQuery, [playerIds]);
    const playersMap = playersResult.rows.reduce((acc: any, p: any) => {
      acc[p.player_id] = p.position;
      return acc;
    }, {});

    // Initialize starters array with slot structure (exclude BN slots)
    const starters: any[] = rosterPositions
      .filter((pos: any) => !pos.position.startsWith("BN"))
      .map((pos: any) => ({
        slot: pos.position,
        player_id: null,
      }));

    const assignedPlayerIds = new Set<string>();

    // Fill starter slots (in order of auction wins)
    // PRIORITIZE: Exact position matches first, then FLEX positions
    for (const playerId of playerIds) {
      const playerPosition = playersMap[playerId];
      if (!playerPosition) continue;

      // Helper function to check if player can fill a FLEX slot
      const canFillFlexSlot = (slotPos: string): boolean => {
        if (slotPos === "FLEX" && ["RB", "WR", "TE"].includes(playerPosition))
          return true;
        if (
          slotPos === "SUPER_FLEX" &&
          ["QB", "RB", "WR", "TE"].includes(playerPosition)
        )
          return true;
        if (slotPos === "WRT" && ["WR", "RB", "TE"].includes(playerPosition))
          return true;
        if (slotPos === "REC_FLEX" && ["WR", "TE"].includes(playerPosition))
          return true;
        if (
          slotPos === "IDP_FLEX" &&
          ["DL", "LB", "DB"].includes(playerPosition)
        )
          return true;

        return false;
      };

      // First, try to find an EXACT position match
      let slotIndex = starters.findIndex((slot) => {
        if (slot.player_id !== null) return false;
        const slotPos = slot.slot.replace(/\d+$/, "");
        return playerPosition === slotPos; // Exact match only
      });

      // If no exact match, then try FLEX positions
      if (slotIndex === -1) {
        slotIndex = starters.findIndex((slot) => {
          if (slot.player_id !== null) return false;
          const slotPos = slot.slot.replace(/\d+$/, "");
          return canFillFlexSlot(slotPos); // FLEX match
        });
      }

      if (slotIndex !== -1) {
        starters[slotIndex].player_id = playerId;
        assignedPlayerIds.add(playerId);
        console.log(
          `[AutoPopulate] Assigned player ${playerId} (${playerPosition}) to slot ${starters[slotIndex].slot}`
        );
      }
    }

    // Remaining players go to bench
    const bench = playerIds.filter((id) => !assignedPlayerIds.has(id));

    console.log(
      `[AutoPopulate] Roster ${rosterId}: ${assignedPlayerIds.size} starters, ${bench.length} bench`
    );

    return { starters, bench };
  } catch (error) {
    console.error("Error auto-populating auction starters:", error);
    // Fallback: all players to bench
    return { starters: [], bench: playerIds };
  }
}

/**
 * Get the next roster whose turn it is to nominate
 * Rotates through all rosters in order
 */
export async function advanceAuctionTurn(draft_id: number): Promise<number | null> {
  const draft = await getDraftById(draft_id);
  if (!draft) {
    return null;
  }

  // Get draft order to respect the turn order
  const { getDraftOrder } = await import("./DraftOrder");
  const draftOrder = await getDraftOrder(draft_id);

  if (draftOrder.length === 0) {
    // Fallback: use rosters sorted by roster_id if no draft order exists
    const { getRostersByLeagueId } = await import("./Roster");
    const rosters = await getRostersByLeagueId(draft.league_id);
    if (rosters.length === 0) {
      return null;
    }
    rosters.sort((a: any, b: any) => a.roster_id - b.roster_id);

    if (!draft.current_roster_id) {
      return rosters[0].id;
    }

    const currentIndex = rosters.findIndex((r: any) => r.id === draft.current_roster_id);
    if (currentIndex === -1) {
      return rosters[0].id;
    }
    const nextIndex = (currentIndex + 1) % rosters.length;
    return rosters[nextIndex].id;
  }

  // Use draft order (sorted by draft_position)
  const orderedRosters = draftOrder.sort((a: any, b: any) => a.draft_position - b.draft_position);

  // If no current roster, start with the first one in draft order
  if (!draft.current_roster_id) {
    return orderedRosters[0].roster_id;
  }

  // Find current roster index in draft order
  const currentIndex = orderedRosters.findIndex((r: any) => r.roster_id === draft.current_roster_id);

  if (currentIndex === -1) {
    // Current roster not found in draft order, start from beginning
    return orderedRosters[0].roster_id;
  }

  // Get next roster (wrap around to start if at end)
  const nextIndex = (currentIndex + 1) % orderedRosters.length;
  return orderedRosters[nextIndex].roster_id;
}

/**
 * Get team name for a roster
 */
export async function getRosterTeamName(roster_id: number): Promise<string> {
  const result = await pool.query(
    `SELECT COALESCE(r.settings->>'team_name', u.username) as team_name
     FROM rosters r
     LEFT JOIN users u ON r.user_id = u.id
     WHERE r.id = $1`,
    [roster_id]
  );
  return result.rows[0]?.team_name || 'Unknown Team';
}
