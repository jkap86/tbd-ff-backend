import { Request, Response } from "express";
import {
  createLeagueChatMessage,
  getLeagueChatMessagesWithDetails,
  getLeagueChatMessagesSince,
} from "../models/LeagueChatMessage";
import { getLeagueById } from "../models/League";
import { sendPushNotification } from "../services/pushNotificationService";
import { getUserById } from "../models/User";
import pool from "../config/database";

/**
 * Send a league chat message
 * POST /api/leagues/:leagueId/chat
 */
export async function sendLeagueChatMessageHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { user_id, message, message_type = "chat", metadata = {} } = req.body;

    if (!user_id || !message) {
      res.status(400).json({
        success: false,
        message: "user_id and message are required",
      });
      return;
    }

    // Verify league exists
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const chatMessage = await createLeagueChatMessage({
      league_id: parseInt(leagueId),
      user_id,
      message,
      message_type,
      metadata,
    });

    // Send push notifications to other league members
    try {
      const sender = await getUserById(user_id);
      const senderUsername = sender?.username || "Someone";

      // Get all league members except the sender
      const leagueMembersQuery = await pool.query(
        `SELECT user_id FROM league_users WHERE league_id = $1 AND user_id != $2`,
        [parseInt(leagueId), user_id]
      );

      const recipientUserIds = leagueMembersQuery.rows.map((row: any) => row.user_id);

      if (recipientUserIds.length > 0) {
        await sendPushNotification({
          userIds: recipientUserIds,
          type: 'league_chat',
          payload: {
            title: `${senderUsername} in ${league.name}`,
            body: message.length > 100 ? `${message.substring(0, 97)}...` : message,
            data: {
              type: 'league_chat',
              league_id: leagueId,
              league_name: league.name,
              sender_id: user_id.toString(),
              sender_username: senderUsername,
            },
          },
        });
      }
    } catch (notifError: any) {
      // Log but don't fail the request if notification fails
      console.error("Error sending league chat notification:", notifError);
    }

    res.status(201).json({
      success: true,
      data: chatMessage,
    });
  } catch (error: any) {
    console.error("Error sending league chat message:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error sending league chat message",
    });
  }
}

/**
 * Get chat messages for a league
 * GET /api/leagues/:leagueId/chat
 */
export async function getLeagueChatMessagesHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { limit = 100, since } = req.query;

    let messages;

    if (since) {
      // Get messages since a specific timestamp
      messages = await getLeagueChatMessagesSince(
        parseInt(leagueId),
        new Date(since as string)
      );
    } else {
      // Get recent messages
      messages = await getLeagueChatMessagesWithDetails(
        parseInt(leagueId),
        parseInt(limit as string)
      );
    }

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error: any) {
    console.error("Error getting league chat messages:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting league chat messages",
    });
  }
}
