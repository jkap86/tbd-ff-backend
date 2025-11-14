import {
  checkLeagueMembership,
  checkLeagueCommissioner,
} from "../services/authorizationService";

/**
 * Check if a user is a member of a league
 * @param userId - The user's ID
 * @param leagueId - The league ID
 * @returns true if user is a league member, false otherwise
 */
export async function isUserLeagueMember(
  userId: number,
  leagueId: number
): Promise<boolean> {
  return checkLeagueMembership(userId, leagueId);
}

/**
 * Check if a user is the commissioner of a league
 * @param userId - The user's ID
 * @param leagueId - The league ID
 * @returns true if user is the commissioner, false otherwise
 */
export async function isUserLeagueCommissioner(
  userId: number,
  leagueId: number
): Promise<boolean> {
  return checkLeagueCommissioner(userId, leagueId);
}
