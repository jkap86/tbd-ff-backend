import { Request } from 'express';
import { validationResult } from 'express-validator';
import {
  auctionIdValidator,
  createAuctionValidator,
  placeBidValidator,
  nominatePlayerValidator,
  updateAuctionSettingsValidator,
  setNominationOrderValidator,
  revalidateBudgetValidator,
} from '../../validators/auction.validator';

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

describe('Auction Validators', () => {
  describe('auctionIdValidator', () => {
    it('should pass with valid auction ID', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(auctionIdValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid auction ID', async () => {
      const req = mockRequest({}, { id: 'invalid' });

      const errors = await runValidators(auctionIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid auction ID',
          }),
        ])
      );
    });

    it('should fail with zero auction ID', async () => {
      const req = mockRequest({}, { id: '0' });

      const errors = await runValidators(auctionIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with negative auction ID', async () => {
      const req = mockRequest({}, { id: '-1' });

      const errors = await runValidators(auctionIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('createAuctionValidator', () => {
    it('should pass with minimal valid data', async () => {
      const req = mockRequest({
        league_id: 1,
      });

      const errors = await runValidators(createAuctionValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with all optional fields', async () => {
      const req = mockRequest({
        league_id: 1,
        budget: 200,
        min_bid: 1,
        nomination_time_seconds: 60,
        bidding_time_seconds: 30,
      });

      const errors = await runValidators(createAuctionValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing league_id', async () => {
      const req = mockRequest({});

      const errors = await runValidators(createAuctionValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid league ID',
          }),
        ])
      );
    });

    it('should fail with budget too low', async () => {
      const req = mockRequest({
        league_id: 1,
        budget: 99,
      });

      const errors = await runValidators(createAuctionValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with budget too high', async () => {
      const req = mockRequest({
        league_id: 1,
        budget: 10001,
      });

      const errors = await runValidators(createAuctionValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with min_bid too high', async () => {
      const req = mockRequest({
        league_id: 1,
        min_bid: 101,
      });

      const errors = await runValidators(createAuctionValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with nomination_time too short', async () => {
      const req = mockRequest({
        league_id: 1,
        nomination_time_seconds: 29,
      });

      const errors = await runValidators(createAuctionValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with nomination_time too long', async () => {
      const req = mockRequest({
        league_id: 1,
        nomination_time_seconds: 301,
      });

      const errors = await runValidators(createAuctionValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with bidding_time too short', async () => {
      const req = mockRequest({
        league_id: 1,
        bidding_time_seconds: 9,
      });

      const errors = await runValidators(createAuctionValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with bidding_time too long', async () => {
      const req = mockRequest({
        league_id: 1,
        bidding_time_seconds: 181,
      });

      const errors = await runValidators(createAuctionValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('placeBidValidator', () => {
    it('should pass with valid bid', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
          amount: 10,
        },
        { id: '1' }
      );

      const errors = await runValidators(placeBidValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing roster_id', async () => {
      const req = mockRequest(
        {
          player_id: '12345',
          amount: 10,
        },
        { id: '1' }
      );

      const errors = await runValidators(placeBidValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing player_id', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          amount: 10,
        },
        { id: '1' }
      );

      const errors = await runValidators(placeBidValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing amount', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
        },
        { id: '1' }
      );

      const errors = await runValidators(placeBidValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with zero amount', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
          amount: 0,
        },
        { id: '1' }
      );

      const errors = await runValidators(placeBidValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Bid amount must be at least 1',
          }),
        ])
      );
    });

    it('should fail with amount too high', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
          amount: 10001,
        },
        { id: '1' }
      );

      const errors = await runValidators(placeBidValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with player_id too long', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: 'a'.repeat(21),
          amount: 10,
        },
        { id: '1' }
      );

      const errors = await runValidators(placeBidValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid auction ID', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
          amount: 10,
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(placeBidValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with minimum valid bid', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
          amount: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(placeBidValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('nominatePlayerValidator', () => {
    it('should pass with valid nomination', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
        },
        { id: '1' }
      );

      const errors = await runValidators(nominatePlayerValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with opening bid', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
          opening_bid: 5,
        },
        { id: '1' }
      );

      const errors = await runValidators(nominatePlayerValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing roster_id', async () => {
      const req = mockRequest(
        {
          player_id: '12345',
        },
        { id: '1' }
      );

      const errors = await runValidators(nominatePlayerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing player_id', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(nominatePlayerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with opening_bid too high', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
          opening_bid: 10001,
        },
        { id: '1' }
      );

      const errors = await runValidators(nominatePlayerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid auction ID', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
          player_id: '12345',
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(nominatePlayerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('updateAuctionSettingsValidator', () => {
    it('should pass with valid settings update', async () => {
      const req = mockRequest(
        {
          nomination_time_seconds: 90,
          bidding_time_seconds: 60,
          status: 'in_progress',
        },
        { id: '1' }
      );

      const errors = await runValidators(updateAuctionSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid auction ID', async () => {
      const req = mockRequest(
        {
          status: 'in_progress',
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(updateAuctionSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid status', async () => {
      const req = mockRequest(
        {
          status: 'invalid_status',
        },
        { id: '1' }
      );

      const errors = await runValidators(updateAuctionSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid auction status',
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

        const errors = await runValidators(updateAuctionSettingsValidator, req);
        expect(errors.isEmpty()).toBe(true);
      }
    });

    it('should pass with only one field updated', async () => {
      const req = mockRequest(
        {
          nomination_time_seconds: 120,
        },
        { id: '1' }
      );

      const errors = await runValidators(updateAuctionSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('setNominationOrderValidator', () => {
    it('should pass with valid nomination order', async () => {
      const req = mockRequest(
        {
          nomination_order: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        },
        { id: '1' }
      );

      const errors = await runValidators(setNominationOrderValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with too few rosters', async () => {
      const req = mockRequest(
        {
          nomination_order: [1],
        },
        { id: '1' }
      );

      const errors = await runValidators(setNominationOrderValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Nomination order must be an array with 2-20 rosters',
          }),
        ])
      );
    });

    it('should fail with too many rosters', async () => {
      const req = mockRequest(
        {
          nomination_order: Array.from({ length: 21 }, (_, i) => i + 1),
        },
        { id: '1' }
      );

      const errors = await runValidators(setNominationOrderValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid roster ID in array', async () => {
      const req = mockRequest(
        {
          nomination_order: [1, 2, 0, 4],
        },
        { id: '1' }
      );

      const errors = await runValidators(setNominationOrderValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with minimum valid nomination order', async () => {
      const req = mockRequest(
        {
          nomination_order: [1, 2],
        },
        { id: '1' }
      );

      const errors = await runValidators(setNominationOrderValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with maximum valid nomination order', async () => {
      const req = mockRequest(
        {
          nomination_order: Array.from({ length: 20 }, (_, i) => i + 1),
        },
        { id: '1' }
      );

      const errors = await runValidators(setNominationOrderValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('revalidateBudgetValidator', () => {
    it('should pass with valid data', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(revalidateBudgetValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing roster_id', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(revalidateBudgetValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid auction ID', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(revalidateBudgetValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid roster_id', async () => {
      const req = mockRequest(
        {
          roster_id: 0,
        },
        { id: '1' }
      );

      const errors = await runValidators(revalidateBudgetValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });
});
