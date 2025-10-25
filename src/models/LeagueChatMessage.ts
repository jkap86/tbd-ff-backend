import pool from "../config/database";

export interface LeagueChatMessage {
  id: number;
  league_id: number;
  user_id: number;
  message: string;
  message_type: "chat" | "system";
  metadata: any;
  created_at: Date;
}

/**
 * Create a league chat message
 */
export async function createLeagueChatMessage(messageData: {
  league_id: number;
  user_id: number;
  message: string;
  message_type?: "chat" | "system";
  metadata?: any;
}): Promise<LeagueChatMessage> {
  try {
    const query = `
      INSERT INTO league_chat_messages (
        league_id, user_id, message, message_type, metadata
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await pool.query(query, [
      messageData.league_id,
      messageData.user_id,
      messageData.message,
      messageData.message_type || "chat",
      JSON.stringify(messageData.metadata || {}),
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("Error creating league chat message:", error);
    throw new Error("Error creating league chat message");
  }
}

/**
 * Get chat messages for a league
 */
export async function getLeagueChatMessages(
  leagueId: number,
  limit: number = 100
): Promise<LeagueChatMessage[]> {
  try {
    const query = `
      SELECT * FROM league_chat_messages
      WHERE league_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [leagueId, limit]);
    return result.rows.reverse(); // Return in chronological order
  } catch (error) {
    console.error("Error getting league chat messages:", error);
    throw new Error("Error getting league chat messages");
  }
}

/**
 * Get league chat messages with user details
 */
export async function getLeagueChatMessagesWithDetails(
  leagueId: number,
  limit: number = 100
): Promise<any[]> {
  try {
    const query = `
      SELECT
        lcm.*,
        u.username
      FROM league_chat_messages lcm
      JOIN users u ON lcm.user_id = u.id
      WHERE lcm.league_id = $1
      ORDER BY lcm.created_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [leagueId, limit]);
    return result.rows.reverse(); // Return in chronological order
  } catch (error) {
    console.error("Error getting league chat messages with details:", error);
    throw new Error("Error getting league chat messages with details");
  }
}

/**
 * Get league chat messages since a specific timestamp
 */
export async function getLeagueChatMessagesSince(
  leagueId: number,
  since: Date
): Promise<LeagueChatMessage[]> {
  try {
    const query = `
      SELECT
        lcm.*,
        u.username
      FROM league_chat_messages lcm
      JOIN users u ON lcm.user_id = u.id
      WHERE lcm.league_id = $1 AND lcm.created_at > $2
      ORDER BY lcm.created_at ASC
    `;

    const result = await pool.query(query, [leagueId, since]);
    return result.rows;
  } catch (error) {
    console.error("Error getting league chat messages since timestamp:", error);
    throw new Error("Error getting league chat messages since timestamp");
  }
}

/**
 * Delete all chat messages for a league
 */
export async function deleteLeagueChatMessages(leagueId: number): Promise<void> {
  try {
    const query = `DELETE FROM league_chat_messages WHERE league_id = $1`;
    await pool.query(query, [leagueId]);
  } catch (error) {
    console.error("Error deleting league chat messages:", error);
    throw new Error("Error deleting league chat messages");
  }
}
