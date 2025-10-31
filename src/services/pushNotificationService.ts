import pool from "../config/database";
import { logger } from "../config/logger";
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) return;

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Production: Load from environment variable (Heroku)
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      logger.info('Firebase Admin initialized from environment variable');
    } else if (process.env.NODE_ENV !== 'production') {
      // Development: Load from local file
      try {
        const serviceAccount = require('../../firebase-service-account.json');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        logger.info('Firebase Admin initialized from local file');
      } catch (error) {
        logger.warn('Firebase service account file not found. Push notifications will be simulated.');
        logger.warn('To enable real notifications, add firebase-service-account.json to backend/');
      }
    } else {
      logger.error('FIREBASE_SERVICE_ACCOUNT environment variable not set in production!');
    }

    firebaseInitialized = admin.apps.length > 0;
  } catch (error: any) {
    logger.error('Failed to initialize Firebase Admin:', error);
  }
}

// Initialize on module load
initializeFirebase();

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>; // Must be string key-value pairs for FCM
  imageUrl?: string;
}

export interface SendNotificationInput {
  userIds: number[];
  type: string;
  payload: PushNotificationPayload;
  skipPreferenceCheck?: boolean; // For critical notifications
}

/**
 * Register a push notification token for a user
 */
export async function registerPushToken(
  userId: number,
  token: string,
  deviceType: 'ios' | 'android' | 'web',
  deviceId?: string
): Promise<void> {
  try {
    const query = `
      INSERT INTO push_tokens (user_id, token, device_type, device_id, is_active, last_used_at)
      VALUES ($1, $2, $3, $4, TRUE, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, device_id)
      DO UPDATE SET
        token = EXCLUDED.token,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP,
        last_used_at = CURRENT_TIMESTAMP
    `;

    await pool.query(query, [userId, token, deviceType, deviceId || `${deviceType}_${userId}`]);
    logger.info(`Push token registered for user ${userId} on ${deviceType}`);
  } catch (error: any) {
    logger.error('Error registering push token:', error);
    throw error;
  }
}

/**
 * Deactivate a push token (e.g., when user logs out)
 */
export async function deactivatePushToken(userId: number, deviceId?: string): Promise<void> {
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

    await pool.query(query, params);
    logger.info(`Push tokens deactivated for user ${userId}`);
  } catch (error: any) {
    logger.error('Error deactivating push token:', error);
    throw error;
  }
}

/**
 * Get active push tokens for user(s)
 */
async function getActivePushTokens(userIds: number[]): Promise<Array<{user_id: number, token: string, device_type: string}>> {
  try {
    const query = `
      SELECT user_id, token, device_type
      FROM push_tokens
      WHERE user_id = ANY($1) AND is_active = TRUE
    `;

    const result = await pool.query(query, [userIds]);
    return result.rows;
  } catch (error: any) {
    logger.error('Error getting push tokens:', error);
    return [];
  }
}

/**
 * Check user notification preferences
 */
