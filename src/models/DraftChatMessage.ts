import pool from "../config/database";

export interface DraftChatMessage {
  id: number;
  draft_id: number;
  user_id: number;
  message: string;
  message_type: "chat" | "system" | "pick_announcement";
  metadata: any;
  created_at: Date;
}

/**
 * Create a chat message
 */
export async function createChatMessage(messageData: {
  draft_id: number;
  user_id: number;
  message: string;
  message_type?: "chat" | "system" | "pick_announcement";
  metadata?: any;
}): Promise<DraftChatMessage> {
  try {
    const query = `
      INSERT INTO draft_chat_messages (
        draft_id, user_id, message, message_type, metadata
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await pool.query(query, [
      messageData.draft_id,
      messageData.user_id,
      messageData.message,
      messageData.message_type || "chat",
      JSON.stringify(messageData.metadata || {}),
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("Error creating chat message:", error);
    throw new Error("Error creating chat message");
  }
}

/**
 * Get chat messages for a draft
 */
export async function getChatMessages(
  draftId: number,
  limit: number = 100
): Promise<DraftChatMessage[]> {
  try {
    const query = `
      SELECT * FROM draft_chat_messages
      WHERE draft_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [draftId, limit]);
    return result.rows.reverse(); // Return in chronological order
  } catch (error) {
    console.error("Error getting chat messages:", error);
    throw new Error("Error getting chat messages");
  }
}

/**
 * Get chat messages with user details
 */
export async function getChatMessagesWithDetails(
  draftId: number,
  limit: number = 100
): Promise<any[]> {
  try {
    const query = `
      SELECT
        dcm.*,
        u.username
      FROM draft_chat_messages dcm
      JOIN users u ON dcm.user_id = u.id
      WHERE dcm.draft_id = $1
      ORDER BY dcm.created_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [draftId, limit]);
    return result.rows.reverse(); // Return in chronological order
  } catch (error) {
    console.error("Error getting chat messages with details:", error);
    throw new Error("Error getting chat messages with details");
  }
}

/**
 * Get chat messages since a specific timestamp
 */
export async function getChatMessagesSince(
  draftId: number,
  since: Date
): Promise<DraftChatMessage[]> {
  try {
    const query = `
      SELECT
        dcm.*,
        u.username
      FROM draft_chat_messages dcm
      JOIN users u ON dcm.user_id = u.id
      WHERE dcm.draft_id = $1 AND dcm.created_at > $2
      ORDER BY dcm.created_at ASC
    `;

    const result = await pool.query(query, [draftId, since]);
    return result.rows;
  } catch (error) {
    console.error("Error getting chat messages since timestamp:", error);
    throw new Error("Error getting chat messages since timestamp");
  }
}

/**
 * Delete all chat messages for a draft
 */
export async function deleteChatMessages(draftId: number): Promise<void> {
  try {
    const query = `DELETE FROM draft_chat_messages WHERE draft_id = $1`;
    await pool.query(query, [draftId]);
  } catch (error) {
    console.error("Error deleting chat messages:", error);
    throw new Error("Error deleting chat messages");
  }
}
