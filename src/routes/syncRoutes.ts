import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import { requireAdmin } from "../middleware/authorization";
import { syncSeasonStats, syncAllSeasons } from "../services/statsSync";
import { syncWeekProjections, syncWeekRange } from "../services/projectionsSync";

const router = express.Router();

/**
 * Manual sync endpoints for admins
 */

// Sync stats for a specific season
router.post("/stats/:season", authenticate, requireAdmin, async (req, res) => {
  try {
    const { season } = req.params;
    const { season_type = "regular" } = req.body;

    const result = await syncSeasonStats(season, season_type);

    res.status(200).json({
      success: true,
      message: `Synced ${result.synced} stats for season ${season}`,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error syncing stats",
    });
  }
});

// Sync stats for multiple seasons in parallel
router.post("/stats/bulk", authenticate, requireAdmin, async (req, res) => {
  try {
    const { seasons } = req.body;

    if (!seasons || !Array.isArray(seasons)) {
      res.status(400).json({
        success: false,
        message: "seasons array is required",
      });
      return;
    }

    // Run in background
    syncAllSeasons(seasons);

    res.status(202).json({
      success: true,
      message: `Started sync for ${seasons.length} seasons`,
      seasons,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error syncing stats",
    });
  }
});

// Sync projections for a specific week
router.post("/projections/:season/:week", authenticate, requireAdmin, async (req, res) => {
  try {
    const { season, week } = req.params;
    const { season_type = "regular" } = req.body;

    const result = await syncWeekProjections(season, parseInt(week), season_type);

    res.status(200).json({
      success: true,
      message: `Synced ${result.synced} projections for season ${season} week ${week}`,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error syncing projections",
    });
  }
});

// Sync projections for a week range in parallel
router.post("/projections/:season/weeks", authenticate, requireAdmin, async (req, res) => {
  try {
    const { season } = req.params;
    const { start_week, end_week } = req.body;

    if (!start_week || !end_week) {
      res.status(400).json({
        success: false,
        message: "start_week and end_week are required",
      });
      return;
    }

    // Run in background
    syncWeekRange(season, start_week, end_week);

    res.status(202).json({
      success: true,
      message: `Started sync for weeks ${start_week}-${end_week}`,
      season,
      weeks: end_week - start_week + 1,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error syncing projections",
    });
  }
});

export default router;
