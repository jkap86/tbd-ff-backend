import { BaseRepository } from "../models/BaseRepository";
import { Draft } from "../models/Draft";
import { logger } from "../config/logger";

/**
 * DraftRepository - Centralized repository for all draft-related queries
 *
 * This repository extends BaseRepository to provide:
 * - Standard CRUD operations (inherited from BaseRepository)
 * - Draft lifecycle management (start, pause, resume, complete, reset)
 * - League-specific draft queries
 * - Draft status updates
 * - Transaction-safe draft operations
 *
 * Benefits:
 * - Centralizes all draft data access logic
 * - Provides consistent error handling
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across controllers
 */
export class DraftRepository extends BaseRepository<Draft> {
  constructor() {
    super('drafts', 'id');
  }

  /**
   * Get draft by league ID
   * Each league can only have one draft at a time
   *
   * @param leagueId - The league ID
   * @returns Draft or null if not found
   */
  async getByLeagueId(leagueId: number): Promise<Draft | null> {
    try {
      const query = `
        SELECT * FROM drafts
        WHERE league_id = $1
        LIMIT 1
      `;

      const result = await this.query(query, [leagueId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting draft by league ID:', { leagueId, error });
      throw new Error('Failed to get draft by league ID');
    }
  }

  /**
   * Get all drafts with a specific status
   * Useful for background jobs processing drafts
   *
   * @param status - The draft status to filter by
   * @returns Array of drafts with the specified status
   */
  async getByStatus(
    status: "not_started" | "in_progress" | "paused" | "completing" | "completed"
  ): Promise<Draft[]> {
    try {
      const query = `
        SELECT * FROM drafts
        WHERE status = $1
        ORDER BY created_at DESC
      `;

      const result = await this.query(query, [status]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting drafts by status:', { status, error });
      throw new Error('Failed to get drafts by status');
    }
  }

  /**
   * Get all scheduled drafts that should start now
   * Used by the draft scheduler to auto-start drafts
   *
   * @returns Array of drafts ready to start
   */
  async getScheduledDraftsToStart(): Promise<Draft[]> {
    try {
      const query = `
        SELECT * FROM drafts
        WHERE auto_start = true
          AND status = 'not_started'
          AND scheduled_start_time IS NOT NULL
          AND scheduled_start_time <= NOW()
        ORDER BY scheduled_start_time ASC
      `;

      const result = await this.query(query, []);
      return result.rows;
    } catch (error) {
      logger.error('Error getting scheduled drafts to start:', { error });
      throw new Error('Failed to get scheduled drafts to start');
    }
  }

  /**
   * Update draft status
   *
   * @param draftId - The draft ID
   * @param status - New status
   * @returns Updated draft
   */
  async updateStatus(
    draftId: number,
    status: "not_started" | "in_progress" | "paused" | "completing" | "completed"
  ): Promise<Draft> {
    try {
      const query = `
        UPDATE drafts
        SET status = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await this.query(query, [status, draftId]);

      if (result.rows.length === 0) {
        throw new Error('Draft not found');
      }

      logger.debug('Updated draft status', { draftId, status });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating draft status:', { draftId, status, error });
      throw new Error('Failed to update draft status');
    }
  }

  /**
   * Update draft pick deadline
   * Used for timer-based drafts
   *
   * @param draftId - The draft ID
   * @param deadline - New deadline timestamp
   * @returns Updated draft
   */
  async updatePickDeadline(draftId: number, deadline: Date | null): Promise<Draft> {
    try {
      const query = `
        UPDATE drafts
        SET pick_deadline = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await this.query(query, [deadline, draftId]);

      if (result.rows.length === 0) {
        throw new Error('Draft not found');
      }

      logger.debug('Updated draft pick deadline', { draftId, deadline });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating draft pick deadline:', { draftId, deadline, error });
      throw new Error('Failed to update draft pick deadline');
    }
  }

  /**
   * Advance draft to next pick
   * Updates current_pick, current_round, and current_roster_id
   *
   * @param draftId - The draft ID
   * @param nextPick - Next pick number
   * @param nextRound - Next round number
   * @param nextRosterId - Next roster ID on the clock
   * @param deadline - Optional new deadline for the pick
   * @returns Updated draft
   */
  async advancePick(
    draftId: number,
    nextPick: number,
    nextRound: number,
    nextRosterId: number | null,
    deadline?: Date | null
  ): Promise<Draft> {
    try {
      let query: string;
      let params: any[];

      if (deadline !== undefined) {
        query = `
          UPDATE drafts
          SET current_pick = $1,
              current_round = $2,
              current_roster_id = $3,
              pick_deadline = $4,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $5
          RETURNING *
        `;
        params = [nextPick, nextRound, nextRosterId, deadline, draftId];
      } else {
        query = `
          UPDATE drafts
          SET current_pick = $1,
              current_round = $2,
              current_roster_id = $3,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
          RETURNING *
        `;
        params = [nextPick, nextRound, nextRosterId, draftId];
      }

      const result = await this.query(query, params);

      if (result.rows.length === 0) {
        throw new Error('Draft not found');
      }

      logger.debug('Advanced draft pick', {
        draftId,
        nextPick,
        nextRound,
        nextRosterId,
        deadline
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error advancing draft pick:', {
        draftId,
        nextPick,
        nextRound,
        nextRosterId,
        error
      });
      throw new Error('Failed to advance draft pick');
    }
  }

  /**
   * Mark draft as started
   * Sets status to in_progress and records started_at timestamp
   *
   * @param draftId - The draft ID
   * @returns Updated draft
   */
  async markAsStarted(draftId: number): Promise<Draft> {
    try {
      const query = `
        UPDATE drafts
        SET status = 'in_progress',
            started_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.query(query, [draftId]);

      if (result.rows.length === 0) {
        throw new Error('Draft not found');
      }

      logger.info('Draft marked as started', { draftId });

      return result.rows[0];
    } catch (error) {
      logger.error('Error marking draft as started:', { draftId, error });
      throw new Error('Failed to mark draft as started');
    }
  }

  /**
   * Mark draft as completed
   * Sets status to completed and records completed_at timestamp
   *
   * @param draftId - The draft ID
   * @returns Updated draft
   */
  async markAsCompleted(draftId: number): Promise<Draft> {
    try {
      const query = `
        UPDATE drafts
        SET status = 'completed',
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.query(query, [draftId]);

      if (result.rows.length === 0) {
        throw new Error('Draft not found');
      }

      logger.info('Draft marked as completed', { draftId });

      return result.rows[0];
    } catch (error) {
      logger.error('Error marking draft as completed:', { draftId, error });
      throw new Error('Failed to mark draft as completed');
    }
  }

  /**
   * Reset draft to initial state
   * Sets status to not_started and clears runtime data
   *
   * @param draftId - The draft ID
   * @returns Updated draft
   */
  async reset(draftId: number): Promise<Draft> {
    try {
      const query = `
        UPDATE drafts
        SET status = 'not_started',
            current_pick = 1,
            current_round = 1,
            current_roster_id = NULL,
            pick_deadline = NULL,
            started_at = NULL,
            completed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.query(query, [draftId]);

      if (result.rows.length === 0) {
        throw new Error('Draft not found');
      }

      logger.info('Draft reset to initial state', { draftId });

      return result.rows[0];
    } catch (error) {
      logger.error('Error resetting draft:', { draftId, error });
      throw new Error('Failed to reset draft');
    }
  }

  /**
   * Update current roster on the clock
   * Used during draft to track whose turn it is
   *
   * @param draftId - The draft ID
   * @param rosterId - Roster ID now on the clock
   * @returns Updated draft
   */
  async updateCurrentRoster(draftId: number, rosterId: number | null): Promise<Draft> {
    try {
      const query = `
        UPDATE drafts
        SET current_roster_id = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await this.query(query, [rosterId, draftId]);

      if (result.rows.length === 0) {
        throw new Error('Draft not found');
      }

      logger.debug('Updated current roster on the clock', { draftId, rosterId });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating current roster:', { draftId, rosterId, error });
      throw new Error('Failed to update current roster');
    }
  }

  /**
   * Get count of drafts by status
   * Useful for dashboard statistics
   *
   * @param status - Draft status to count
   * @returns Count of drafts
   */
  async countByStatus(
    status: "not_started" | "in_progress" | "paused" | "completing" | "completed"
  ): Promise<number> {
    try {
      const result = await this.count('status = $1', [status]);
      return result;
    } catch (error) {
      logger.error('Error counting drafts by status:', { status, error });
      throw new Error('Failed to count drafts by status');
    }
  }

  /**
   * Check if a league has an active draft
   * Active = not_started, in_progress, or paused
   *
   * @param leagueId - The league ID
   * @returns True if league has an active draft
   */
  async hasActiveDraft(leagueId: number): Promise<boolean> {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM drafts
          WHERE league_id = $1
            AND status IN ('not_started', 'in_progress', 'paused')
        ) as has_active
      `;

      const result = await this.query(query, [leagueId]);
      return result.rows[0].has_active;
    } catch (error) {
      logger.error('Error checking for active draft:', { leagueId, error });
      throw new Error('Failed to check for active draft');
    }
  }

  /**
   * Batch update draft settings
   * Useful for updating multiple draft configuration fields
   *
   * @param draftId - The draft ID
   * @param updates - Object with fields to update
   * @returns Updated draft
   */
  async updateSettings(
    draftId: number,
    updates: Partial<Omit<Draft, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<Draft> {
    try {
      const fields = Object.keys(updates).filter(key => updates[key as keyof typeof updates] !== undefined);

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
      const values = fields.map(field => updates[field as keyof typeof updates]);
      values.push(draftId);

      const query = `
        UPDATE drafts
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${values.length}
        RETURNING *
      `;

      const result = await this.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Draft not found');
      }

      logger.debug('Updated draft settings', { draftId, fields });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating draft settings:', { draftId, updates, error });
      throw new Error('Failed to update draft settings');
    }
  }
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const draftRepository = new DraftRepository();
