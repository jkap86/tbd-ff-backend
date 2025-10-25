import { Request, Response } from "express";
import {
  createChatMessage,
  getChatMessagesWithDetails,
  getChatMessagesSince,
} from "../models/DraftChatMessage";
import { getDraftById } from "../models/Draft";

/**
 * Send a chat message
 * POST /api/drafts/:draftId/chat
 */
export async function sendChatMessageHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { user_id, message, message_type = "chat", metadata = {} } = req.body;

    if (!user_id || !message) {
      res.status(400).json({
        success: false,
        message: "user_id and message are required",
      });
      return;
    }

    // Verify draft exists
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    const chatMessage = await createChatMessage({
      draft_id: parseInt(draftId),
      user_id,
      message,
      message_type,
      metadata,
    });

    res.status(201).json({
      success: true,
      data: chatMessage,
    });
  } catch (error: any) {
    console.error("Error sending chat message:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error sending chat message",
    });
  }
}

/**
 * Get chat messages for a draft
 * GET /api/drafts/:draftId/chat
 */
export async function getChatMessagesHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { limit = 100, since } = req.query;

    let messages;

    if (since) {
      // Get messages since a specific timestamp
      messages = await getChatMessagesSince(
        parseInt(draftId),
        new Date(since as string)
      );
    } else {
      // Get recent messages
      messages = await getChatMessagesWithDetails(
        parseInt(draftId),
        parseInt(limit as string)
      );
    }

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error: any) {
    console.error("Error getting chat messages:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting chat messages",
    });
  }
}
