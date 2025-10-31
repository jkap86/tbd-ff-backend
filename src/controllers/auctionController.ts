import { Request, Response } from "express";
import {
  getActiveNominations,
  getBidsForNomination,
  getRosterBudget,
  assignAuctionPlayersToRosters,
  advanceAuctionTurn,
} from "../models/Auction";
import { getDraftById, completeDraft, updateDraft } from "../models/Draft";
import { getLeagueById, updateLeague } from "../models/League";

// POST /api/drafts/:id/nominate
export async function nominatePlayerHandler(req: Request, res: Response) {
  const pool = (await import("../config/database")).default;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const draftId = parseInt(req.params.id);
    const { player_id, roster_id, deadline } = req.body;

    if (!player_id || !roster_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Lock draft to check status and settings
    const draftResult = await client.query(
      'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
      [draftId]
    );

    if (draftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Draft not found" });
    }

    const draft = draftResult.rows[0];

    if (draft.draft_type !== "auction" && draft.draft_type !== "slow_auction") {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: "Draft is not an auction draft type" });
    }

    if (draft.status !== "in_progress") {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Draft is not in progress" });
    }

    // Verify player is not already nominated/won in this draft
    const existingNominationResult = await client.query(
      `SELECT id, status FROM auction_nominations
       WHERE draft_id = $1 AND player_id = $2
       FOR UPDATE`,
      [draftId, player_id]
    );

    if (existingNominationResult.rows.length > 0) {
      const existingNomination = existingNominationResult.rows[0];
      if (existingNomination.status === 'active') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: "Player is already nominated" });
      } else if (existingNomination.status === 'completed') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: "Player has already been drafted" });
      }
    }

    // For slow auction, check nominations per manager limit
    if (draft.draft_type === "slow_auction") {
      const activeNominationsResult = await client.query(
        `SELECT id FROM auction_nominations
         WHERE draft_id = $1 AND status = 'active' AND nominating_roster_id = $2`,
        [draftId, roster_id]
      );

      const nominationsPerManager = draft.nominations_per_manager || 3;

      if (activeNominationsResult.rows.length >= nominationsPerManager) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `You have reached your nomination limit (${nominationsPerManager} active nominations)`,
        });
      }
    }

    // Verify roster exists and belongs to this league
    const rosterResult = await client.query(
      'SELECT * FROM rosters WHERE id = $1 AND league_id = $2',
      [roster_id, draft.league_id]
    );

    if (rosterResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Roster not found or does not belong to this league" });
    }

    // Calculate deadline based on draft type
    let calculatedDeadline: Date | null = null;
    if (deadline) {
      calculatedDeadline = new Date(deadline);
    } else if (draft.draft_type === "slow_auction" && draft.nomination_timer_hours) {
      calculatedDeadline = new Date(Date.now() + draft.nomination_timer_hours * 60 * 60 * 1000);
    } else if (draft.draft_type === "auction" && draft.pick_time_seconds) {
      calculatedDeadline = new Date(Date.now() + draft.pick_time_seconds * 1000);
    }

    // Get draft min_bid for auto-creating opening bid
    const minBid = Math.max(draft.min_bid || 1, 1);

    // Create nomination
    const nominationResult = await client.query(
      `INSERT INTO auction_nominations
        (draft_id, player_id, nominating_roster_id, deadline)
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [draftId, player_id, roster_id, calculatedDeadline]
    );

    const nominationId = nominationResult.rows[0].id;

    // Automatically place opening bid at minimum bid amount for nominating team
    await client.query(
      `INSERT INTO auction_bids
        (nomination_id, roster_id, max_bid, bid_amount, is_winning)
      VALUES ($1, $2, $3, $4, true)`,
      [nominationId, roster_id, minBid, minBid]
    );

    // Update nomination with winning bid info
    await client.query(
      `UPDATE auction_nominations
       SET winning_roster_id = $1, winning_bid = $2
       WHERE id = $3`,
      [roster_id, minBid, nominationId]
    );

    // Commit transaction
    await client.query('COMMIT');

    // Fetch the nomination with player and team details (after commit)
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

    const nomination = detailedResult.rows[0];

    // Broadcast to all clients in the auction room via socket
    try {
      const { io } = await import("../index");
      const room = `auction_${draftId}`;
      io.to(room).emit("player_nominated", nomination);

      // Schedule timer for this nomination if there's a deadline
      if (calculatedDeadline) {
        const { scheduleNominationExpiry } = await import("../socket/auctionSocket");
        scheduleNominationExpiry(io, nomination.id, draftId, calculatedDeadline);
      }

      // Advance turn to next roster (for regular auctions, not slow auctions)
      if (draft.draft_type === "auction") {
        const nextRosterId = await advanceAuctionTurn(draftId);
        if (nextRosterId) {
          await updateDraft(draftId, { current_roster_id: nextRosterId });

          // Emit turn change via socket
          io.to(room).emit("turn_changed", {
            currentRosterId: nextRosterId,
            draftId: draftId,
          });

          // Schedule turn timer for next roster
          const { scheduleTurnTimer } = await import("../socket/auctionSocket");
          scheduleTurnTimer(io, draftId, nextRosterId, draft.pick_time_seconds);
        }
      }
    } catch (socketError) {
      console.error('Socket/turn handling failed:', socketError);
    }

    return res.status(201).json(nomination);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error("Error nominating player:", error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

// POST /api/drafts/:id/bid
export async function placeBidHandler(req: Request, res: Response) {
  const pool = (await import("../config/database")).default;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const draftId = parseInt(req.params.id);
    const { nomination_id, roster_id, max_bid } = req.body;

    if (!nomination_id || !roster_id || !max_bid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Lock the nomination row to prevent concurrent bids
    const nominationResult = await client.query(
      'SELECT * FROM auction_nominations WHERE id = $1 FOR UPDATE',
      [nomination_id]
    );

    if (nominationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Nomination not found" });
    }

    const nomination = nominationResult.rows[0];

    // Validate nomination is active
    if (nomination.status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Nomination is not active" });
    }

    // Verify nomination belongs to this draft
    if (nomination.draft_id !== draftId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Nomination does not belong to this draft" });
    }

    // Check if deadline passed (for slow auction)
    if (nomination.deadline && new Date(nomination.deadline) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Bidding period has ended" });
    }

    // Get draft settings to validate bid
    const draftResult = await client.query(
      'SELECT * FROM drafts WHERE id = $1',
      [draftId]
    );

    if (draftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Draft not found" });
    }

    const draft = draftResult.rows[0];
    const minBid = Math.max(draft.min_bid || 1, 1);
    const bidIncrement = draft.bid_increment || 1;

    // Get current bids for this nomination
    const currentBidsResult = await client.query(
      `SELECT ab.*,
        COALESCE(r.settings->>'team_name', u.username) as team_name
       FROM auction_bids ab
       LEFT JOIN rosters r ON ab.roster_id = r.id
       LEFT JOIN users u ON r.user_id = u.id
       WHERE ab.nomination_id = $1
       ORDER BY ab.max_bid DESC, ab.created_at ASC`,
      [nomination_id]
    );

    const currentBids = currentBidsResult.rows;
    const currentWinningBid = currentBids.find((b: any) => b.is_winning);
    const currentBidAmount = currentWinningBid?.bid_amount || 0;

    // Validate bid amount meets minimum requirements
    const requiredBid = currentBidAmount === 0 ? minBid : currentBidAmount + bidIncrement;

    if (max_bid < requiredBid) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Bid must be at least $${requiredBid} (current bid: $${currentBidAmount}, increment: $${bidIncrement})`
      });
    }

    // Get roster budget (with lock to prevent over-spending)
    // Use a separate query to lock the roster and calculate budget
    const rosterLockResult = await client.query(
      'SELECT * FROM rosters WHERE id = $1 FOR UPDATE',
      [roster_id]
    );

    if (rosterLockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Roster not found" });
    }

    // Lock all active nominations where this roster has winning bids
    // This prevents concurrent bids on different nominations from the same roster
    await client.query(
      `SELECT an.id FROM auction_nominations an
       WHERE an.draft_id = $1
       AND an.status = 'active'
       AND EXISTS (
         SELECT 1 FROM auction_bids ab
         WHERE ab.nomination_id = an.id
         AND ab.roster_id = $2
         AND ab.is_winning = true
       )
       FOR UPDATE`,
      [draftId, roster_id]
    );

    // Calculate spent budget (completed auction purchases)
    const spentResult = await client.query(
      `SELECT COALESCE(SUM(winning_bid), 0) as spent
       FROM auction_nominations
       WHERE draft_id = $1
         AND winning_roster_id = $2
         AND status = 'completed'`,
      [draftId, roster_id]
    );
    const spent = parseInt(spentResult.rows[0].spent);

    // Get active bids (sum of winning bids on active nominations, excluding current nomination)
    const activeBidsResult = await client.query(
      `SELECT COALESCE(SUM(ab.bid_amount), 0) as active_bids
       FROM auction_bids ab
       JOIN auction_nominations an ON ab.nomination_id = an.id
       WHERE an.draft_id = $1
         AND ab.roster_id = $2
         AND ab.is_winning = true
         AND an.status = 'active'
         AND an.id != $3`,
      [draftId, roster_id, nomination_id]
    );
    const activeBids = parseInt(activeBidsResult.rows[0].active_bids);

    // Get roster size to calculate minimum reserve
    const rosterCountResult = await client.query(
      `SELECT COUNT(*) as player_count
       FROM auction_nominations
       WHERE draft_id = $1
         AND winning_roster_id = $2
         AND status = 'completed'`,
      [draftId, roster_id]
    );
    const playerCount = parseInt(rosterCountResult.rows[0].player_count);

    // Get count of active nominations being won (excluding current nomination)
    const activeWinsResult = await client.query(
      `SELECT COUNT(*) as active_wins
       FROM auction_nominations
       WHERE draft_id = $1
         AND winning_roster_id = $2
         AND status = 'active'
         AND id != $3`,
      [draftId, roster_id, nomination_id]
    );
    const activeWins = parseInt(activeWinsResult.rows[0].active_wins);

    const rosterSize = draft.rounds || 15;
    const currentPlayerCount = playerCount + activeWins;
    const remainingSlots = rosterSize - currentPlayerCount - 1; // -1 for current bid

    // Calculate reserved amount if reserve_budget_per_slot is enabled
    let reserved = 0;
    if (draft.reserve_budget_per_slot && remainingSlots > 0) {
      reserved = remainingSlots * minBid;
    }

    const startingBudget = draft.starting_budget;
    const available = startingBudget - spent - activeBids - reserved;

    if (max_bid > available) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Insufficient budget. Available: $${available} (must reserve $${reserved} for remaining ${remainingSlots} slots)`,
      });
    }

    // Check roster size (don't allow bidding if roster is full)
    if (playerCount >= rosterSize) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Roster is full (${playerCount}/${rosterSize} players)`,
      });
    }

    // Process the bid (proxy or direct depending on draft type)
    let result;
    if (draft.draft_type === "slow_auction") {
      result = await processProxyBidTransaction(
        client,
        nomination_id,
        roster_id,
        max_bid,
        minBid,
        currentBids
      );
    } else {
      result = await processDirectBidTransaction(
        client,
        nomination_id,
        roster_id,
        max_bid,
        currentBids
      );
    }

    // CRITICAL: Revalidate budget before committing to prevent race condition
    console.log('[Auction] Revalidating budget before commit...');
    const revalidation = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN an.status = 'completed' THEN an.winning_bid ELSE 0 END), 0) as spent,
         COALESCE(SUM(CASE WHEN an.status = 'active' AND ab.is_winning THEN ab.bid_amount ELSE 0 END), 0) as active
       FROM auction_nominations an
       LEFT JOIN auction_bids ab ON ab.nomination_id = an.id AND ab.roster_id = $2 AND ab.is_winning = true
       WHERE an.draft_id = $1`,
      [draftId, roster_id]
    );

    const finalSpent = parseInt(revalidation.rows[0].spent || '0');
    const finalActive = parseInt(revalidation.rows[0].active || '0');
    const finalAvailable = startingBudget - finalSpent - finalActive - reserved;

    console.log(`[Auction] Revalidation - spent: ${finalSpent}, active: ${finalActive}, available: ${finalAvailable}`);

    if (result.currentBid.bidAmount > finalAvailable) {
      console.log(`[Auction] Budget exceeded on revalidation - bid: ${result.currentBid.bidAmount}, available: ${finalAvailable}`);
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({
        error: 'Insufficient budget: Budget changed due to concurrent bid',
        details: {
          required: result.currentBid.bidAmount,
          available: finalAvailable
        }
      });
    }

    console.log('[Auction] Budget revalidation passed, committing transaction');
    // Commit transaction
    await client.query('COMMIT');

    // Get team name for the bidder (after successful commit)
    const { getRosterTeamName } = await import("../models/Auction");
    const teamName = await getRosterTeamName(roster_id);

    // Broadcast to all clients in the auction room via socket
    try {
      const { io } = await import("../index");
      const room = `auction_${draftId}`;
      const bidWithTeamName = {
        ...result.currentBid,
        team_name: teamName,
      };
      io.to(room).emit("bid_placed", bidWithTeamName);
    } catch (socketError) {
      console.error('Socket emit failed:', socketError);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error("Error placing bid:", error);
    return res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
}

// Helper function to process proxy bid within a transaction
async function processProxyBidTransaction(
  client: any,
  nomination_id: number,
  new_roster_id: number,
  new_max_bid: number,
  min_bid: number,
  existing_bids: any[]
): Promise<{
  success: boolean;
  currentBid: any;
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
  const newBidResult = await client.query(
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

  const newBid = newBidResult.rows[0];

  // Add new bid to sorted list and re-sort
  const allBids = [...sortedBids, newBid].sort(
    (a, b) => b.max_bid - a.max_bid
  );

  // Determine winner using proxy bidding logic
  let winningBid;
  let winningAmount;

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
  await client.query(
    `UPDATE auction_bids
    SET is_winning = false
    WHERE nomination_id = $1`,
    [nomination_id]
  );

  const updatedWinningBid = await client.query(
    `UPDATE auction_bids
    SET is_winning = true,
        bid_amount = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *`,
    [winningBid.id, winningAmount]
  );

  // Update nomination with current winning info
  await client.query(
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

// Helper function to process direct bid within a transaction
async function processDirectBidTransaction(
  client: any,
  nomination_id: number,
  new_roster_id: number,
  bid_amount: number,
  existing_bids: any[]
): Promise<{
  success: boolean;
  currentBid: any;
  previousWinner?: number;
  newWinner: number;
}> {
  // Get current winning bid
  const currentWinner = existing_bids.find((b) => b.is_winning);

  // In direct bidding, bid_amount and max_bid are the same
  const newBidResult = await client.query(
    `INSERT INTO auction_bids
      (nomination_id, roster_id, bid_amount, max_bid, is_winning)
    VALUES ($1, $2, $3, $4, true)
    RETURNING *`,
    [nomination_id, new_roster_id, bid_amount, bid_amount]
  );

  const newBid = newBidResult.rows[0];

  // Mark all other bids as not winning
  await client.query(
    `UPDATE auction_bids
    SET is_winning = false
    WHERE nomination_id = $1 AND id != $2`,
    [nomination_id, newBid.id]
  );

  // Update nomination with current winning info
  await client.query(
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

// GET /api/drafts/:id/nominations
export async function getActiveNominationsHandler(req: Request, res: Response) {
  try {
    const draftId = parseInt(req.params.id);

    const nominations = await getActiveNominations(draftId);

    res.status(200).json(nominations);
  } catch (error: any) {
    console.error("Error getting nominations:", error);
    res.status(500).json({ error: error.message });
  }
}

// GET /api/drafts/:id/nominations/:nominationId/bids
export async function getNominationBidsHandler(req: Request, res: Response) {
  try {
    const nominationId = parseInt(req.params.nominationId);

    const bids = await getBidsForNomination(nominationId);

    // Don't expose max_bid to clients
    const sanitizedBids = bids.map((bid: any) => ({
      id: bid.id,
      nomination_id: bid.nomination_id,
      roster_id: bid.roster_id,
      bid_amount: bid.bid_amount,
      is_winning: bid.is_winning,
      created_at: bid.created_at,
      team_name: bid.team_name,
    }));

    res.status(200).json(sanitizedBids);
  } catch (error: any) {
    console.error("Error getting nomination bids:", error);
    res.status(500).json({ error: error.message });
  }
}

// GET /api/rosters/:id/budget
export async function getRosterBudgetHandler(req: Request, res: Response) {
  try {
    const rosterId = parseInt(req.params.id);
    const draftId = parseInt(req.query.draft_id as string);

    if (!draftId) {
      return res.status(400).json({ error: "draft_id query parameter required" });
    }

    const budget = await getRosterBudget(rosterId, draftId);

    return res.status(200).json(budget);
  } catch (error: any) {
    console.error("Error getting roster budget:", error);
    return res.status(500).json({ error: error.message });
  }
}

// DELETE /api/drafts/:id/nominations (for testing - clear all nominations)
export async function clearNominationsHandler(req: Request, res: Response) {
  try {
    const draftId = parseInt(req.params.id);

    const pool = (await import("../config/database")).default;
    await pool.query(
      'DELETE FROM auction_nominations WHERE draft_id = $1',
      [draftId]
    );

    return res.status(200).json({ success: true, message: 'All nominations cleared' });
  } catch (error: any) {
    console.error("Error clearing nominations:", error);
    return res.status(500).json({ error: error.message });
  }
}

// POST /api/drafts/:id/complete-auction
export async function completeAuctionHandler(req: Request, res: Response) {
  try {
    const draftId = parseInt(req.params.id);

    // Verify draft exists and is auction type
    const draft = await getDraftById(draftId);
    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    if (draft.draft_type !== "auction" && draft.draft_type !== "slow_auction") {
      return res
        .status(400)
        .json({ error: "Draft is not an auction draft type" });
    }

    if (draft.status !== "in_progress") {
      return res.status(400).json({ error: "Draft is not in progress" });
    }

    console.log(`[CompleteAuction] Manually completing auction draft ${draftId}`);

    // Complete the draft
    const updatedDraft = await completeDraft(draftId);

    // Assign auction players to rosters
    await assignAuctionPlayersToRosters(draftId);

    // Update league status to 'in_season'
    const league = await getLeagueById(draft.league_id);
    if (league) {
      await updateLeague(league.id, { status: "in_season" });

      const startWeek = league.settings?.start_week || 1;
      const playoffWeekStart = league.settings?.playoff_week_start || 15;

      // Generate matchups if they don't exist
      console.log(`[CompleteAuction] Checking/generating matchups...`);
      const { generateMatchupsForWeek } = await import("../models/Matchup");
      const { getMatchupsByLeagueAndWeek } = await import("../models/Matchup");

      for (let week = startWeek; week < playoffWeekStart; week++) {
        try {
          const existingMatchups = await getMatchupsByLeagueAndWeek(
            league.id,
            week
          );
          if (existingMatchups.length === 0) {
            console.log(`[CompleteAuction] Generating matchups for week ${week}...`);
            await generateMatchupsForWeek(league.id, week, league.season);
          }
        } catch (error) {
          console.error(
            `[CompleteAuction] Failed to generate matchups for week ${week}:`,
            error
          );
        }
      }

      // Calculate scores for all weeks
      console.log(`[CompleteAuction] Calculating scores for all weeks...`);
      const { updateMatchupScoresForWeek } = await import(
        "../services/scoringService"
      );
      const { finalizeWeekScores, recalculateAllRecords } = await import(
        "../services/recordService"
      );

      for (let week = startWeek; week < playoffWeekStart; week++) {
        try {
          console.log(`[CompleteAuction] Updating scores for week ${week}...`);
          await updateMatchupScoresForWeek(
            league.id,
            week,
            league.season,
            "regular"
          );
          await finalizeWeekScores(league.id, week, league.season, "regular");
        } catch (error) {
          console.error(
            `[CompleteAuction] Failed to update scores for week ${week}:`,
            error
          );
        }
      }

      // Recalculate all records
      console.log(`[CompleteAuction] Recalculating all records...`);
      try {
        await recalculateAllRecords(league.id, league.season);
      } catch (error) {
        console.error(`[CompleteAuction] Failed to recalculate records:`, error);
      }
    }

    return res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    console.error("Error completing auction:", error);
    return res.status(500).json({ error: error.message });
  }
}

// GET /api/drafts/:id/auction/activity
export async function getAuctionActivityHandler(req: Request, res: Response) {
  try {
    const draftId = parseInt(req.params.id);

    const { getAllNominations, getAllBidsForDraft } = await import("../models/Auction");

    // Get all nominations and all bids
    const [nominations, bids] = await Promise.all([
      getAllNominations(draftId),
      getAllBidsForDraft(draftId),
    ]);

    // Build activity items
    const activities: any[] = [];

    // Add nomination activities
    for (const nom of nominations) {
      const nomAny = nom as any; // Cast to any to access SQL JOIN fields
      activities.push({
        type: 'nomination',
        description: `${nomAny.player_name} nominated${nomAny.nominating_team_name ? ' by ' + nomAny.nominating_team_name : ''}`,
        timestamp: nom.created_at,
        playerId: nom.player_id,
        playerName: nomAny.player_name,
        rosterId: nom.nominating_roster_id,
        teamName: nomAny.nominating_team_name,
      });

      // Add won/expired activity for completed nominations
      if (nom.status === 'completed' && nom.winning_roster_id && nom.winning_bid) {
        activities.push({
          type: 'won',
          description: `${nomAny.winning_team_name || 'Unknown'} won ${nomAny.player_name} for $${nom.winning_bid}`,
          timestamp: nom.updated_at,
          playerId: nom.player_id,
          playerName: nomAny.player_name,
          rosterId: nom.winning_roster_id,
          teamName: nomAny.winning_team_name,
          amount: nom.winning_bid,
        });
      } else if (nom.status === 'passed') {
        activities.push({
          type: 'expired',
          description: `${nomAny.player_name} nomination expired (no bids)`,
          timestamp: nom.updated_at,
          playerId: nom.player_id,
          playerName: nomAny.player_name,
        });
      }
    }

    // Add bid activities (only show visible bids, not max_bid)
    for (const bid of bids) {
      const bidAny = bid as any; // Cast to any to access SQL JOIN fields
      const nomination = nominations.find(n => n.id === bid.nomination_id);
      if (nomination) {
        const nomAny = nomination as any;
        activities.push({
          type: 'bid',
          description: `${bidAny.team_name} bid $${bid.bid_amount} on ${nomAny.player_name}`,
          timestamp: bid.created_at,
          playerId: nomination.player_id,
          playerName: nomAny.player_name,
          rosterId: bid.roster_id,
          teamName: bidAny.team_name,
          amount: bid.bid_amount,
        });
      }
    }

    // Sort by timestamp descending (newest first)
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return res.status(200).json(activities);
  } catch (error: any) {
    console.error("Error getting auction activity:", error);
    return res.status(500).json({ error: error.message });
  }
}

// GET /api/drafts/:id/auction/rosters
export async function getAuctionRostersHandler(req: Request, res: Response) {
  try {
    const draftId = parseInt(req.params.id);

    const { getDraftById } = await import("../models/Draft");
    const draft = await getDraftById(draftId);
    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);
    if (!league) {
      return res.status(404).json({ error: "League not found" });
    }

    // Get all rosters in league
    const pool = (await import("../config/database")).default;
    const rostersResult = await pool.query(
      `SELECT r.id, r.roster_id, r.user_id, r.settings,
              u.username,
              COALESCE(r.settings->>'team_name', u.username) as team_name
       FROM rosters r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.league_id = $1
       ORDER BY r.roster_id ASC`,
      [draft.league_id]
    );

    const rosters = rostersResult.rows;

    // For each roster, get their won players and budget info
    const { getRosterBudget } = await import("../models/Auction");
    const rostersWithPlayers = await Promise.all(
      rosters.map(async (roster: any) => {
        // Get players won
        const playersResult = await pool.query(
          `SELECT an.player_id, an.winning_bid,
                  p.full_name, p.position, p.team
           FROM auction_nominations an
           LEFT JOIN players p ON an.player_id = p.player_id
           WHERE an.draft_id = $1
             AND an.winning_roster_id = $2
             AND an.status = 'completed'
           ORDER BY an.updated_at DESC`,
          [draftId, roster.id]
        );

        // Get budget info
        const budget = await getRosterBudget(roster.id, draftId);

        return {
          id: roster.id,
          roster_id: roster.roster_id,
          user_id: roster.user_id,
          username: roster.username,
          team_name: roster.team_name,
          players: playersResult.rows,
          budget: budget,
          player_count: playersResult.rows.length,
        };
      })
    );

    return res.status(200).json(rostersWithPlayers);
  } catch (error: any) {
    console.error("Error getting auction rosters:", error);
    return res.status(500).json({ error: error.message });
  }
}

// GET /api/drafts/:id/auction/available-players
export async function getAvailablePlayersHandler(req: Request, res: Response) {
  try {
    const draftId = parseInt(req.params.id);
    const { position, team, search } = req.query;

    // Get players that haven't been won in this auction yet
    const pool = (await import("../config/database")).default;

    let query = `
      SELECT p.*
      FROM players p
      WHERE p.player_id NOT IN (
        SELECT DISTINCT player_id
        FROM auction_nominations
        WHERE draft_id = $1
          AND status = 'completed'
          AND winning_roster_id IS NOT NULL
      )
    `;

    const params: any[] = [draftId];
    let paramIndex = 2;

    // Add optional filters
    if (position && position !== 'ALL') {
      query += ` AND p.position = $${paramIndex}`;
      params.push(position);
      paramIndex++;
    }

    if (team) {
      query += ` AND p.team = $${paramIndex}`;
      params.push(team);
      paramIndex++;
    }

    if (search) {
      query += ` AND (p.first_name ILIKE $${paramIndex} OR p.last_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Order by search_rank (lower is better, used as ADP proxy)
    query += ` ORDER BY p.search_rank ASC NULLS LAST LIMIT 500`;

    const result = await pool.query(query, params);

    return res.status(200).json(result.rows);
  } catch (error: any) {
    console.error("Error getting available players:", error);
    return res.status(500).json({ error: error.message });
  }
}
