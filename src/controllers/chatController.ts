import { Request, Response } from "express";
import {
  createChatMessage,
  getChatMessagesWithDetails,
  getChatMessagesSince,
} from "../models/DraftChatMessage";
import { getDraftById } from "../models/Draft";
import { BaseController } from "./BaseController";

// Before: 100 lines
// After: 83 lines
// Lines saved: 17

class ChatController extends BaseController {
  /**
   * Send a chat message
   * POST /api/drafts/:draftId/chat
   */
  sendChatMessage = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const draftId = this.validateId(req.params.draftId, "Draft ID");
    const { user_id, message, message_type = "chat", metadata = {} } = req.body;

    // Validate required fields
    const validated = this.validateRequiredFields(req.body, ['user_id', 'message']);
    if (!validated) {
      return this.respondBadRequest(res, "user_id and message are required");
    }

    // Verify draft exists
    const draft = await getDraftById(draftId);
    if (!draft) {
      return this.respondNotFound(res, "Draft not found");
    }

    const chatMessage = await createChatMessage({
      draft_id: draftId,
      user_id,
      message,
      message_type,
      metadata,
    });

    this.respondCreated(res, chatMessage);
  });

  /**
   * Get chat messages for a draft
   * GET /api/drafts/:draftId/chat
   */
  getChatMessages = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const draftId = this.validateId(req.params.draftId, "Draft ID");
    const { limit = 100, since } = req.query;

    let messages;

    if (since) {
      // Get messages since a specific timestamp
      messages = await getChatMessagesSince(
        draftId,
        new Date(since as string)
      );
    } else {
      // Get recent messages
      messages = await getChatMessagesWithDetails(
        draftId,
        parseInt(limit as string)
      );
    }

    this.respondSuccess(res, messages);
  });
}

const controller = new ChatController();

export const sendChatMessageHandler = controller.sendChatMessage;
export const getChatMessagesHandler = controller.getChatMessages;
