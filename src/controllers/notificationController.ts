import { Request, Response } from "express";
import {
  registerPushToken,
  deactivatePushToken,
  getNotificationPreferences,
  updateNotificationPreferences,
  initializeNotificationPreferences
} from "../services/pushNotificationService";
import pool from "../config/database";
import { BaseController } from "./BaseController";

// Before: 235 lines
// After: 172 lines
// Lines saved: 63

class NotificationController extends BaseController {
  /**
   * Register a push notification token
   * POST /api/v1/notifications/token
   */
  registerToken = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const { token, device_type, device_id } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "Not authenticated");
    }

    // Validate required fields
    const validated = this.validateRequiredFields(req.body, ['token', 'device_type']);
    if (!validated) {
      return this.respondBadRequest(res, "token and device_type are required");
    }

    if (!['ios', 'android', 'web'].includes(device_type)) {
      return this.respondBadRequest(res, "device_type must be ios, android, or web");
    }

    await registerPushToken(userId, token, device_type, device_id);

    this.respondSuccess(res, null, "Push token registered successfully");
  });

  /**
   * Deactivate push token (logout)
   * DELETE /api/v1/notifications/token
   */
  deactivateToken = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const { device_id } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "Not authenticated");
    }

    await deactivatePushToken(userId, device_id);

    this.respondSuccess(res, null, "Push token deactivated successfully");
  });

  /**
   * Get notification preferences
   * GET /api/v1/notifications/preferences
   */
  getPreferences = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "Not authenticated");
    }

    const preferences = await getNotificationPreferences(userId);

    this.respondSuccess(res, preferences);
  });

  /**
   * Update notification preferences
   * PUT /api/v1/notifications/preferences
   */
  updatePreferences = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const userId = this.getAuthenticatedUserId(req);
    const preferences = req.body;

    if (!userId) {
      return this.respondUnauthorized(res, "Not authenticated");
    }

    // Initialize preferences if they don't exist
    await initializeNotificationPreferences(userId);

    // Update preferences
    await updateNotificationPreferences(userId, preferences);

    this.respondSuccess(res, null, "Notification preferences updated successfully");
  });

  /**
   * Get notification history
   * GET /api/v1/notifications/history
   */
  getNotificationHistory = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const userId = this.getAuthenticatedUserId(req);
    const { limit = 50, offset = 0 } = req.query;

    if (!userId) {
      return this.respondUnauthorized(res, "Not authenticated");
    }

    const query = `
      SELECT id, notification_type, title, body, data, sent_at, read_at, clicked_at
      FROM notification_history
      WHERE user_id = $1
      ORDER BY sent_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [userId, limit, offset]);

    this.respondSuccess(res, result.rows);
  });

  /**
   * Mark notification as read
   * POST /api/v1/notifications/:notificationId/read
   */
  markAsRead = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const notificationId = this.validateId(req.params.notificationId, "Notification ID");
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "Not authenticated");
    }

    const query = `
      UPDATE notification_history
      SET read_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2 AND read_at IS NULL
    `;

    await pool.query(query, [notificationId, userId]);

    this.respondSuccess(res, null, "Notification marked as read");
  });
}

const controller = new NotificationController();

export const registerTokenHandler = controller.registerToken;
export const deactivateTokenHandler = controller.deactivateToken;
export const getPreferencesHandler = controller.getPreferences;
export const updatePreferencesHandler = controller.updatePreferences;
export const getNotificationHistoryHandler = controller.getNotificationHistory;
export const markAsReadHandler = controller.markAsRead;
