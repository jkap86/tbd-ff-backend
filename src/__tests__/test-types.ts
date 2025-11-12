/**
 * Test-specific type definitions
 * Simplified types for testing without all required fields
 */

import { PlayerStats } from '../models/PlayerStats';
import { ScoringSettings } from '../services/scoringService';

// Partial PlayerStats for easier test data creation
export type TestPlayerStats = Partial<PlayerStats>;

// Re-export ScoringSettings for convenience
export type { ScoringSettings };

// Helper to create test player stats
export function createTestStats(stats: TestPlayerStats): PlayerStats {
  return stats as PlayerStats;
}
