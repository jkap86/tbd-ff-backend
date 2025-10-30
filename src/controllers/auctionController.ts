import { Request, Response } from "express";
import {
  createNomination,
  getActiveNominations,
  placeBid,
  getBidsForNomination,
  getRosterBudget,
  assignAuctionPlayersToRosters,
  advanceAuctionTurn,
} from "../models/Auction";
import { getDraftById, completeDraft, updateDraft } from "../models/Draft";
import { getLeagueById, updateLeague } from "../models/League";

// POST /api/drafts/:id/nominate
export async function nominatePlayerHandler(req: Request, res: Response) {
  try {
    const draftId = parseInt(req.params.id);
    const { player_id, roster_id, deadline } = req.body;

    if (!player_id || !roster_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

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

    // For slow auction, check nominations per manager limit
    if (draft.draft_type === "slow_auction") {
      const activeNominations = await getActiveNominations(draftId);
      // Count how many active nominations this manager currently has
      const managerActiveNominations = activeNominations.filter(
        (nom: any) => nom.nominating_roster_id === roster_id
      );
      const nominationsPerManager = draft.nominations_per_manager || 3;

      if (managerActiveNominations.length >= nominationsPerManager) {
        return res.status(400).json({
          error: `You have reached your nomination limit (${nominationsPerManager} active nominations)`,
        });
      }
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

    const nomination = await createNomination({
      draft_id: draftId,
      player_id,
      nominating_roster_id: roster_id,
      deadline: calculatedDeadline,
    });

    // Broadcast to all clients in the auction room via socket
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

    return res.status(201).json(nomination);
  } catch (error: any) {
    console.error("Error nominating player:", error);
    return res.status(500).json({ error: error.message });
  }
}

// POST /api/drafts/:id/bid
export async function placeBidHandler(req: Request, res: Response) {
  try {
    const draftId = parseInt(req.params.id);
    const { nomination_id, roster_id, max_bid } = req.body;

    if (!nomination_id || !roster_id || !max_bid) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify draft exists
    const draft = await getDraftById(draftId);
    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    const result = await placeBid({
      nomination_id,
      roster_id,
      max_bid,
    });

    // Get team name for the bidder
    const { getRosterTeamName } = await import("../models/Auction");
    const teamName = await getRosterTeamName(roster_id);

    // Broadcast to all clients in the auction room via socket
    const { io } = await import("../index");
    const room = `auction_${draftId}`;
    const bidWithTeamName = {
      ...result.currentBid,
      team_name: teamName,
    };
    io.to(room).emit("bid_placed", bidWithTeamName);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error placing bid:", error);
    return res.status(400).json({ error: error.message });
  }
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
    const sanitizedBids = bids.map((bid) => ({
      id: bid.id,
      nomination_id: bid.nomination_id,
      roster_id: bid.roster_id,
      bid_amount: bid.bid_amount,
      is_winning: bid.is_winning,
      created_at: bid.created_at,
      team_name: (bid as any).team_name,
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
