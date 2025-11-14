/**
 * Authorization Service
 * Centralizes all authorization checks for HTTP endpoints and socket handlers
 * Provides a single source of truth for access control logic
 */

import pool from "../config/database";
import { getLeagueById } from "../models/League";
import { getRosterById } from "../models/Roster";
import { getTrade } from "../models/Trade";
import { logger } from "../utils/logger";

/**
 * Check if a user is a member of a league
 * @param userId - The user's ID
 * @param leagueId - The league ID
 * @returns true if user is a league member, false otherwise
 */
export async function checkLeagueMembership(
  userId: number,
  leagueId: number
): Promise<boolean> {
  try {
    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM rosters r
        WHERE r.league_id = $1 AND r.user_id = $2
      ) as is_member
    `;

    const result = await pool.query(query, [leagueId, userId]);
    return result.rows[0]?.is_member || false;
  } catch (error) {
    logger.error("[AuthService] Error checking league membership", { userId, leagueId, error });
    return false;
  }
}

/**
 * Check if a user is the commissioner of a league
 * @param userId - The user's ID
 * @param leagueId - The league ID
 * @returns true if user is the commissioner, false otherwise
 */
export async function checkLeagueCommissioner(
  userId: number,
  leagueId: number
): Promise<boolean> {
  try {
    const league = await getLeagueById(leagueId);
    if (!league) return false;
    return league.settings?.commissioner_id === userId;
  } catch (error) {
    logger.error("[AuthService] Error checking league commissioner", { userId, leagueId, error });
    return false;
  }
}

/**
 * Check if a user is a participant in a draft
 * @param userId - The user's ID
 * @param draftId - The draft ID
 * @returns true if user is a participant, false otherwise
 */
export async function checkDraftParticipation(
  userId: number,
  draftId: number
): Promise<boolean> {
  try {
    // Check if user has a roster in the league that owns this draft
    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM rosters r
        INNER JOIN drafts d ON d.league_id = r.league_id
        WHERE d.id = $1 AND r.user_id = $2
      ) as is_participant
    `;

    const result = await pool.query(query, [draftId, userId]);
    return result.rows[0]?.is_participant || false;
  } catch (error) {
    logger.error("[AuthService] Error checking draft participation", { userId, draftId, error });
    return false;
  }
}

/**
 * Check if a user owns a specific roster
 * @param userId - The user's ID
 * @param rosterId - The roster ID
 * @returns true if user owns the roster, false otherwise
 */
export async function checkRosterOwnership(
  userId: number,
  rosterId: number
): Promise<boolean> {
  try {
    const roster = await getRosterById(rosterId);
    if (!roster) return false;
    return roster.user_id === userId;
  } catch (error) {
    logger.error("[AuthService] Error checking roster ownership", { userId, rosterId, error });
    return false;
  }
}

/**
 * Check if a user is the commissioner of the league that owns a draft
 * @param userId - The user's ID
 * @param draftId - The draft ID
 * @returns true if user is the commissioner, false otherwise
 */
export async function checkDraftCommissioner(
  userId: number,
  draftId: number
): Promise<boolean> {
  try {
    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM leagues l
        INNER JOIN drafts d ON d.league_id = l.id
        WHERE d.id = $1 AND (l.settings->>'commissioner_id')::int = $2
      ) as is_commissioner
    `;

    const result = await pool.query(query, [draftId, userId]);
    return result.rows[0]?.is_commissioner || false;
  } catch (error) {
    logger.error("[AuthService] Error checking draft commissioner", { userId, draftId, error });
    return false;
  }
}

/**
 * Check if a user owns a specific roster in a draft
 * @param userId - The user's ID
 * @param rosterId - The roster ID
 * @param draftId - The draft ID
 * @returns true if user owns the roster, false otherwise
 */
export async function checkRosterOwnershipInDraft(
  userId: number,
  rosterId: number,
  draftId: number
): Promise<boolean> {
  try {
    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM rosters r
        INNER JOIN drafts d ON d.league_id = r.league_id
        WHERE d.id = $1 AND r.id = $2 AND r.user_id = $3
      ) as owns_roster
    `;

    const result = await pool.query(query, [draftId, rosterId, userId]);
    return result.rows[0]?.owns_roster || false;
  } catch (error) {
    logger.error("[AuthService] Error checking roster ownership in draft", { userId, rosterId, draftId, error });
    return false;
  }
}

/**
 * Check if a user is involved in a trade (proposer or receiver)
 * @param userId - The user's ID
 * @param tradeId - The trade ID
 * @returns true if user is a trade participant, false otherwise
 */
export async function checkTradeParticipation(
  userId: number,
  tradeId: number
): Promise<boolean> {
  try {
    const trade = await getTrade(tradeId);
    if (!trade) return false;

    // Get rosters involved in trade
    const result = await pool.query(
      `SELECT user_id FROM rosters WHERE id IN ($1, $2)`,
      [trade.proposer_roster_id, trade.receiver_roster_id]
    );

    const participantUserIds = result.rows.map((row) => row.user_id);
    return participantUserIds.includes(userId);
  } catch (error) {
    logger.error("[AuthService] Error checking trade participation", { userId, tradeId, error });
    return false;
  }
}

/**
 * Check if a user is either the commissioner OR owner of a roster
 * @param userId - The user's ID
 * @param rosterId - The roster ID
 * @returns true if user is commissioner or roster owner, false otherwise
 */
export async function checkCommissionerOrRosterOwner(
  userId: number,
  rosterId: number
): Promise<boolean> {
  try {
    const roster = await getRosterById(rosterId);
    if (!roster) return false;

    // Check if user owns the roster
    if (roster.user_id === userId) return true;

    // Check if user is league commissioner
    const league = await getLeagueById(roster.league_id);
    if (!league) return false;

    return league.settings?.commissioner_id === userId;
  } catch (error) {
    logger.error("[AuthService] Error checking commissioner or roster owner", { userId, rosterId, error });
    return false;
  }
}
