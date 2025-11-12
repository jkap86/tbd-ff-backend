import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  registerTokenHandler,
  deactivateTokenHandler,
  getPreferencesHandler,
  updatePreferencesHandler,
  getNotificationHistoryHandler,
  markAsReadHandler
} from "../controllers/notificationController";

const router = express.Router();

// Push token management
router.post("/token", authenticate, registerTokenHandler);
router.delete("/token", authenticate, deactivateTokenHandler);

// Notification preferences
router.get("/preferences", authenticate, getPreferencesHandler);
router.put("/preferences", authenticate, updatePreferencesHandler);

// Notification history
router.get("/history", authenticate, getNotificationHistoryHandler);
router.post("/:notificationId/read", authenticate, markAsReadHandler);

export default router;
