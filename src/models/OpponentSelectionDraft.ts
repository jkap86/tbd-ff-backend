import pool from "../config/database";
import { setTransactionTimeouts } from "../utils/transactionTimeout";
import { BaseRepository } from "./BaseRepository";

export interface OpponentSelectionDraft {
  id: number;
  league_id: number;
  status: 'pending' | 'in_progress' | 'completed';
  current_turn_roster_id: number | null;
  time_limit_seconds: number;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface OpponentSelectionDraftPick {
  id: number;
  draft_id: number;
  roster_id: number;
  opponent_roster_id: number;
  week: number;
  pick_number: number;
  created_at: Date;
}

class OpponentSelectionDraftRepository extends BaseRepository<OpponentSelectionDraft> {
  constructor() {
    super('opponent_selection_drafts', 'id');
  }
}

class OpponentSelectionDraftPickRepository extends BaseRepository<OpponentSelectionDraftPick> {
  constructor() {
    super('opponent_selection_draft_picks', 'id');
  }
}

const draftRepo = new OpponentSelectionDraftRepository();
const pickRepo = new OpponentSelectionDraftPickRepository();

/**
 * Create a new opponent selection draft
 */
export async function createOpponentSelectionDraft(
  leagueId: number,
  timeLimitSeconds: number = 120
): Promise<OpponentSelectionDraft> {
  try {
    const query = `
      INSERT INTO opponent_selection_drafts (league_id, status, time_limit_seconds)
      VALUES ($1, 'pending', $2)
      RETURNING *
    `;

    const result = await pool.query(query, [leagueId, timeLimitSeconds]);
    console.log(`[OpponentSelectionDraft] Created draft for league ${leagueId}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating opponent selection draft:', error);
    throw new Error('Error creating opponent selection draft');
  }
}

/**
 * Get opponent selection draft by league ID
 */
export async function getOpponentSelectionDraftByLeague(
  leagueId: number
): Promise<OpponentSelectionDraft | null> {
  try {
    const drafts = await draftRepo.findBy('league_id', leagueId);
    return drafts.length > 0 ? drafts[0] : null;
  } catch (error) {
    console.error('Error getting opponent selection draft:', error);
    throw new Error('Error getting opponent selection draft');
  }
}

/**
 * Start the opponent selection draft
 */
export async function startOpponentSelectionDraft(
  draftId: number,
  firstRosterId: number
): Promise<OpponentSelectionDraft> {
  const client = await pool.connect();
  await setTransactionTimeouts(client);

  try {
    await client.query('BEGIN');

    const query = `
      UPDATE opponent_selection_drafts
      SET status = 'in_progress',
          current_turn_roster_id = $2,
          started_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await client.query(query, [draftId, firstRosterId]);

    await client.query('COMMIT');
    console.log(`[OpponentSelectionDraft] Started draft ${draftId}`);
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error starting opponent selection draft:', error);
    throw new Error('Error starting opponent selection draft');
  } finally {
    client.release();
  }
}

/**
 * Make an opponent selection pick
 */
export async function makeOpponentSelectionPick(
  draftId: number,
  rosterId: number,
  opponentRosterId: number,
  week: number,
  nextRosterId: number | null
): Promise<OpponentSelectionDraftPick> {
  const client = await pool.connect();
  await setTransactionTimeouts(client);

  try {
    await client.query('BEGIN');

    // Get current pick count to determine pick number
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM opponent_selection_draft_picks WHERE draft_id = $1',
      [draftId]
    );
    const pickNumber = parseInt(countResult.rows[0].count) + 1;

    // Insert the pick
    const insertQuery = `
      INSERT INTO opponent_selection_draft_picks (draft_id, roster_id, opponent_roster_id, week, pick_number)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const pickResult = await client.query(insertQuery, [
      draftId,
      rosterId,
      opponentRosterId,
      week,
      pickNumber,
    ]);

    // Update current turn or complete draft
    if (nextRosterId) {
      await client.query(
        'UPDATE opponent_selection_drafts SET current_turn_roster_id = $1 WHERE id = $2',
        [nextRosterId, draftId]
      );
    } else {
      await client.query(
        `UPDATE opponent_selection_drafts
         SET status = 'completed',
             current_turn_roster_id = NULL,
             completed_at = NOW()
         WHERE id = $1`,
        [draftId]
      );
    }

    await client.query('COMMIT');
    console.log(`[OpponentSelectionDraft] Pick made by roster ${rosterId}: opponent ${opponentRosterId} week ${week}`);
    return pickResult.rows[0];
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error making opponent selection pick:', error);

    if (error.code === '23505') {
      throw new Error('This opponent-week combination has already been selected');
    }

    throw new Error('Error making opponent selection pick');
  } finally {
    client.release();
  }
}

/**
 * Get all picks for a draft
 */
export async function getOpponentSelectionDraftPicks(
  draftId: number
): Promise<OpponentSelectionDraftPick[]> {
  try {
    return await pickRepo.findBy('draft_id', draftId, 'pick_number ASC');
  } catch (error) {
    console.error('Error getting opponent selection draft picks:', error);
    throw new Error('Error getting opponent selection draft picks');
  }
}

/**
 * Get picks with roster details
 */
export async function getOpponentSelectionDraftPicksWithDetails(
  draftId: number
): Promise<any[]> {
  try {
    const query = `
      SELECT
        p.*,
        r1.roster_id as roster_number,
        r1.settings as roster_settings,
        u1.id as user_id,
        u1.username as username,
        r2.roster_id as opponent_roster_number,
        r2.settings as opponent_settings,
        u2.username as opponent_username
      FROM opponent_selection_draft_picks p
      LEFT JOIN rosters r1 ON p.roster_id = r1.id
      LEFT JOIN users u1 ON r1.user_id = u1.id
      LEFT JOIN rosters r2 ON p.opponent_roster_id = r2.id
      LEFT JOIN users u2 ON r2.user_id = u2.id
      WHERE p.draft_id = $1
      ORDER BY p.pick_number ASC
    `;

    const result = await pool.query(query, [draftId]);

    return result.rows.map(row => ({
      ...row,
      team_name: row.roster_settings?.team_name || null,
      opponent_team_name: row.opponent_settings?.team_name || null,
    }));
  } catch (error) {
    console.error('Error getting opponent selection draft picks with details:', error);
    throw new Error('Error getting opponent selection draft picks with details');
  }
}

/**
 * Delete opponent selection draft and all picks
 */
export async function deleteOpponentSelectionDraft(draftId: number): Promise<void> {
  const client = await pool.connect();
  await setTransactionTimeouts(client);

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM opponent_selection_draft_picks WHERE draft_id = $1', [draftId]);
    await client.query('DELETE FROM opponent_selection_drafts WHERE id = $1', [draftId]);

    await client.query('COMMIT');
    console.log(`[OpponentSelectionDraft] Deleted draft ${draftId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting opponent selection draft:', error);
    throw new Error('Error deleting opponent selection draft');
  } finally {
    client.release();
  }
}
