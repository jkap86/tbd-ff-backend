import { Request } from 'express';
import { validationResult } from 'express-validator';
import {
  proposeTradeValidator,
  respondToTradeValidator,
  cancelTradeValidator,
} from '../../validators/trade.validator';

const mockRequest = (body: any = {}, params: any = {}): Partial<Request> => ({
  body,
  params,
});

const runValidators = async (validators: any[], req: any) => {
  for (const validator of validators) {
    await validator.run(req);
  }
  return validationResult(req);
};

describe('Trade Validators', () => {
  describe('proposeTradeValidator', () => {
    it('should pass with valid trade proposal', async () => {
      const req = mockRequest({
        league_id: 1,
        proposer_roster_id: 1,
        receiver_roster_id: 2,
        proposer_players: ['player1', 'player2'],
        receiver_players: ['player3'],
      });

      const errors = await runValidators(proposeTradeValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail when trading with yourself', async () => {
      const req = mockRequest({
        league_id: 1,
        proposer_roster_id: 1,
        receiver_roster_id: 1,
        proposer_players: ['player1'],
        receiver_players: ['player2'],
      });

      const errors = await runValidators(proposeTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Cannot trade with yourself',
          }),
        ])
      );
    });

    it('should fail with empty trade (no players or picks)', async () => {
      const req = mockRequest({
        league_id: 1,
        proposer_roster_id: 1,
        receiver_roster_id: 2,
        proposer_players: [],
        receiver_players: [],
      });

      const errors = await runValidators(proposeTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Trade must include at least one player or draft pick',
          }),
        ])
      );
    });

    it('should pass with only proposer players', async () => {
      const req = mockRequest({
        league_id: 1,
        proposer_roster_id: 1,
        receiver_roster_id: 2,
        proposer_players: ['player1'],
        receiver_players: [],
      });

      const errors = await runValidators(proposeTradeValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with only receiver players', async () => {
      const req = mockRequest({
        league_id: 1,
        proposer_roster_id: 1,
        receiver_roster_id: 2,
        proposer_players: [],
        receiver_players: ['player1'],
      });

      const errors = await runValidators(proposeTradeValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with too many players', async () => {
      const req = mockRequest({
        league_id: 1,
        proposer_roster_id: 1,
        receiver_roster_id: 2,
        proposer_players: Array(11).fill('player'),
        receiver_players: [],
      });

      const errors = await runValidators(proposeTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with draft picks', async () => {
      const req = mockRequest({
        league_id: 1,
        proposer_roster_id: 1,
        receiver_roster_id: 2,
        proposer_players: [],
        receiver_players: [],
        proposer_draft_picks: [{ round: 1, year: 2024 }],
        receiver_draft_picks: [],
      });

      const errors = await runValidators(proposeTradeValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with optional message', async () => {
      const req = mockRequest({
        league_id: 1,
        proposer_roster_id: 1,
        receiver_roster_id: 2,
        proposer_players: ['player1'],
        receiver_players: [],
        message: 'This is a fair trade',
      });

      const errors = await runValidators(proposeTradeValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with message too long', async () => {
      const req = mockRequest({
        league_id: 1,
        proposer_roster_id: 1,
        receiver_roster_id: 2,
        proposer_players: ['player1'],
        receiver_players: [],
        message: 'a'.repeat(501),
      });

      const errors = await runValidators(proposeTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('respondToTradeValidator', () => {
    it('should pass with accept action', async () => {
      const req = mockRequest(
        {
          action: 'accept',
          roster_id: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(respondToTradeValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with reject action', async () => {
      const req = mockRequest(
        {
          action: 'reject',
          roster_id: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(respondToTradeValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with counter action and players', async () => {
      const req = mockRequest(
        {
          action: 'counter',
          roster_id: 1,
          counter_proposer_players: ['player1'],
          counter_receiver_players: ['player2'],
        },
        { id: '1' }
      );

      const errors = await runValidators(respondToTradeValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid action', async () => {
      const req = mockRequest(
        {
          action: 'invalid',
          roster_id: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(respondToTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing roster_id', async () => {
      const req = mockRequest(
        {
          action: 'accept',
        },
        { id: '1' }
      );

      const errors = await runValidators(respondToTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('cancelTradeValidator', () => {
    it('should pass with valid cancel request', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(cancelTradeValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid trade ID', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(cancelTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing roster_id', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(cancelTradeValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });
});
