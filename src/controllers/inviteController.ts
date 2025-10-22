import { Request, Response } from "express";
import {
  createInvite,
  getInvitesForUser,
  getInviteById,
  updateInviteStatus,
  isUserInvited,
} from "../models/LeagueInvite";
import { getLeagueById } from "../models/League";
import {
  createRoster,
  getRosterByLeagueAndUser,
  getNextRosterId,
} from "../models/Roster";
import { getUserById } from "../models/User";

/**
 * Send league invite
 * POST /api/invites/send
 */
export async function sendInvite(req: Request, res: Response): Promise<void> {
  try {
    const { league_id, invited_user_id } = req.body;

    if (!league_id || !invited_user_id) {
      res.status(400).json({
        success: false,
        message: "League ID and invited user ID are required",
      });
      return;
    }

    // Get inviter user ID from authenticated request
    const inviter_user_id = req.user?.userId;
    if (!inviter_user_id) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    // Check if league exists
    const league = await getLeagueById(league_id);
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Check if invited user exists
    const invitedUser = await getUserById(invited_user_id);
    if (!invitedUser) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Check if user is already in the league
    const existingRoster = await getRosterByLeagueAndUser(
      league_id,
      invited_user_id
    );
    if (existingRoster) {
      res.status(409).json({
        success: false,
        message: "User is already in this league",
      });
      return;
    }

    // Check if user is already invited
    const alreadyInvited = await isUserInvited(league_id, invited_user_id);
    if (alreadyInvited) {
      res.status(409).json({
        success: false,
        message: "User is already invited to this league",
      });
      return;
    }

    // Create invite
    const invite = await createInvite({
      league_id,
      inviter_user_id,
      invited_user_id,
    });

    res.status(201).json({
      success: true,
      message: "Invite sent successfully",
      data: invite,
    });
  } catch (error: any) {
    console.error("Send invite error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error sending invite",
    });
  }
}

/**
 * Get invites for a user
 * GET /api/invites/user/:userId
 */
export async function getUserInvites(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
      return;
    }

    const invites = await getInvitesForUser(userId);

    res.status(200).json({
      success: true,
      data: invites,
    });
  } catch (error: any) {
    console.error("Get user invites error:", error);
    res.status(500).json({
      success: false,
      message: "Error getting user invites",
    });
  }
}

/**
 * Accept league invite
 * POST /api/invites/:inviteId/accept
 */
export async function acceptInvite(req: Request, res: Response): Promise<void> {
  try {
    const inviteId = parseInt(req.params.inviteId);

    if (isNaN(inviteId)) {
      res.status(400).json({
        success: false,
        message: "Invalid invite ID",
      });
      return;
    }

    // Get user ID from authenticated request
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    // Get invite
    const invite = await getInviteById(inviteId);
    if (!invite) {
      res.status(404).json({
        success: false,
        message: "Invite not found",
      });
      return;
    }

    // Verify user is the invited user
    if (invite.invited_user_id !== userId) {
      res.status(403).json({
        success: false,
        message: "Not authorized to accept this invite",
      });
      return;
    }

    // Check if invite is still pending
    if (invite.status !== "pending") {
      res.status(400).json({
        success: false,
        message: "Invite is no longer pending",
      });
      return;
    }

    // Get league to check if full
    const league = await getLeagueById(invite.league_id);
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Get next roster ID
    const nextRosterId = await getNextRosterId(invite.league_id);

    // Create roster for user
    const roster = await createRoster({
      league_id: invite.league_id,
      user_id: userId,
      roster_id: nextRosterId,
    });

    // Update invite status to accepted
    await updateInviteStatus(inviteId, "accepted");

    res.status(200).json({
      success: true,
      message: "Invite accepted successfully",
      data: roster,
    });
  } catch (error: any) {
    console.error("Accept invite error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error accepting invite",
    });
  }
}

/**
 * Decline league invite
 * POST /api/invites/:inviteId/decline
 */
export async function declineInvite(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const inviteId = parseInt(req.params.inviteId);

    if (isNaN(inviteId)) {
      res.status(400).json({
        success: false,
        message: "Invalid invite ID",
      });
      return;
    }

    // Get user ID from authenticated request
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    // Get invite
    const invite = await getInviteById(inviteId);
    if (!invite) {
      res.status(404).json({
        success: false,
        message: "Invite not found",
      });
      return;
    }

    // Verify user is the invited user
    if (invite.invited_user_id !== userId) {
      res.status(403).json({
        success: false,
        message: "Not authorized to decline this invite",
      });
      return;
    }

    // Check if invite is still pending
    if (invite.status !== "pending") {
      res.status(400).json({
        success: false,
        message: "Invite is no longer pending",
      });
      return;
    }

    // Update invite status to declined
    await updateInviteStatus(inviteId, "declined");

    res.status(200).json({
      success: true,
      message: "Invite declined successfully",
    });
  } catch (error: any) {
    console.error("Decline invite error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error declining invite",
    });
  }
}
