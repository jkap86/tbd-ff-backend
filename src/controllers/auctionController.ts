import { Request, Response } from "express";
import {
  createNomination,
  getActiveNominations,
  placeBid,
  getBidsForNomination,
  getRosterBudget,
} from "../models/Auction";
import { getDraftById } from "../models/Draft";

// POST /api/drafts/:id/nominate
export async function nominatePlayerHandler(req: Request, res: Response) {
  try {
    const draftId = parseInt(req.params.id);
    const { player_id, roster_id, deadline } = req.body;

    if (!player_id || !roster_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify draft exists and is auction type
    const draft = await getDraftById(draftId);
    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    if (draft.draft_type !== "auction" && draft.draft_type !== "slow_auction") {
      return res
        .status(400)
        .json({ error: "Draft is not an auction draft type" });
    }

    // For slow auction, check max simultaneous nominations
    if (draft.draft_type === "slow_auction") {
      const activeNominations = await getActiveNominations(draftId);
      if (
        activeNominations.length >= (draft.max_simultaneous_nominations || 1)
      ) {
        return res.status(400).json({
          error: `Maximum nominations reached (${draft.max_simultaneous_nominations})`,
        });
      }
    }

    const nomination = await createNomination({
      draft_id: draftId,
      player_id,
      nominating_roster_id: roster_id,
      deadline: deadline ? new Date(deadline) : null,
    });

    return res.status(201).json(nomination);
  } catch (error: any) {
    console.error("Error nominating player:", error);
    return res.status(500).json({ error: error.message });
  }
}

// POST /api/drafts/:id/bid
export async function placeBidHandler(req: Request, res: Response) {
  try {
    const draftId = parseInt(req.params.id);
    const { nomination_id, roster_id, max_bid } = req.body;

    if (!nomination_id || !roster_id || !max_bid) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify draft exists
    const draft = await getDraftById(draftId);
    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    const result = await placeBid({
      nomination_id,
      roster_id,
      max_bid,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error placing bid:", error);
    return res.status(400).json({ error: error.message });
  }
}

// GET /api/drafts/:id/nominations
export async function getActiveNominationsHandler(req: Request, res: Response) {
  try {
    const draftId = parseInt(req.params.id);

    const nominations = await getActiveNominations(draftId);

    res.status(200).json(nominations);
  } catch (error: any) {
    console.error("Error getting nominations:", error);
    res.status(500).json({ error: error.message });
  }
}

// GET /api/drafts/:id/nominations/:nominationId/bids
export async function getNominationBidsHandler(req: Request, res: Response) {
  try {
    const nominationId = parseInt(req.params.nominationId);

    const bids = await getBidsForNomination(nominationId);

    // Don't expose max_bid to clients
    const sanitizedBids = bids.map((bid) => ({
      id: bid.id,
      nomination_id: bid.nomination_id,
      roster_id: bid.roster_id,
      bid_amount: bid.bid_amount,
      is_winning: bid.is_winning,
      created_at: bid.created_at,
      team_name: (bid as any).team_name,
    }));

    res.status(200).json(sanitizedBids);
  } catch (error: any) {
    console.error("Error getting nomination bids:", error);
    res.status(500).json({ error: error.message });
  }
}

// GET /api/rosters/:id/budget
export async function getRosterBudgetHandler(req: Request, res: Response) {
  try {
    const rosterId = parseInt(req.params.id);
    const draftId = parseInt(req.query.draft_id as string);

    if (!draftId) {
      return res.status(400).json({ error: "draft_id query parameter required" });
    }

    const budget = await getRosterBudget(rosterId, draftId);

    return res.status(200).json(budget);
  } catch (error: any) {
    console.error("Error getting roster budget:", error);
    return res.status(500).json({ error: error.message });
  }
}
