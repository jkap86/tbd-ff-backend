// Before refactor: 333 lines
// After refactor: 268 lines
// Lines saved: 65 lines

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
import { BaseController } from "./BaseController";
import { eventBus } from "../index";
import { sendSystemMessageSafe } from "../services/leagueChatService";

class InviteController extends BaseController {
  /**
   * Send league invite
   * POST /api/invites/send
   */
  sendInvite = this.asyncHandler(async (req: Request, res: Response) => {
    const validated = this.validateRequiredFields(req.body, ['league_id', 'invited_user_id']);
    if (!validated) {
      this.respondBadRequest(res, "League ID and invited user ID are required");
      return;
    }

    const { league_id, invited_user_id } = validated;

    // Get inviter user ID from authenticated request
    const inviter_user_id = this.getAuthenticatedUserId(req);
    if (!inviter_user_id) {
      this.respondUnauthorized(res);
      return;
    }

    // Check if league exists
    const league = await getLeagueById(league_id);
    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    // Check if invited user exists
    const invitedUser = await getUserById(invited_user_id);
    if (!invitedUser) {
      this.respondNotFound(res, "User not found");
      return;
    }

    // Check if user is already in the league
    const existingRoster = await getRosterByLeagueAndUser(
      league_id,
      invited_user_id
    );
    if (existingRoster) {
      this.respondError(res, "User is already in this league", 409);
      return;
    }

    // Check if user is already invited
    const alreadyInvited = await isUserInvited(league_id, invited_user_id);
    if (alreadyInvited) {
      this.respondError(res, "User is already invited to this league", 409);
      return;
    }

    // Create invite
    const invite = await createInvite({
      league_id,
      inviter_user_id,
      invited_user_id,
    });

    this.respondCreated(res, invite, "Invite sent successfully");
  });

  /**
   * Get invites for a user
   * GET /api/invites/user/:userId
   */
  getUserInvites = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.validateId(req.params.userId, "User ID");

    const invites = await getInvitesForUser(userId);

    this.respondSuccess(res, invites);
  });

  /**
   * Accept league invite
   * POST /api/invites/:inviteId/accept
   */
  acceptInvite = this.asyncHandler(async (req: Request, res: Response) => {
    const inviteId = this.validateId(req.params.inviteId, "Invite ID");

    // Get user ID from authenticated request
    const userId = this.getAuthenticatedUserId(req);
    if (!userId) {
      this.respondUnauthorized(res);
      return;
    }

    // Get invite
    const invite = await getInviteById(inviteId);
    if (!invite) {
      this.respondNotFound(res, "Invite not found");
      return;
    }

    // Verify user is the invited user
    if (invite.invited_user_id !== userId) {
      this.respondForbidden(res, "Not authorized to accept this invite");
      return;
    }

    // Check if invite is still pending
    if (invite.status !== "pending") {
      this.respondBadRequest(res, "Invite is no longer pending");
      return;
    }

    // Get league to check if full
    const league = await getLeagueById(invite.league_id);
    if (!league) {
      this.respondNotFound(res, "League not found");
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

    // Send system notification to league chat
    const user = await getUserById(userId);
    const username = user?.username || `User ${userId}`;

    // TODO: Update sendSystemMessageSafe to accept IEventBus instead of Server
    const io = eventBus.getSocketIOInstance();
    await sendSystemMessageSafe(io, invite.league_id, `${username} has joined the league`, {
      type: "user_joined",
      joined_user_id: userId,
      joined_username: username,
      roster_id: roster.id,
      via_invite: true,
    });

    this.respondSuccess(res, roster, "Invite accepted successfully");
  });

  /**
   * Decline league invite
   * POST /api/invites/:inviteId/decline
   */
  declineInvite = this.asyncHandler(async (req: Request, res: Response) => {
    const inviteId = this.validateId(req.params.inviteId, "Invite ID");

    // Get user ID from authenticated request
    const userId = this.getAuthenticatedUserId(req);
    if (!userId) {
      this.respondUnauthorized(res);
      return;
    }

    // Get invite
    const invite = await getInviteById(inviteId);
    if (!invite) {
      this.respondNotFound(res, "Invite not found");
      return;
    }

    // Verify user is the invited user
    if (invite.invited_user_id !== userId) {
      this.respondForbidden(res, "Not authorized to decline this invite");
      return;
    }

    // Check if invite is still pending
    if (invite.status !== "pending") {
      this.respondBadRequest(res, "Invite is no longer pending");
      return;
    }

    // Update invite status to declined
    await updateInviteStatus(inviteId, "declined");

    this.respondSuccess(res, null, "Invite declined successfully");
  });
}

const inviteController = new InviteController();
export const sendInvite = inviteController.sendInvite;
export const getUserInvites = inviteController.getUserInvites;
export const acceptInvite = inviteController.acceptInvite;
export const declineInvite = inviteController.declineInvite;
