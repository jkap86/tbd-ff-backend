import pool from '../config/database';
import { updatePlayerInjuryStatus } from '../models/Player';

/**
 * Sync injury data from Sleeper API
 * Sleeper provides injury_status in their player data
 */
export async function syncInjuriesFromSleeper(): Promise<{
  updated: number;
  errors: string[];
}> {
  console.log('[InjuryService] Starting injury sync from Sleeper...');

  let updated = 0;
  const errors: string[] = [];

  try {
    // Fetch all players from Sleeper
    const response = await fetch('https://api.sleeper.app/v1/players/nfl');

    if (!response.ok) {
      throw new Error(`Sleeper API error: ${response.status}`);
    }

    const sleeperPlayers = await response.json();

    // Process each player with injury data
    for (const [playerId, playerData] of Object.entries(sleeperPlayers as Record<string, any>)) {
      try {
        if (playerData.injury_status) {
          await updatePlayerInjuryStatus(playerId, {
            injury_status: mapSleeperInjuryStatus(playerData.injury_status),
            injury_designation: playerData.injury_body_part || undefined,
          });
          updated++;
        } else {
          // Clear injury status if player is now healthy
          await updatePlayerInjuryStatus(playerId, {
            injury_status: 'Healthy',
            injury_designation: undefined,
            injury_return_date: null,
          });
        }
      } catch (error: any) {
        errors.push(`Failed to update ${playerId}: ${error.message}`);
      }
    }

    console.log(`[InjuryService] Sync complete: ${updated} players updated`);
    return { updated, errors };

  } catch (error: any) {
    console.error('[InjuryService] Sync failed:', error);
    throw error;
  }
}

/**
 * Map Sleeper injury status to our format
 */
function mapSleeperInjuryStatus(sleeperStatus: string): string {
  const statusMap: Record<string, string> = {
    'Out': 'Out',
    'Doubtful': 'Doubtful',
    'Questionable': 'Questionable',
    'IR': 'IR',
    'PUP': 'PUP',
    'COV': 'Out', // COVID list
    'Sus': 'Out', // Suspended
  };

  return statusMap[sleeperStatus] || sleeperStatus;
}

/**
 * Get injury report for a specific league (only rostered players)
 */
export async function getLeagueInjuryReport(leagueId: number): Promise<any[]> {
  const result = await pool.query(
    `SELECT DISTINCT
      p.player_id,
      p.full_name,
      p.position,
      p.team,
      p.injury_status,
      p.injury_designation,
      p.injury_return_date,
      p.injury_updated_at,
      r.id as roster_id,
      r.settings->>'team_name' as team_name
    FROM players p
    INNER JOIN roster_players rp ON rp.player_id = p.player_id
    INNER JOIN rosters r ON r.id = rp.roster_id
    WHERE r.league_id = $1
    AND p.injury_status IS NOT NULL
    AND p.injury_status != 'Healthy'
    ORDER BY p.injury_status, p.full_name`,
    [leagueId]
  );

  return result.rows;
}
