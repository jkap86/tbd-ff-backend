/**
 * League settings service - handles league configuration validation and updates
 */

import { updateLeague, getLeagueById } from "../models/League";

export interface LeagueSettingsUpdate {
  name?: string;
  total_rosters?: number;
  status?: string;
  settings?: Record<string, any>;
}

/**
 * Validates league settings before update
 */
export function validateLeagueSettings(
  settings: LeagueSettingsUpdate
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (settings.total_rosters !== undefined) {
    if (settings.total_rosters < 2) {
      errors.push("League must have at least 2 rosters");
    }
    if (settings.total_rosters > 32) {
      errors.push("League cannot have more than 32 rosters");
    }
  }

  if (settings.status !== undefined) {
    const validStatuses = ["pre_draft", "drafting", "in_season", "complete"];
    if (!validStatuses.includes(settings.status)) {
      errors.push(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }
  }

  if (settings.settings) {
    // Validate specific settings fields
    const { playoff_week_start, start_week, rounds } = settings.settings;

    if (playoff_week_start !== undefined && playoff_week_start < 1) {
      errors.push("Playoff week must be at least 1");
    }

    if (start_week !== undefined && start_week < 1) {
      errors.push("Start week must be at least 1");
    }

    if (rounds !== undefined && rounds < 1) {
      errors.push("Rounds must be at least 1");
    }

    if (
      playoff_week_start !== undefined &&
      start_week !== undefined &&
      playoff_week_start <= start_week
    ) {
      errors.push("Playoff week must be after start week");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Updates league settings with validation
 */
export async function updateLeagueSettings(
  leagueId: number,
  updates: LeagueSettingsUpdate
): Promise<any> {
  // Validate settings
  const validation = validateLeagueSettings(updates);
  if (!validation.valid) {
    const error: any = new Error(validation.errors.join(", "));
    error.statusCode = 400;
    throw error;
  }

  // Get existing league
  const league = await getLeagueById(leagueId);
  if (!league) {
    const error: any = new Error("League not found");
    error.statusCode = 404;
    throw error;
  }

  // Merge settings if provided
  const updateData: any = { ...updates };
  if (updates.settings) {
    updateData.settings = {
      ...league.settings,
      ...updates.settings,
    };
  }

  // Update league
  const updatedLeague = await updateLeague(leagueId, updateData);
  return updatedLeague;
}

/**
 * Gets league settings with defaults applied
 */
export async function getLeagueSettings(leagueId: number): Promise<any> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    const error: any = new Error("League not found");
    error.statusCode = 404;
    throw error;
  }

  // Apply default settings
  const settings = {
    playoff_week_start: 15,
    start_week: 1,
    rounds: 15,
    ...league.settings,
  };

  return {
    ...league,
    settings,
  };
}
