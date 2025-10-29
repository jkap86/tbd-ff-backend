import { Request, Response } from "express";
import { io } from "../index";
import {
  emitTradeProposed,
  emitTradeProcessed,
  emitTradeRejected,
  emitTradeCancelled,
} from "../socket/tradeSocket";
import {
  proposeTrade,
  acceptTrade,
  rejectTrade,
  cancelTrade,
} from "../services/tradeService";
import {
  getLeagueTrades,
  getRosterTrades,
  getTradeWithDetails,
} from "../models/Trade";
import { createLeagueChatMessage } from "../models/LeagueChatMessage";
import { getLeagueById } from "../models/League";

/**
 * Propose a new trade
 * POST /api/trades/propose
 */
export async function proposeTradeController(req: Request, res: Response) {
  try {
    const {
      league_id,
      receiver_roster_id,
      players_giving,
      players_receiving,
      message,
      notify_league_chat = true,
      show_proposal_details = false,
    } = req.body;

    // Get proposer's roster (from authenticated user)
    const proposerRosterId = req.body.proposer_roster_id;

    if (!proposerRosterId) {
      return res.status(400).json({ error: "Proposer roster ID required" });
    }

    if (!receiver_roster_id) {
      return res.status(400).json({ error: "Receiver roster ID required" });
    }

    if (!players_giving || !Array.isArray(players_giving)) {
      return res.status(400).json({ error: "Players giving must be an array" });
    }

    if (!players_receiving || !Array.isArray(players_receiving)) {
      return res
        .status(400)
        .json({ error: "Players receiving must be an array" });
    }

    if (players_giving.length === 0 && players_receiving.length === 0) {
      return res
        .status(400)
        .json({ error: "Trade must include at least one player" });
    }

    // Get league settings to check trade notification preferences
    const league = await getLeagueById(league_id);
    if (!league) {
      return res.status(404).json({ error: "League not found" });
    }

    // Determine final notification settings based on league preferences
    let finalNotifyChat = notify_league_chat;
    let finalShowDetails = show_proposal_details;

    if (league.trade_notification_setting === 'always_off') {
      finalNotifyChat = false;
    } else if (league.trade_notification_setting === 'always_on') {
      finalNotifyChat = true;
    }
    // else 'proposer_choice' - use the proposer's preference

    if (league.trade_details_setting === 'always_off') {
      finalShowDetails = false;
    } else if (league.trade_details_setting === 'always_on') {
      finalShowDetails = true;
    }
    // else 'proposer_choice' - use the proposer's preference

    const trade = await proposeTrade({
      league_id,
      proposer_roster_id: proposerRosterId,
      receiver_roster_id,
      players_giving,
      players_receiving,
      message,
    });

    // Get full trade details
    const tradeWithDetails = await getTradeWithDetails(trade.id);

    if (!tradeWithDetails) {
      return res.status(500).json({ error: "Failed to retrieve trade details" });
    }

    // Emit socket event
    emitTradeProposed(io, league_id, tradeWithDetails);

    // Send league chat notification if enabled
    if (finalNotifyChat) {
      const proposerTeamName = tradeWithDetails.proposer_team_name || `Team ${tradeWithDetails.proposer_roster_id}`;
      const receiverTeamName = tradeWithDetails.receiver_team_name || `Team ${tradeWithDetails.receiver_roster_id}`;

      let chatMessageText = `${proposerTeamName} has proposed a trade to ${receiverTeamName}`;
      let metadata: any = { trade_id: tradeWithDetails.id };

      // Include trade details in metadata if requested
      if (finalShowDetails) {
        metadata.show_details = true;
        metadata.trade_details = {
          proposer_team: proposerTeamName,
          receiver_team: receiverTeamName,
          proposer_roster_id: tradeWithDetails.proposer_roster_id,
          receiver_roster_id: tradeWithDetails.receiver_roster_id,
          items: tradeWithDetails.items || [],
        };
      }

      // Save the system message to the database
      const chatMessage = await createLeagueChatMessage({
        league_id,
        user_id: null as any, // System message (null user_id)
        message: chatMessageText,
        message_type: "system",
        metadata,
      });

      // Broadcast to league room
      const roomName = `league_${league_id}`;
      io.to(roomName).emit("league_chat_message", {
        ...chatMessage,
        username: "System",
        // Parse metadata if it's a string (from DB)
        metadata: typeof chatMessage.metadata === 'string'
          ? JSON.parse(chatMessage.metadata)
          : chatMessage.metadata,
      });
    }

    return res.status(201).json({
      success: true,
      data: tradeWithDetails,
    });
  } catch (error: any) {
    console.error("Propose trade error:", error);
    return res.status(400).json({ error: error.message });
  }
}

