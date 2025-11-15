import { createLeagueChatMessage, LeagueChatMessage } from "../models/LeagueChatMessage";
import { logger } from "../utils/logger";
import { IEventBus } from "../interfaces/IEventBus";

/**
 * League Chat Service - Consolidates chat message creation and emission logic
 * to eliminate duplication across controllers.
 */

export interface SystemMessageMetadata {
  type: string;
  [key: string]: any;
}

/**
 * Sends a system message to a league chat and emits it via EventBus.
 * Handles all the boilerplate of creating the message, parsing metadata, and emitting.
 *
 * @param eventBus - EventBus instance
 * @param leagueId - ID of the league
 * @param message - The message text to display
 * @param metadata - Message metadata (type and additional data)
 * @returns The created chat message
 *
 * @example
 * ```typescript
 * await sendSystemMessage(eventBus, leagueId, "Derby has started", {
 *   type: "derby_started",
 *   draft_id: draftId
 * });
 * ```
 */
export async function sendSystemMessage(
  eventBus: IEventBus,
  leagueId: number,
  message: string,
  metadata: SystemMessageMetadata
): Promise<LeagueChatMessage> {
  try {
    // Create the chat message in database
    const chatMessage = await createLeagueChatMessage({
      league_id: leagueId,
      user_id: null, // System message
      message,
      message_type: "system",
      metadata,
    });

    // Emit to league room via EventBus
    eventBus.emitToRoom(`league:${leagueId}`, "leagueChat:message", chatMessage);

    return chatMessage;
  } catch (error) {
    logger.error(`Error sending system message to league ${leagueId}:`, error);
    throw error;
  }
}

/**
 * Sends a system message with collapsible details.
 * Use this for messages with additional information that can be expanded by users.
 *
 * @param eventBus - EventBus instance
 * @param leagueId - ID of the league
 * @param message - The message text to display
 * @param type - The metadata type identifier
 * @param details - Additional details to show when expanded
 * @returns The created chat message
 *
 * @example
 * ```typescript
 * await sendCollapsibleSystemMessage(eventBus, leagueId, "Draft order set", "derby_completed", {
 *   draft_order: orderList
 * });
 * ```
 */
export async function sendCollapsibleSystemMessage(
  eventBus: IEventBus,
  leagueId: number,
  message: string,
  type: string,
  details: any
): Promise<LeagueChatMessage> {
  return sendSystemMessage(eventBus, leagueId, message, {
    type,
    collapsible: true,
    details,
  });
}

/**
 * Sends a system message without throwing errors on failure.
 * Use this when the chat message is non-critical and shouldn't fail the parent operation.
 *
 * @param eventBus - EventBus instance
 * @param leagueId - ID of the league
 * @param message - The message text to display
 * @param metadata - Message metadata (type and additional data)
 * @returns The created chat message or null if failed
 *
 * @example
 * ```typescript
 * await sendSystemMessageSafe(eventBus, leagueId, "Player nominated", {
 *   type: "player_nominated",
 *   player_id: playerId
 * });
 * ```
 */
export async function sendSystemMessageSafe(
  eventBus: IEventBus,
  leagueId: number,
  message: string,
  metadata: SystemMessageMetadata
): Promise<LeagueChatMessage | null> {
  try {
    return await sendSystemMessage(eventBus, leagueId, message, metadata);
  } catch (error) {
    logger.error(`Failed to send system message (non-critical): ${message}`, error);
    return null;
  }
}

/**
 * Sends a collapsible system message without throwing errors on failure.
 * Combines collapsible functionality with safe error handling.
 *
 * @param eventBus - EventBus instance
 * @param leagueId - ID of the league
 * @param message - The message text to display
 * @param type - The metadata type identifier
 * @param details - Additional details to show when expanded
 * @returns The created chat message or null if failed
 */
export async function sendCollapsibleSystemMessageSafe(
  eventBus: IEventBus,
  leagueId: number,
  message: string,
  type: string,
  details: any
): Promise<LeagueChatMessage | null> {
  try {
    return await sendCollapsibleSystemMessage(eventBus, leagueId, message, type, details);
  } catch (error) {
    logger.error(`Failed to send collapsible system message (non-critical): ${message}`, error);
    return null;
  }
}
