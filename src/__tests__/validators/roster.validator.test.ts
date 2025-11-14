import { Request } from 'express';
import { validationResult } from 'express-validator';
import {
  rosterIdValidator,
  addPlayerValidator,
  dropPlayerValidator,
  setLineupValidator,
  updateRosterNameValidator,
  playerTransactionValidator,
  rosterWeekValidator,
  playerPositionValidator,
} from '../../validators/roster.validator';

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

describe('Roster Validators', () => {
  describe('rosterIdValidator', () => {
    it('should pass with valid roster ID', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(rosterIdValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid roster ID', async () => {
      const req = mockRequest({}, { id: 'invalid' });

      const errors = await runValidators(rosterIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid roster ID',
          }),
        ])
      );
    });

    it('should fail with zero roster ID', async () => {
      const req = mockRequest({}, { id: '0' });

      const errors = await runValidators(rosterIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with negative roster ID', async () => {
      const req = mockRequest({}, { id: '-1' });

      const errors = await runValidators(rosterIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('addPlayerValidator', () => {
    it('should pass with valid player data', async () => {
      const req = mockRequest(
        {
          player_id: '12345',
        },
        { id: '1' }
      );

      const errors = await runValidators(addPlayerValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing player_id', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(addPlayerValidator, req);
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
          player_id: 'a'.repeat(21),
        },
        { id: '1' }
      );

      const errors = await runValidators(addPlayerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid roster ID', async () => {
      const req = mockRequest(
        {
          player_id: '12345',
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(addPlayerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('dropPlayerValidator', () => {
    it('should pass with valid player data', async () => {
      const req = mockRequest(
        {
          player_id: '12345',
        },
        { id: '1' }
      );

      const errors = await runValidators(dropPlayerValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing player_id', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(dropPlayerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid roster ID', async () => {
      const req = mockRequest(
        {
          player_id: '12345',
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(dropPlayerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('setLineupValidator', () => {
    it('should pass with valid lineup', async () => {
      const req = mockRequest(
        {
          week: 1,
          starters: ['player1', 'player2', 'player3'],
          bench: ['player4', 'player5'],
        },
        { id: '1' }
      );

      const errors = await runValidators(setLineupValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing week', async () => {
      const req = mockRequest(
        {
          starters: ['player1', 'player2'],
        },
        { id: '1' }
      );

      const errors = await runValidators(setLineupValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with week too low', async () => {
      const req = mockRequest(
        {
          week: 0,
          starters: ['player1'],
        },
        { id: '1' }
      );

      const errors = await runValidators(setLineupValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with week too high', async () => {
      const req = mockRequest(
        {
          week: 19,
          starters: ['player1'],
        },
        { id: '1' }
      );

      const errors = await runValidators(setLineupValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing starters', async () => {
      const req = mockRequest(
        {
          week: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(setLineupValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with empty starters array', async () => {
      const req = mockRequest(
        {
          week: 1,
          starters: [],
        },
        { id: '1' }
      );

      const errors = await runValidators(setLineupValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Starters must be an array with at least 1 player and max 20',
          }),
        ])
      );
    });

    it('should fail with too many starters', async () => {
      const req = mockRequest(
        {
          week: 1,
          starters: Array(21).fill('player'),
        },
        { id: '1' }
      );

      const errors = await runValidators(setLineupValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with too many bench players', async () => {
      const req = mockRequest(
        {
          week: 1,
          starters: ['player1'],
          bench: Array(31).fill('player'),
        },
        { id: '1' }
      );

      const errors = await runValidators(setLineupValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass without bench (optional)', async () => {
      const req = mockRequest(
        {
          week: 1,
          starters: ['player1', 'player2'],
        },
        { id: '1' }
      );

      const errors = await runValidators(setLineupValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with empty bench array', async () => {
      const req = mockRequest(
        {
          week: 1,
          starters: ['player1'],
          bench: [],
        },
        { id: '1' }
      );

      const errors = await runValidators(setLineupValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with maximum valid lineup', async () => {
      const req = mockRequest(
        {
          week: 1,
          starters: Array(20).fill('player'),
          bench: Array(30).fill('player'),
        },
        { id: '1' }
      );

      const errors = await runValidators(setLineupValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('updateRosterNameValidator', () => {
    it('should pass with valid roster name', async () => {
      const req = mockRequest(
        {
          name: 'My Team',
        },
        { id: '1' }
      );

      const errors = await runValidators(updateRosterNameValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing name', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(updateRosterNameValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with name too short', async () => {
      const req = mockRequest(
        {
          name: 'AB',
        },
        { id: '1' }
      );

      const errors = await runValidators(updateRosterNameValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Roster name must be between 3 and 50 characters',
          }),
        ])
      );
    });

    it('should fail with name too long', async () => {
      const req = mockRequest(
        {
          name: 'a'.repeat(51),
        },
        { id: '1' }
      );

      const errors = await runValidators(updateRosterNameValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid characters in name', async () => {
      const req = mockRequest(
        {
          name: 'Team@#$%',
        },
        { id: '1' }
      );

      const errors = await runValidators(updateRosterNameValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Roster name contains invalid characters',
          }),
        ])
      );
    });

    it('should pass with valid special characters', async () => {
      const req = mockRequest(
        {
          name: "John's Team 2024 - The Winners!",
        },
        { id: '1' }
      );

      const errors = await runValidators(updateRosterNameValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid roster ID', async () => {
      const req = mockRequest(
        {
          name: 'Valid Name',
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(updateRosterNameValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('playerTransactionValidator', () => {
    it('should pass with valid transaction', async () => {
      const req = mockRequest({
        roster_id: 1,
        player_id: '12345',
        transaction_type: 'add',
      });

      const errors = await runValidators(playerTransactionValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with all valid transaction types', async () => {
      const transactionTypes = ['add', 'drop', 'trade', 'waiver'];

      for (const transactionType of transactionTypes) {
        const req = mockRequest({
          roster_id: 1,
          player_id: '12345',
          transaction_type: transactionType,
        });

        const errors = await runValidators(playerTransactionValidator, req);
        expect(errors.isEmpty()).toBe(true);
      }
    });

    it('should fail with invalid transaction type', async () => {
      const req = mockRequest({
        roster_id: 1,
        player_id: '12345',
        transaction_type: 'invalid',
      });

      const errors = await runValidators(playerTransactionValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid transaction type',
          }),
        ])
      );
    });

    it('should fail with missing roster_id', async () => {
      const req = mockRequest({
        player_id: '12345',
        transaction_type: 'add',
      });

      const errors = await runValidators(playerTransactionValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing player_id', async () => {
      const req = mockRequest({
        roster_id: 1,
        transaction_type: 'add',
      });

      const errors = await runValidators(playerTransactionValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid roster_id', async () => {
      const req = mockRequest({
        roster_id: 0,
        player_id: '12345',
        transaction_type: 'add',
      });

      const errors = await runValidators(playerTransactionValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('rosterWeekValidator', () => {
    it('should pass without week parameter', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(rosterWeekValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with valid week', async () => {
      const req = mockRequest({}, { id: '1' }, { week: '5' });

      const errors = await runValidators(rosterWeekValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with week too low', async () => {
      const req = mockRequest({}, { id: '1' }, { week: '0' });

      const errors = await runValidators(rosterWeekValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with week too high', async () => {
      const req = mockRequest({}, { id: '1' }, { week: '19' });

      const errors = await runValidators(rosterWeekValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid roster ID', async () => {
      const req = mockRequest({}, { id: 'invalid' });

      const errors = await runValidators(rosterWeekValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with week 1', async () => {
      const req = mockRequest({}, { id: '1' }, { week: '1' });

      const errors = await runValidators(rosterWeekValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with week 18', async () => {
      const req = mockRequest({}, { id: '1' }, { week: '18' });

      const errors = await runValidators(rosterWeekValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('playerPositionValidator', () => {
    it('should pass with valid position', async () => {
      const req = mockRequest({
        player_id: '12345',
        position: 'QB',
      });

      const errors = await runValidators(playerPositionValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with all valid positions', async () => {
      const positions = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'IR'];

      for (const position of positions) {
        const req = mockRequest({
          player_id: '12345',
          position,
        });

        const errors = await runValidators(playerPositionValidator, req);
        expect(errors.isEmpty()).toBe(true);
      }
    });

    it('should fail with invalid position', async () => {
      const req = mockRequest({
        player_id: '12345',
        position: 'INVALID',
      });

      const errors = await runValidators(playerPositionValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid position',
          }),
        ])
      );
    });

    it('should fail with missing player_id', async () => {
      const req = mockRequest({
        position: 'QB',
      });

      const errors = await runValidators(playerPositionValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing position', async () => {
      const req = mockRequest({
        player_id: '12345',
      });

      const errors = await runValidators(playerPositionValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Position is required',
          }),
        ])
      );
    });
  });
});
