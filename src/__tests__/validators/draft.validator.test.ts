import { Request } from 'express';
import { validationResult } from 'express-validator';
import {
  draftIdValidator,
  createDraftValidator,
  makeDraftPickValidator,
  updateDraftSettingsValidator,
  setDraftOrderValidator,
  autodraftSettingsValidator,
  availablePlayersValidator,
  draftPickTradeValidator,
} from '../../validators/draft.validator';

const mockRequest = (
  body: any = {},
  params: any = {},
  query: any = {}
): Partial<Request> => ({
  body,
  params,
  query,
});

const runValidators = async (validators: any[], req: any) => {
  for (const validator of validators) {
    await validator.run(req);
  }
  return validationResult(req);
};

describe('Draft Validators', () => {
  describe('draftIdValidator', () => {
    it('should pass with valid draft ID', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(draftIdValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid draft ID', async () => {
      const req = mockRequest({}, { id: 'invalid' });

      const errors = await runValidators(draftIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid draft ID',
          }),
        ])
      );
    });

    it('should fail with zero draft ID', async () => {
      const req = mockRequest({}, { id: '0' });

      const errors = await runValidators(draftIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with negative draft ID', async () => {
      const req = mockRequest({}, { id: '-1' });

      const errors = await runValidators(draftIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('createDraftValidator', () => {
    it('should pass with valid draft data', async () => {
      const req = mockRequest({
        league_id: 1,
        draft_type: 'snake',
        rounds: 16,
        pick_time_seconds: 90,
        start_time: '2024-09-01T12:00:00Z',
      });

      const errors = await runValidators(createDraftValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing league_id', async () => {
      const req = mockRequest({
        draft_type: 'snake',
      });

      const errors = await runValidators(createDraftValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid league ID',
          }),
        ])
      );
    });

    it('should fail with invalid draft type', async () => {
      const req = mockRequest({
        league_id: 1,
        draft_type: 'invalid',
      });

      const errors = await runValidators(createDraftValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Draft type must be snake, linear, or auction',
          }),
        ])
      );
    });

    it('should pass with all valid draft types', async () => {
      const draftTypes = ['snake', 'linear', 'auction'];

      for (const draftType of draftTypes) {
        const req = mockRequest({
          league_id: 1,
          draft_type: draftType,
        });

        const errors = await runValidators(createDraftValidator, req);
        expect(errors.isEmpty()).toBe(true);
      }
    });

    it('should fail with rounds too low', async () => {
      const req = mockRequest({
        league_id: 1,
        draft_type: 'snake',
        rounds: 0,
      });

      const errors = await runValidators(createDraftValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with rounds too high', async () => {
      const req = mockRequest({
        league_id: 1,
        draft_type: 'snake',
        rounds: 31,
      });

      const errors = await runValidators(createDraftValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with pick time too short', async () => {
      const req = mockRequest({
        league_id: 1,
        draft_type: 'snake',
        pick_time_seconds: 29,
      });

      const errors = await runValidators(createDraftValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with pick time too long', async () => {
      const req = mockRequest({
        league_id: 1,
        draft_type: 'snake',
        pick_time_seconds: 601,
      });

      const errors = await runValidators(createDraftValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid start time format', async () => {
      const req = mockRequest({
        league_id: 1,
        draft_type: 'snake',
        start_time: 'invalid-date',
      });

      const errors = await runValidators(createDraftValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with minimal required fields', async () => {
      const req = mockRequest({
        league_id: 1,
        draft_type: 'snake',
      });

      const errors = await runValidators(createDraftValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('makeDraftPickValidator', () => {
    it('should pass with valid draft pick', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
          pick_number: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(makeDraftPickValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid draft ID', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(makeDraftPickValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing roster_id', async () => {
      const req = mockRequest(
        {
          player_id: '12345',
        },
        { id: '1' }
      );

      const errors = await runValidators(makeDraftPickValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing player_id', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(makeDraftPickValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Player ID is required',
          }),
        ])
      );
    });

    it('should fail with player_id too long', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: 'a'.repeat(21),
        },
        { id: '1' }
      );

      const errors = await runValidators(makeDraftPickValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass without pick_number (optional)', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
        },
        { id: '1' }
      );

      const errors = await runValidators(makeDraftPickValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid pick_number', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
          pick_number: 0,
        },
        { id: '1' }
      );

      const errors = await runValidators(makeDraftPickValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('updateDraftSettingsValidator', () => {
    it('should pass with valid settings update', async () => {
      const req = mockRequest(
        {
          pick_time_seconds: 120,
          status: 'in_progress',
          start_time: '2024-09-01T12:00:00Z',
        },
        { id: '1' }
      );

      const errors = await runValidators(updateDraftSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid draft ID', async () => {
      const req = mockRequest(
        {
          status: 'in_progress',
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(updateDraftSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid status', async () => {
      const req = mockRequest(
        {
          status: 'invalid_status',
        },
        { id: '1' }
      );

      const errors = await runValidators(updateDraftSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid draft status',
          }),
        ])
      );
    });

    it('should pass with all valid statuses', async () => {
      const statuses = ['not_started', 'in_progress', 'paused', 'completed'];

      for (const status of statuses) {
        const req = mockRequest(
          {
            status,
          },
          { id: '1' }
        );

        const errors = await runValidators(updateDraftSettingsValidator, req);
        expect(errors.isEmpty()).toBe(true);
      }
    });

    it('should pass with only one field updated', async () => {
      const req = mockRequest(
        {
          pick_time_seconds: 60,
        },
        { id: '1' }
      );

      const errors = await runValidators(updateDraftSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('setDraftOrderValidator', () => {
    it('should pass with valid draft order', async () => {
      const req = mockRequest(
        {
          draft_order: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        },
        { id: '1' }
      );

      const errors = await runValidators(setDraftOrderValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with too few rosters', async () => {
      const req = mockRequest(
        {
          draft_order: [1],
        },
        { id: '1' }
      );

      const errors = await runValidators(setDraftOrderValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Draft order must be an array with 2-20 rosters',
          }),
        ])
      );
    });

    it('should fail with too many rosters', async () => {
      const req = mockRequest(
        {
          draft_order: Array.from({ length: 21 }, (_, i) => i + 1),
        },
        { id: '1' }
      );

      const errors = await runValidators(setDraftOrderValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid roster ID in array', async () => {
      const req = mockRequest(
        {
          draft_order: [1, 2, 0, 4],
        },
        { id: '1' }
      );

      const errors = await runValidators(setDraftOrderValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with minimum valid draft order', async () => {
      const req = mockRequest(
        {
          draft_order: [1, 2],
        },
        { id: '1' }
      );

      const errors = await runValidators(setDraftOrderValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with maximum valid draft order', async () => {
      const req = mockRequest(
        {
          draft_order: Array.from({ length: 20 }, (_, i) => i + 1),
        },
        { id: '1' }
      );

      const errors = await runValidators(setDraftOrderValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('autodraftSettingsValidator', () => {
    it('should pass with autodraft enabled', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          autodraft_enabled: true,
        },
        { id: '1' }
      );

      const errors = await runValidators(autodraftSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with autodraft disabled', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          autodraft_enabled: false,
        },
        { id: '1' }
      );

      const errors = await runValidators(autodraftSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing roster_id', async () => {
      const req = mockRequest(
        {
          autodraft_enabled: true,
        },
        { id: '1' }
      );

      const errors = await runValidators(autodraftSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with non-boolean autodraft_enabled', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          autodraft_enabled: 'yes',
        },
        { id: '1' }
      );

      const errors = await runValidators(autodraftSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'autodraft_enabled must be a boolean',
          }),
        ])
      );
    });
  });

  describe('availablePlayersValidator', () => {
    it('should pass without filters', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(availablePlayersValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with valid position filter', async () => {
      const req = mockRequest({}, { id: '1' }, { position: 'QB' });

      const errors = await runValidators(availablePlayersValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with all valid positions', async () => {
      const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

      for (const position of positions) {
        const req = mockRequest({}, { id: '1' }, { position });

        const errors = await runValidators(availablePlayersValidator, req);
        expect(errors.isEmpty()).toBe(true);
      }
    });

    it('should fail with invalid position', async () => {
      const req = mockRequest({}, { id: '1' }, { position: 'INVALID' });

      const errors = await runValidators(availablePlayersValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid position filter',
          }),
        ])
      );
    });

    it('should pass with valid limit', async () => {
      const req = mockRequest({}, { id: '1' }, { limit: '50' });

      const errors = await runValidators(availablePlayersValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with limit too high', async () => {
      const req = mockRequest({}, { id: '1' }, { limit: '501' });

      const errors = await runValidators(availablePlayersValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with limit zero', async () => {
      const req = mockRequest({}, { id: '1' }, { limit: '0' });

      const errors = await runValidators(availablePlayersValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with valid offset', async () => {
      const req = mockRequest({}, { id: '1' }, { offset: '10' });

      const errors = await runValidators(availablePlayersValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with negative offset', async () => {
      const req = mockRequest({}, { id: '1' }, { offset: '-1' });

      const errors = await runValidators(availablePlayersValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with all filters combined', async () => {
      const req = mockRequest(
        {},
        { id: '1' },
        { position: 'RB', limit: '100', offset: '20' }
      );

      const errors = await runValidators(availablePlayersValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('draftPickTradeValidator', () => {
    it('should pass with valid draft pick trade', async () => {
      const req = mockRequest({
        draft_id: 1,
        from_roster_id: 1,
        to_roster_id: 2,
        round: 5,
        pick_number: 12,
      });

      const errors = await runValidators(draftPickTradeValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing draft_id', async () => {
      const req = mockRequest({
        from_roster_id: 1,
        to_roster_id: 2,
        round: 5,
        pick_number: 12,
      });

      const errors = await runValidators(draftPickTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid from_roster_id', async () => {
      const req = mockRequest({
        draft_id: 1,
        from_roster_id: 0,
        to_roster_id: 2,
        round: 5,
        pick_number: 12,
      });

      const errors = await runValidators(draftPickTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid to_roster_id', async () => {
      const req = mockRequest({
        draft_id: 1,
        from_roster_id: 1,
        to_roster_id: -1,
        round: 5,
        pick_number: 12,
      });

      const errors = await runValidators(draftPickTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with round too low', async () => {
      const req = mockRequest({
        draft_id: 1,
        from_roster_id: 1,
        to_roster_id: 2,
        round: 0,
        pick_number: 12,
      });

      const errors = await runValidators(draftPickTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with round too high', async () => {
      const req = mockRequest({
        draft_id: 1,
        from_roster_id: 1,
        to_roster_id: 2,
        round: 31,
        pick_number: 12,
      });

      const errors = await runValidators(draftPickTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid pick_number', async () => {
      const req = mockRequest({
        draft_id: 1,
        from_roster_id: 1,
        to_roster_id: 2,
        round: 5,
        pick_number: 0,
      });

      const errors = await runValidators(draftPickTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with maximum round number', async () => {
      const req = mockRequest({
        draft_id: 1,
        from_roster_id: 1,
        to_roster_id: 2,
        round: 30,
        pick_number: 1,
      });

      const errors = await runValidators(draftPickTradeValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });
});
