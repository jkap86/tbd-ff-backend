// Before refactor: 269 lines
// After refactor: 213 lines
// Lines saved: 56 lines

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
import { io } from "../index";
import { emitLeagueChat } from "../socket/leagueSocket";
import { logger } from "../config/logger";
import { BaseController } from "./BaseController";

/**
 * Mark league chat as read for a user
 * Updates the last_read_at timestamp in league_chat_read_status
 */
async function markLeagueChatAsRead(
  userId: number,
  leagueId: number
): Promise<void> {
  await pool.query(
    `INSERT INTO league_chat_read_status (user_id, league_id, last_read_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (user_id, league_id)
     DO UPDATE SET last_read_at = NOW(), updated_at = NOW()`,
    [userId, leagueId]
  );
}

/**
 * Get unread message count for a user in a league
 * Counts messages created after the user's last_read_at timestamp
 */
async function getUnreadMessageCount(
  userId: number,
  leagueId: number
): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as unread_count
     FROM league_chat_messages lcm
     LEFT JOIN league_chat_read_status lcrs
       ON lcrs.user_id = $1 AND lcrs.league_id = $2
     WHERE lcm.league_id = $2
       AND (lcrs.last_read_at IS NULL OR lcm.created_at > lcrs.last_read_at)`,
    [userId, leagueId]
  );
  return parseInt(result.rows[0]?.unread_count || "0");
}

class LeagueChatController extends BaseController {
  /**
   * Send a league chat message
   * POST /api/leagues/:leagueId/chat
   */
  sendLeagueChatMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;
    const { user_id, message, message_type = "chat", metadata = {} } = req.body;

    if (!user_id || !message) {
      this.respondBadRequest(res, "user_id and message are required");
      return;
    }

    // Verify league exists
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    const chatMessage = await createLeagueChatMessage({
      league_id: parseInt(leagueId),
      user_id,
      message,
      message_type,
      metadata,
    });

    // Get sender info for socket emission
    const sender = await getUserById(user_id);
    const senderUsername = sender?.username || "Someone";

    // Emit socket event to all users in the league room
    emitLeagueChat(io, parseInt(leagueId), {
      ...chatMessage,
      username: senderUsername,
    });

    // Send push notifications to other league members
    try {

      // Get all league members except the sender
      const leagueMembersQuery = await pool.query(
        `SELECT user_id FROM rosters WHERE league_id = $1 AND user_id != $2`,
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
      logger.error("Error sending league chat notification:", notifError);
    }

    this.respondCreated(res, chatMessage);
  });

  /**
   * Get chat messages for a league
   * GET /api/leagues/:leagueId/chat
   */
  getLeagueChatMessages = this.asyncHandler(async (req: Request, res: Response) => {
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

    // Parse metadata for all messages (it's stored as JSON string in DB)
    const parsedMessages = messages.map(msg => ({
      ...msg,
      metadata: typeof msg.metadata === 'string'
        ? JSON.parse(msg.metadata)
        : msg.metadata
    }));

    this.respondSuccess(res, parsedMessages);
  });

  /**
   * Mark league chat as read for the authenticated user
   * POST /api/leagues/:leagueId/chat/mark-read
   */
  markLeagueChatAsRead = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;
    const userId = this.getAuthenticatedUserId(req);

    logger.info('[MarkRead] Request received:', {
      leagueId,
      user: (req as any).user,
      userId,
      hasAuthHeader: !!req.headers.authorization,
    });

    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    await markLeagueChatAsRead(userId, parseInt(leagueId));

    this.respondSuccess(res, null, "Chat marked as read");
  });

  /**
   * Get unread message count for the authenticated user
   * GET /api/leagues/:leagueId/chat/unread-count
   */
  getUnreadMessageCount = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;
    const userId = this.getAuthenticatedUserId(req);

    logger.info('[UnreadCount] Request received:', {
      leagueId,
      user: (req as any).user,
      userId,
      hasAuthHeader: !!req.headers.authorization,
    });

    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    const unreadCount = await getUnreadMessageCount(userId, parseInt(leagueId));

    this.respondSuccess(res, { unread_count: unreadCount });
  });
}

const leagueChatController = new LeagueChatController();
export const sendLeagueChatMessageHandler = leagueChatController.sendLeagueChatMessage;
export const getLeagueChatMessagesHandler = leagueChatController.getLeagueChatMessages;
export const markLeagueChatAsReadHandler = leagueChatController.markLeagueChatAsRead;
export const getUnreadMessageCountHandler = leagueChatController.getUnreadMessageCount;
