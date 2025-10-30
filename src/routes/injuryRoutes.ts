import express from 'express';
import { authenticate } from '../middleware/authMiddleware';
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

// Manual sync trigger (for testing/admin)
router.post('/sync', authenticate, syncInjuriesHandler);

export default router;
