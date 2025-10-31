import express from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { requireAdmin } from '../middleware/authorization';
import {
  getAllInjuriesHandler,
  getLeagueInjuryReportHandler,
  syncInjuriesHandler,
} from '../controllers/injuryController';

const router = express.Router();

// Get all injured players
router.get('/all', authenticate, getAllInjuriesHandler);

// Get injury report for a specific league (only rostered players)
router.get('/league/:leagueId', authenticate, getLeagueInjuryReportHandler);

// Manual sync trigger (admin only - triggers expensive external API calls)
router.post('/sync', authenticate, requireAdmin, syncInjuriesHandler);

export default router;