/**
 * Accept a trade
 * POST /api/trades/:id/accept
 */
export async function acceptTradeController(req: Request, res: Response) {
  try {
    const tradeId = parseInt(req.params.id);
    const acceptorRosterId = req.body.roster_id;

    if (!acceptorRosterId) {
      return res.status(400).json({ error: "Roster ID required" });
    }

    const trade = await acceptTrade(tradeId, acceptorRosterId);

    // Get full trade details
    const tradeWithDetails = await getTradeWithDetails(trade.id);

    // Emit socket event
    if (tradeWithDetails) {
      emitTradeProcessed(io, tradeWithDetails.league_id, tradeWithDetails);
    }

    return res.status(200).json({
      success: true,
      data: tradeWithDetails,
    });
  } catch (error: any) {
    console.error("Accept trade error:", error);
    return res.status(400).json({ error: error.message });
  }
}

/**
 * Reject a trade
 * POST /api/trades/:id/reject
 */
export async function rejectTradeController(req: Request, res: Response) {
  try {
    const tradeId = parseInt(req.params.id);
    const rejecterId = req.body.roster_id;
    const reason = req.body.reason;

    if (!rejecterId) {
      return res.status(400).json({ error: "Roster ID required" });
    }

    const trade = await rejectTrade(tradeId, rejecterId, reason);

    // Get full trade details
    const tradeWithDetails = await getTradeWithDetails(trade.id);

    // Emit socket event
    if (tradeWithDetails) {
      emitTradeRejected(io, tradeWithDetails.league_id, tradeWithDetails);
    }

    return res.status(200).json({
      success: true,
      data: tradeWithDetails,
    });
  } catch (error: any) {
    console.error("Reject trade error:", error);
    return res.status(400).json({ error: error.message });
  }
}

/**
 * Cancel a trade
 * POST /api/trades/:id/cancel
 */
export async function cancelTradeController(req: Request, res: Response) {
  try {
    const tradeId = parseInt(req.params.id);
    const proposerId = req.body.roster_id;

    if (!proposerId) {
      return res.status(400).json({ error: "Roster ID required" });
    }

    const trade = await cancelTrade(tradeId, proposerId);

    // Get full trade details
    const tradeWithDetails = await getTradeWithDetails(trade.id);

    // Emit socket event
    if (tradeWithDetails) {
      emitTradeCancelled(io, tradeWithDetails.league_id, tradeWithDetails);
    }

    return res.status(200).json({
      success: true,
      data: tradeWithDetails,
    });
  } catch (error: any) {
    console.error("Cancel trade error:", error);
    return res.status(400).json({ error: error.message });
  }
}

/**
 * Get a single trade
 * GET /api/trades/:id
 */
export async function getTradeController(req: Request, res: Response) {
  try {
    const tradeId = parseInt(req.params.id);

    const trade = await getTradeWithDetails(tradeId);

    if (!trade) {
      return res.status(404).json({ error: "Trade not found" });
    }

    return res.status(200).json({
      success: true,
      data: trade,
    });
  } catch (error: any) {
    console.error("Get trade error:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Get all trades for a league
 * GET /api/leagues/:id/trades
 */
export async function getLeagueTradesController(req: Request, res: Response) {
  try {
    const leagueId = parseInt(req.params.id);
    const status = req.query.status as string | undefined;

    const trades = await getLeagueTrades(leagueId, status);

    return res.status(200).json({
      success: true,
      data: trades,
    });
  } catch (error: any) {
    console.error("Get league trades error:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Get all trades for a roster
 * GET /api/rosters/:id/trades
 */
export async function getRosterTradesController(req: Request, res: Response) {
  try {
    const rosterId = parseInt(req.params.id);

    const trades = await getRosterTrades(rosterId);

    return res.status(200).json({
      success: true,
      data: trades,
    });
  } catch (error: any) {
    console.error("Get roster trades error:", error);
    return res.status(500).json({ error: error.message });
  }
}