async function checkNotificationPreferences(
  userId: number,
  notificationType: string
): Promise<boolean> {
  try {
    // Map notification types to preference columns
    const preferenceMap: Record<string, string> = {
      'draft_turn': 'draft_your_turn',
      'draft_pick': 'draft_other_picks',
      'draft_completed': 'draft_completed',
      'trade_proposed': 'trade_proposed',
      'trade_accepted': 'trade_accepted',
      'trade_declined': 'trade_declined',
      'trade_announcement': 'trade_league_announcements',
      'waiver_processed': 'waiver_processed',
      'waiver_outbid': 'waiver_outbid',
      'matchup_started': 'matchup_started',
      'matchup_ended': 'matchup_ended',
      'matchup_close': 'matchup_close_game',
      'player_injury': 'player_injury',
      'player_status': 'player_status_change',
      'league_announcement': 'league_announcements',
      'league_invite': 'league_invites',
    };

    const column = preferenceMap[notificationType];
    if (!column) {
      // Unknown type, default to sending
      return true;
    }

    const query = `
      SELECT ${column} as enabled
      FROM notification_preferences
      WHERE user_id = $1
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      // No preferences set, default to enabled
      return true;
    }

    return result.rows[0].enabled !== false;
  } catch (error: any) {
    logger.error('Error checking notification preferences:', error);
    // Default to sending on error
    return true;
  }
}

/**
 * Log notification to history
 */
async function logNotification(
  userId: number,
  type: string,
  payload: PushNotificationPayload,
  status: 'sent' | 'failed',
  errorMessage?: string
): Promise<void> {
  try {
    const query = `
      INSERT INTO notification_history (
        user_id, notification_type, title, body, data, delivery_status, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await pool.query(query, [
      userId,
      type,
      payload.title,
      payload.body,
      JSON.stringify(payload.data || {}),
      status,
      errorMessage || null
    ]);
  } catch (error: any) {
    logger.error('Error logging notification:', error);
    // Don't throw - logging failure shouldn't break notification sending
  }
}

/**
 * Send push notification to users
 * This is a placeholder until Firebase Admin SDK is configured
 */
export async function sendPushNotification(input: SendNotificationInput): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const { userIds, type, payload, skipPreferenceCheck = false } = input;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Filter users based on preferences
    const eligibleUserIds: number[] = [];

    for (const userId of userIds) {
      if (skipPreferenceCheck || await checkNotificationPreferences(userId, type)) {
        eligibleUserIds.push(userId);
      } else {
        skipped++;
      }
    }

    if (eligibleUserIds.length === 0) {
      return { sent, failed, skipped };
    }

    // Get active tokens for eligible users
    const tokens = await getActivePushTokens(eligibleUserIds);

    if (tokens.length === 0) {
      logger.warn(`No active push tokens found for ${eligibleUserIds.length} users`);
      return { sent, failed: eligibleUserIds.length, skipped };
    }

    logger.info(`[PUSH NOTIFICATION] Type: ${type}, Users: ${eligibleUserIds.length}, Tokens: ${tokens.length}`);
    logger.info(`[PUSH NOTIFICATION] Title: ${payload.title}`);
    logger.info(`[PUSH NOTIFICATION] Body: ${payload.body}`);

    // Send notifications via Firebase Cloud Messaging
    for (const tokenData of tokens) {
      try {
        if (firebaseInitialized) {
          // Send via Firebase Admin SDK
          await admin.messaging().send({
            token: tokenData.token,
            notification: {
              title: payload.title,
              body: payload.body,
              imageUrl: payload.imageUrl
            },
            data: payload.data || {},
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  badge: 1
                }
              }
            },
            android: {
              priority: 'high',
              notification: {
                sound: 'default',
                channelId: 'default'
              }
            }
          });
          logger.info(`Push notification sent to user ${tokenData.user_id} (${tokenData.device_type})`);
        } else {
          // Firebase not initialized - simulate
          logger.warn(`[SIMULATED] Push notification to user ${tokenData.user_id}: ${payload.title}`);
        }

        await logNotification(tokenData.user_id, type, payload, 'sent');
        sent++;
      } catch (error: any) {
        logger.error(`Failed to send push notification to user ${tokenData.user_id}:`, error);

        // Handle invalid tokens
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
          logger.info(`Deactivating invalid token for user ${tokenData.user_id}`);
          await pool.query(
            'UPDATE push_tokens SET is_active = FALSE WHERE token = $1',
            [tokenData.token]
          );
        }

        await logNotification(tokenData.user_id, type, payload, 'failed', error.message);
        failed++;
      }
    }

    return { sent, failed, skipped };
  } catch (error: any) {
    logger.error('Error sending push notifications:', error);
    return { sent, failed: userIds.length - sent - skipped, skipped };
  }
}

/**
 * Initialize default notification preferences for a user
 */
export async function initializeNotificationPreferences(userId: number): Promise<void> {
  try {
    const query = `
      INSERT INTO notification_preferences (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `;

    await pool.query(query, [userId]);
  } catch (error: any) {
    logger.error('Error initializing notification preferences:', error);
    // Don't throw - this is not critical
  }
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  userId: number,
  preferences: Partial<Record<string, boolean>>
): Promise<void> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(preferences)) {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }

    if (fields.length === 0) {
      return;
    }

    values.push(userId);

    const query = `
      UPDATE notification_preferences
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $${paramCount}
    `;

    await pool.query(query, values);
  } catch (error: any) {
    logger.error('Error updating notification preferences:', error);
    throw error;
  }
}

/**
 * Get notification preferences for a user
 */
export async function getNotificationPreferences(userId: number): Promise<any> {
  try {
    const query = 'SELECT * FROM notification_preferences WHERE user_id = $1';
    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      // Return defaults
      return {
        draft_your_turn: true,
        draft_other_picks: true,
        draft_completed: true,
        trade_proposed: true,
        trade_accepted: true,
        trade_declined: true,
        trade_league_announcements: false,
        waiver_processed: true,
        waiver_outbid: true,
        matchup_started: true,
        matchup_ended: true,
        matchup_close_game: true,
        player_injury: true,
        player_status_change: true,
        league_announcements: true,
        league_invites: true,
      };
    }

    return result.rows[0];
  } catch (error: any) {
    logger.error('Error getting notification preferences:', error);
    throw error;
  }
}
