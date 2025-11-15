import { Request, Response } from "express";
import { BaseController } from "./BaseController";
import {
  getDraftById,
} from "../models/Draft";
import { eventBus } from "../index";
import {
  emitDraftOrderUpdate,
} from "../socket/draftSocket";
import {
  setDraftOrder,
  getDraftOrderWithDetails,
  randomizeDraftOrder,
} from "../models/DraftOrder";
import { getRostersByLeagueId } from "../models/Roster";
import {
  sendCollapsibleSystemMessageSafe,
} from "../services/leagueChatService";

class DraftOrderController extends BaseController {
  /**
   * Set draft order (manual or randomized)
   * POST /api/drafts/:draftId/order
   */
  setDraftOrderHandler = this.asyncHandler(async (req: Request, res: Response) => {
    const parsedDraftId = this.validateId(req.params.draftId, "Draft ID");
    const { randomize, order } = req.body;

    const draft = await getDraftById(parsedDraftId);
    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    // Check if user is commissioner
    const userId = this.getAuthenticatedUserId(req);
    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    // Validate commissioner access
    const auth = await this.validateCommissionerAccess(req, draft.league_id);
    if (!auth) {
      this.respondForbidden(res, "Only the commissioner can set draft order");
      return;
    }

    // Don't allow changing order after draft has started
    if (draft.status !== "not_started") {
      this.respondBadRequest(res, "Cannot change draft order after draft has started");
      return;
    }

    if (randomize) {
      // Get all rosters for the league
      const rosters = await getRostersByLeagueId(draft.league_id);
      const rosterIds = rosters.map((r) => r.id);

      await randomizeDraftOrder(parseInt(req.params.draftId), rosterIds);
    } else if (order && Array.isArray(order)) {
      // Manual order: validate format
      if (
        !order.every(
          (item) =>
            item.roster_id && item.draft_position && typeof item.roster_id === "number" && typeof item.draft_position === "number"
        )
      ) {
        this.respondBadRequest(res, "Invalid order format. Each item must have roster_id and draft_position");
        return;
      }

      // Get all rosters in the league
      const rosters = await getRostersByLeagueId(draft.league_id);
      const expectedRosterCount = rosters.length;

      // Validation 1: Count matches
      if (order.length !== expectedRosterCount) {
        this.respondBadRequest(res, `Draft order must include all ${expectedRosterCount} rosters`);
        return;
      }

      // Validation 2: All roster IDs are valid
      const rosterIds = new Set(rosters.map(r => r.id));
      const orderRosterIds = order.map(o => o.roster_id);
      for (const rosterId of orderRosterIds) {
        if (!rosterIds.has(rosterId)) {
          this.respondBadRequest(res, `Roster ${rosterId} does not belong to this league`);
          return;
        }
      }

      // Validation 3: No duplicate roster IDs
      const uniqueRosterIds = new Set(orderRosterIds);
      if (uniqueRosterIds.size !== order.length) {
        this.respondBadRequest(res, "Draft order contains duplicate roster IDs");
        return;
      }

      // Validation 4: Positions are 1-N with no gaps or duplicates
      const positions = order.map(o => o.draft_position).sort((a, b) => a - b);
      for (let i = 0; i < positions.length; i++) {
        if (positions[i] !== i + 1) {
          this.respondBadRequest(res, `Draft positions must be 1-${expectedRosterCount} with no gaps or duplicates`);
          return;
        }
      }

      // All validations passed, proceed with setting order
      await setDraftOrder(parseInt(req.params.draftId), order);
    } else {
      this.respondBadRequest(res, "Must provide either randomize=true or order array");
      return;
    }

    // Get detailed draft order with team names and usernames
    const detailedDraftOrder = await getDraftOrderWithDetails(parseInt(req.params.draftId));

    // TODO: Refactor socket functions to accept IEventBus instead of Server
    const io = eventBus.getSocketIOInstance();

    // Emit draft order update via WebSocket
    emitDraftOrderUpdate(io, parseInt(req.params.draftId), detailedDraftOrder);

    // If randomized, send system message to league chat
    if (randomize) {
      // Format draft order for chat message - create simple array of team names
      // Create detailed draft order list with position numbers
      const draftOrderList = detailedDraftOrder.map((order, index) => ({
        position: index + 1,
        roster_id: order.roster_id,
        team_name: order.team_name || order.username || `Team ${order.roster_id}`,
        username: order.username,
      }));

      // TODO: Refactor sendCollapsibleSystemMessageSafe to accept IEventBus
      await sendCollapsibleSystemMessageSafe(io, draft.league_id, "Draft order has been randomized", "draft_order_randomized", {
        draft_id: draft.id,
        draft_order: draftOrderList,
      });
    }

    // Return detailed draft order in HTTP response
    this.respondSuccess(res, detailedDraftOrder);
  });

  /**
   * Get draft order
   * GET /api/drafts/:draftId/order
   */
  getDraftOrderHandler = this.asyncHandler(async (req: Request, res: Response) => {
    const draftOrder = await getDraftOrderWithDetails(parseInt(req.params.draftId));
    this.respondSuccess(res, draftOrder);
  });
}

const controller = new DraftOrderController();

// Export handlers
export const setDraftOrderHandler = controller.setDraftOrderHandler;
export const getDraftOrderHandler = controller.getDraftOrderHandler;
