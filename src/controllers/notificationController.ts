import { Request, Response } from "express";
import {
  registerPushToken,
  deactivatePushToken,
  getNotificationPreferences,
  updateNotificationPreferences,
  initializeNotificationPreferences
} from "../services/pushNotificationService";
import pool from "../config/database";

/**
 * Register a push notification token
 * POST /api/v1/notifications/token
 */
export async function registerTokenHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { token, device_type, device_id } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    if (!token || !device_type) {
      res.status(400).json({
        success: false,
        message: "token and device_type are required"
      });
      return;
    }

    if (!['ios', 'android', 'web'].includes(device_type)) {
      res.status(400).json({
        success: false,
        message: "device_type must be ios, android, or web"
      });
      return;
    }

    await registerPushToken(userId, token, device_type, device_id);

    res.status(200).json({
      success: true,
      message: "Push token registered successfully"
    });
  } catch (error: any) {
    console.error("Error registering push token:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to register push token"
    });
  }
}

/**
 * Deactivate push token (logout)
 * DELETE /api/v1/notifications/token
 */
export async function deactivateTokenHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { device_id } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    await deactivatePushToken(userId, device_id);

    res.status(200).json({
      success: true,
      message: "Push token deactivated successfully"
    });
  } catch (error: any) {
    console.error("Error deactivating push token:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to deactivate push token"
    });
  }
}

/**
 * Get notification preferences
 * GET /api/v1/notifications/preferences
 */
export async function getPreferencesHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    const preferences = await getNotificationPreferences(userId);

    res.status(200).json({
      success: true,
      data: preferences
    });
  } catch (error: any) {
    console.error("Error getting notification preferences:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get notification preferences"
    });
  }
}

/**
 * Update notification preferences
 * PUT /api/v1/notifications/preferences
 */
export async function updatePreferencesHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.userId;
    const preferences = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    // Initialize preferences if they don't exist
    await initializeNotificationPreferences(userId);

    // Update preferences
    await updateNotificationPreferences(userId, preferences);

    res.status(200).json({
      success: true,
      message: "Notification preferences updated successfully"
    });
  } catch (error: any) {
    console.error("Error updating notification preferences:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update notification preferences"
    });
  }
}

/**
 * Get notification history
 * GET /api/v1/notifications/history
 */
export async function getNotificationHistoryHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { limit = 50, offset = 0 } = req.query;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    const query = `
      SELECT id, notification_type, title, body, data, sent_at, read_at, clicked_at
      FROM notification_history
      WHERE user_id = $1
      ORDER BY sent_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [userId, limit, offset]);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error("Error getting notification history:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get notification history"
    });
  }
}

/**
 * Mark notification as read
 * POST /api/v1/notifications/:notificationId/read
 */
export async function markAsReadHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { notificationId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    const query = `
      UPDATE notification_history
      SET read_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2 AND read_at IS NULL
    `;

    await pool.query(query, [parseInt(notificationId), userId]);

    res.status(200).json({
      success: true,
      message: "Notification marked as read"
    });
  } catch (error: any) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to mark notification as read"
    });
  }
}
