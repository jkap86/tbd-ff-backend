import { Router } from "express";
import {
  sendInvite,
  getUserInvites,
  acceptInvite,
  declineInvite,
} from "../controllers/inviteController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// POST /api/invites/send - Send invite (protected)
router.post("/send", authenticate, sendInvite);

// GET /api/invites/user/:userId - Get user's invites
router.get("/user/:userId", getUserInvites);

// POST /api/invites/:inviteId/accept - Accept invite (protected)
router.post("/:inviteId/accept", authenticate, acceptInvite);

// POST /api/invites/:inviteId/decline - Decline invite (protected)
router.post("/:inviteId/decline", authenticate, declineInvite);

export default router;
