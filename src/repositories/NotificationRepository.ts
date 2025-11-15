import { BaseRepository } from "../models/BaseRepository";
import { logger } from "../config/logger";

export interface PushToken {
  id: number;
  user_id: number;
  token: string;
  device_type: 'ios' | 'android' | 'web';
  device_id: string;
  is_active: boolean;
  last_used_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationPreferences {
  id: number;
  user_id: number;
  draft_your_turn: boolean;
  draft_other_picks: boolean;
  draft_completed: boolean;
  trade_proposed: boolean;
  trade_accepted: boolean;
  trade_declined: boolean;
  trade_league_announcements: boolean;
  waiver_processed: boolean;
  waiver_outbid: boolean;
  matchup_started: boolean;
  matchup_ended: boolean;
  playoff_started: boolean;
  league_announcements: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * NotificationRepository - Centralized repository for all notification-related queries
 *
 * This repository manages two main entities:
 * 1. Push Tokens - Device registration for push notifications
 * 2. Notification Preferences - User preferences for different notification types
 *
 * Benefits:
 * - Centralizes all notification data access logic
 * - Provides consistent error handling
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across services
 * - Manages token lifecycle (registration, deactivation, cleanup)
 */
export class NotificationRepository extends BaseRepository<PushToken> {
  constructor() {
    super('push_tokens', 'id');
  }

  // ========== Push Token Management ==========

  /**
   * Register a push notification token for a user
   * Uses UPSERT to handle token updates for existing devices
   *
   * @param userId - The user ID
   * @param token - The push notification token
   * @param deviceType - Type of device (ios, android, web)
   * @param deviceId - Unique device identifier
   * @returns The registered push token
   */
  async registerToken(
    userId: number,
    token: string,
    deviceType: 'ios' | 'android' | 'web',
    deviceId?: string
  ): Promise<PushToken> {
    try {
      const finalDeviceId = deviceId || `${deviceType}_${userId}`;

      const query = `
        INSERT INTO push_tokens (user_id, token, device_type, device_id, is_active, last_used_at)
        VALUES ($1, $2, $3, $4, TRUE, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, device_id)
        DO UPDATE SET
          token = EXCLUDED.token,
          is_active = TRUE,
          updated_at = CURRENT_TIMESTAMP,
          last_used_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await this.query(query, [userId, token, deviceType, finalDeviceId]);

      logger.debug('Registered push token', {
        userId,
        deviceType,
        deviceId: finalDeviceId,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error registering push token:', { userId, deviceType, error });
      throw new Error('Failed to register push token');
    }
  }

  /**
   * Deactivate push tokens for a user
   * Optionally filter by device ID
   *
   * @param userId - The user ID
   * @param deviceId - Optional device ID to deactivate specific device
   * @returns Number of tokens deactivated
   */
  async deactivateTokens(userId: number, deviceId?: string): Promise<number> {
    try {
      let query: string;
      let params: any[];

      if (deviceId) {
        query = 'UPDATE push_tokens SET is_active = FALSE WHERE user_id = $1 AND device_id = $2';
        params = [userId, deviceId];
      } else {
        query = 'UPDATE push_tokens SET is_active = FALSE WHERE user_id = $1';
        params = [userId];
      }

      const result = await this.query(query, params);

      logger.debug('Deactivated push tokens', {
        userId,
        deviceId,
        deactivatedCount: result.rowCount,
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error deactivating push tokens:', { userId, deviceId, error });
      throw new Error('Failed to deactivate push tokens');
    }
  }

  /**
   * Get active push tokens for one or more users
   *
   * @param userIds - Array of user IDs
   * @returns Array of active push tokens
   */
  async getActiveTokens(userIds: number[]): Promise<PushToken[]> {
    try {
      const query = `
        SELECT user_id, token, device_type, device_id
        FROM push_tokens
        WHERE user_id = ANY($1) AND is_active = TRUE
      `;

      const result = await this.query(query, [userIds]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting active push tokens:', { userIds, error });
      throw new Error('Failed to get active push tokens');
    }
  }

  /**
   * Get all push tokens for a user (active and inactive)
   *
   * @param userId - The user ID
   * @returns Array of all push tokens for the user
   */
  async getTokensByUser(userId: number): Promise<PushToken[]> {
    try {
      const query = `
        SELECT * FROM push_tokens
        WHERE user_id = $1
        ORDER BY created_at DESC
      `;

      const result = await this.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting tokens by user:', { userId, error });
      throw new Error('Failed to get tokens by user');
    }
  }

  /**
   * Update last_used_at timestamp for a token
   * Called when successfully sending a notification
   *
   * @param tokenId - The push token ID
   * @returns Updated push token or null if not found
   */
  async updateLastUsed(tokenId: number): Promise<PushToken | null> {
    try {
      const query = `
        UPDATE push_tokens
        SET last_used_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.query(query, [tokenId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating last used timestamp:', { tokenId, error });
      throw new Error('Failed to update last used timestamp');
    }
  }

  /**
   * Delete inactive tokens older than specified date
   * Used for cleanup of old/unused tokens
   *
   * @param beforeDate - Delete tokens last used before this date
   * @returns Number of tokens deleted
   */
  async deleteInactiveTokens(beforeDate: Date): Promise<number> {
    try {
      const query = `
        DELETE FROM push_tokens
        WHERE is_active = FALSE AND last_used_at < $1
      `;

      const result = await this.query(query, [beforeDate]);

      logger.info('Deleted inactive push tokens', {
        beforeDate: beforeDate.toISOString(),
        deletedCount: result.rowCount,
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error deleting inactive tokens:', { beforeDate, error });
      throw new Error('Failed to delete inactive tokens');
    }
  }

  /**
   * Get count of active tokens by device type
   * Useful for analytics and debugging
   *
   * @returns Object with counts by device type
   */
  async getActiveTokenCounts(): Promise<{
    ios: number;
    android: number;
    web: number;
    total: number;
  }> {
    try {
      const query = `
        SELECT
          device_type,
          COUNT(*) as count
        FROM push_tokens
        WHERE is_active = TRUE
        GROUP BY device_type
      `;

      const result = await this.query(query, []);

      const counts = {
        ios: 0,
        android: 0,
        web: 0,
        total: 0,
      };

      result.rows.forEach((row) => {
        counts[row.device_type as keyof typeof counts] = parseInt(row.count, 10);
        counts.total += parseInt(row.count, 10);
      });

      return counts;
    } catch (error) {
      logger.error('Error getting active token counts:', { error });
      throw new Error('Failed to get active token counts');
    }
  }

  // ========== Notification Preferences Management ==========

  /**
   * Get notification preferences for a user
   * Creates default preferences if none exist
   *
   * @param userId - The user ID
   * @returns User's notification preferences
   */
  async getPreferences(userId: number): Promise<NotificationPreferences> {
    try {
      const query = `
        SELECT * FROM notification_preferences
        WHERE user_id = $1
      `;

      const result = await this.query(query, [userId]);

      if (result.rows.length === 0) {
        // Create default preferences if none exist
        return await this.createDefaultPreferences(userId);
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting notification preferences:', { userId, error });
      throw new Error('Failed to get notification preferences');
    }
  }

  /**
   * Create default notification preferences for a user
   * All notifications enabled by default
   *
   * @param userId - The user ID
   * @returns Created notification preferences
   */
  async createDefaultPreferences(userId: number): Promise<NotificationPreferences> {
    try {
      const query = `
        INSERT INTO notification_preferences (
          user_id,
          draft_your_turn,
          draft_other_picks,
          draft_completed,
          trade_proposed,
          trade_accepted,
          trade_declined,
          trade_league_announcements,
          waiver_processed,
          waiver_outbid,
          matchup_started,
          matchup_ended,
          playoff_started,
          league_announcements
        )
        VALUES ($1, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
        ON CONFLICT (user_id) DO NOTHING
        RETURNING *
      `;

      const result = await this.query(query, [userId]);

      logger.debug('Created default notification preferences', { userId });

      // If ON CONFLICT prevented insert, fetch existing
      if (result.rows.length === 0) {
        return await this.getPreferences(userId);
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating default notification preferences:', { userId, error });
      throw new Error('Failed to create default notification preferences');
    }
  }

  /**
   * Update notification preferences for a user
   * Uses UPSERT to handle creation if preferences don't exist
   *
   * @param userId - The user ID
   * @param preferences - Partial preferences to update
   * @returns Updated notification preferences
   */
  async updatePreferences(
    userId: number,
    preferences: Partial<Omit<NotificationPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<NotificationPreferences> {
    try {
      // Build dynamic SET clause
      const updates: string[] = [];
      const values: any[] = [userId];
      let paramIndex = 2;

      Object.entries(preferences).forEach(([key, value]) => {
        updates.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      });

      const query = `
        INSERT INTO notification_preferences (
          user_id,
          draft_your_turn,
          draft_other_picks,
          draft_completed,
          trade_proposed,
          trade_accepted,
          trade_declined,
          trade_league_announcements,
          waiver_processed,
          waiver_outbid,
          matchup_started,
          matchup_ended,
          playoff_started,
          league_announcements
        )
        VALUES ($1, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
        ON CONFLICT (user_id) DO UPDATE SET
          ${updates.join(', ')},
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await this.query(query, values);

      logger.debug('Updated notification preferences', { userId, preferences });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating notification preferences:', { userId, preferences, error });
      throw new Error('Failed to update notification preferences');
    }
  }

  /**
   * Check if a user has a specific notification type enabled
   *
   * @param userId - The user ID
   * @param notificationType - The notification type to check
   * @returns True if notification is enabled
   */
  async isNotificationEnabled(userId: number, notificationType: keyof Omit<NotificationPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<boolean> {
    try {
      const preferences = await this.getPreferences(userId);
      return preferences[notificationType] ?? true; // Default to true if not set
    } catch (error) {
      logger.error('Error checking notification preference:', { userId, notificationType, error });
      // Default to true on error to avoid missing critical notifications
      return true;
    }
  }

  /**
   * Disable all notifications for a user
   *
   * @param userId - The user ID
   * @returns Updated notification preferences
   */
  async disableAllNotifications(userId: number): Promise<NotificationPreferences> {
    return await this.updatePreferences(userId, {
      draft_your_turn: false,
      draft_other_picks: false,
      draft_completed: false,
      trade_proposed: false,
      trade_accepted: false,
      trade_declined: false,
      trade_league_announcements: false,
      waiver_processed: false,
      waiver_outbid: false,
      matchup_started: false,
      matchup_ended: false,
      playoff_started: false,
      league_announcements: false,
    });
  }

  /**
   * Enable all notifications for a user
   *
   * @param userId - The user ID
   * @returns Updated notification preferences
   */
  async enableAllNotifications(userId: number): Promise<NotificationPreferences> {
    return await this.updatePreferences(userId, {
      draft_your_turn: true,
      draft_other_picks: true,
      draft_completed: true,
      trade_proposed: true,
      trade_accepted: true,
      trade_declined: true,
      trade_league_announcements: true,
      waiver_processed: true,
      waiver_outbid: true,
      matchup_started: true,
      matchup_ended: true,
      playoff_started: true,
      league_announcements: true,
    });
  }

  /**
   * Get users who have a specific notification type enabled
   * Useful for bulk notification sending
   *
   * @param userIds - Array of user IDs to check
   * @param notificationType - The notification type
   * @returns Array of user IDs who have this notification enabled
   */
  async getUsersWithNotificationEnabled(
    userIds: number[],
    notificationType: keyof Omit<NotificationPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ): Promise<number[]> {
    try {
      const query = `
        SELECT user_id
        FROM notification_preferences
        WHERE user_id = ANY($1) AND ${notificationType} = TRUE
      `;

      const result = await this.query(query, [userIds]);
      return result.rows.map(row => row.user_id);
    } catch (error) {
      logger.error('Error getting users with notification enabled:', {
        userIds,
        notificationType,
        error
      });
      // Return all users on error to avoid missing critical notifications
      return userIds;
    }
  }
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const notificationRepository = new NotificationRepository();
