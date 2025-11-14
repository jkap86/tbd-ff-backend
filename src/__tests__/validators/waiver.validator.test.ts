import { Request } from 'express';
import { validationResult } from 'express-validator';
import {
  waiverClaimIdValidator,
  submitWaiverClaimValidator,
  cancelWaiverClaimValidator,
  updateWaiverSettingsValidator,
  processWaiversValidator,
  getWaiverClaimsValidator,
  updateWaiverPriorityValidator,
  checkFAABBudgetValidator,
} from '../../validators/waiver.validator';

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

describe('Waiver Validators', () => {
  describe('waiverClaimIdValidator', () => {
    it('should pass with valid waiver claim ID', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(waiverClaimIdValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid waiver claim ID', async () => {
      const req = mockRequest({}, { id: 'invalid' });

      const errors = await runValidators(waiverClaimIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid waiver claim ID',
          }),
        ])
      );
    });

    it('should fail with zero waiver claim ID', async () => {
      const req = mockRequest({}, { id: '0' });

      const errors = await runValidators(waiverClaimIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with negative waiver claim ID', async () => {
      const req = mockRequest({}, { id: '-1' });

      const errors = await runValidators(waiverClaimIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('submitWaiverClaimValidator', () => {
    it('should pass with valid waiver claim', async () => {
      const req = mockRequest({
        roster_id: 1,
        player_id: '12345',
        bid_amount: 10,
      });

      const errors = await runValidators(submitWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with all optional fields', async () => {
      const req = mockRequest({
        roster_id: 1,
        player_id: '12345',
        drop_player_id: '67890',
        bid_amount: 15,
        priority: 5,
      });

      const errors = await runValidators(submitWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing roster_id', async () => {
      const req = mockRequest({
        player_id: '12345',
        bid_amount: 10,
      });

      const errors = await runValidators(submitWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing player_id', async () => {
      const req = mockRequest({
        roster_id: 1,
        bid_amount: 10,
      });

      const errors = await runValidators(submitWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing bid_amount', async () => {
      const req = mockRequest({
        roster_id: 1,
        player_id: '12345',
      });

      const errors = await runValidators(submitWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with zero bid amount (free waivers)', async () => {
      const req = mockRequest({
        roster_id: 1,
        player_id: '12345',
        bid_amount: 0,
      });

      const errors = await runValidators(submitWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with bid amount too high', async () => {
      const req = mockRequest({
        roster_id: 1,
        player_id: '12345',
        bid_amount: 10001,
      });

      const errors = await runValidators(submitWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with player_id too long', async () => {
      const req = mockRequest({
        roster_id: 1,
        player_id: 'a'.repeat(21),
        bid_amount: 10,
      });

      const errors = await runValidators(submitWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with drop_player_id too long', async () => {
      const req = mockRequest({
        roster_id: 1,
        player_id: '12345',
        drop_player_id: 'a'.repeat(21),
        bid_amount: 10,
      });

      const errors = await runValidators(submitWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with priority too low', async () => {
      const req = mockRequest({
        roster_id: 1,
        player_id: '12345',
        bid_amount: 10,
        priority: 0,
      });

      const errors = await runValidators(submitWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with priority too high', async () => {
      const req = mockRequest({
        roster_id: 1,
        player_id: '12345',
        bid_amount: 10,
        priority: 101,
      });

      const errors = await runValidators(submitWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('cancelWaiverClaimValidator', () => {
    it('should pass with valid data', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(cancelWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing roster_id', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(cancelWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid waiver claim ID', async () => {
      const req = mockRequest(
        {
          roster_id: 1,
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(cancelWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid roster_id', async () => {
      const req = mockRequest(
        {
          roster_id: 0,
        },
        { id: '1' }
      );

      const errors = await runValidators(cancelWaiverClaimValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('updateWaiverSettingsValidator', () => {
    it('should pass with valid settings', async () => {
      const req = mockRequest(
        {
          waiver_type: 'faab',
          waiver_period_days: 2,
          faab_budget: 100,
          waiver_day: 2,
          waiver_hour: 12,
        },
        { league_id: '1' }
      );

      const errors = await runValidators(updateWaiverSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid league ID', async () => {
      const req = mockRequest(
        {
          waiver_type: 'faab',
        },
        { league_id: 'invalid' }
      );

      const errors = await runValidators(updateWaiverSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with all valid waiver types', async () => {
      const waiverTypes = ['rolling', 'reverse_standings', 'faab'];

      for (const waiverType of waiverTypes) {
        const req = mockRequest(
          {
            waiver_type: waiverType,
          },
          { league_id: '1' }
        );

        const errors = await runValidators(updateWaiverSettingsValidator, req);
        expect(errors.isEmpty()).toBe(true);
      }
    });

    it('should fail with invalid waiver type', async () => {
      const req = mockRequest(
        {
          waiver_type: 'invalid',
        },
        { league_id: '1' }
      );

      const errors = await runValidators(updateWaiverSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with waiver_period_days too high', async () => {
      const req = mockRequest(
        {
          waiver_period_days: 8,
        },
        { league_id: '1' }
      );

      const errors = await runValidators(updateWaiverSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with faab_budget too high', async () => {
      const req = mockRequest(
        {
          faab_budget: 10001,
        },
        { league_id: '1' }
      );

      const errors = await runValidators(updateWaiverSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid waiver_day', async () => {
      const req = mockRequest(
        {
          waiver_day: 7,
        },
        { league_id: '1' }
      );

      const errors = await runValidators(updateWaiverSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid waiver_hour', async () => {
      const req = mockRequest(
        {
          waiver_hour: 24,
        },
        { league_id: '1' }
      );

      const errors = await runValidators(updateWaiverSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with partial settings update', async () => {
      const req = mockRequest(
        {
          waiver_type: 'faab',
        },
        { league_id: '1' }
      );

      const errors = await runValidators(updateWaiverSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('processWaiversValidator', () => {
    it('should pass with valid league ID', async () => {
      const req = mockRequest({}, { league_id: '1' });

      const errors = await runValidators(processWaiversValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid league ID', async () => {
      const req = mockRequest({}, { league_id: 'invalid' });

      const errors = await runValidators(processWaiversValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with zero league ID', async () => {
      const req = mockRequest({}, { league_id: '0' });

      const errors = await runValidators(processWaiversValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('getWaiverClaimsValidator', () => {
    it('should pass without filters', async () => {
      const req = mockRequest();

      const errors = await runValidators(getWaiverClaimsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with roster_id filter', async () => {
      const req = mockRequest({}, {}, { roster_id: '1' });

      const errors = await runValidators(getWaiverClaimsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with league_id filter', async () => {
      const req = mockRequest({}, {}, { league_id: '1' });

      const errors = await runValidators(getWaiverClaimsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with all valid statuses', async () => {
      const statuses = ['pending', 'successful', 'failed', 'cancelled'];

      for (const status of statuses) {
        const req = mockRequest({}, {}, { status });

        const errors = await runValidators(getWaiverClaimsValidator, req);
        expect(errors.isEmpty()).toBe(true);
      }
    });

    it('should fail with invalid status', async () => {
      const req = mockRequest({}, {}, { status: 'invalid' });

      const errors = await runValidators(getWaiverClaimsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with limit too high', async () => {
      const req = mockRequest({}, {}, { limit: '101' });

      const errors = await runValidators(getWaiverClaimsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with limit too low', async () => {
      const req = mockRequest({}, {}, { limit: '0' });

      const errors = await runValidators(getWaiverClaimsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with negative offset', async () => {
      const req = mockRequest({}, {}, { offset: '-1' });

      const errors = await runValidators(getWaiverClaimsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with all filters combined', async () => {
      const req = mockRequest(
        {},
        {},
        {
          roster_id: '1',
          league_id: '1',
          status: 'pending',
          limit: '50',
          offset: '10',
        }
      );

      const errors = await runValidators(getWaiverClaimsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('updateWaiverPriorityValidator', () => {
    it('should pass with valid priorities', async () => {
      const req = mockRequest(
        {
          claim_priorities: [
            { claim_id: 1, priority: 1 },
            { claim_id: 2, priority: 2 },
            { claim_id: 3, priority: 3 },
          ],
        },
        { roster_id: '1' }
      );

      const errors = await runValidators(updateWaiverPriorityValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing claim_priorities', async () => {
      const req = mockRequest({}, { roster_id: '1' });

      const errors = await runValidators(updateWaiverPriorityValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with empty claim_priorities array', async () => {
      const req = mockRequest(
        {
          claim_priorities: [],
        },
        { roster_id: '1' }
      );

      const errors = await runValidators(updateWaiverPriorityValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with too many claim_priorities', async () => {
      const req = mockRequest(
        {
          claim_priorities: Array(51)
            .fill(null)
            .map((_, i) => ({ claim_id: i + 1, priority: i + 1 })),
        },
        { roster_id: '1' }
      );

      const errors = await runValidators(updateWaiverPriorityValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid roster_id', async () => {
      const req = mockRequest(
        {
          claim_priorities: [{ claim_id: 1, priority: 1 }],
        },
        { roster_id: 'invalid' }
      );

      const errors = await runValidators(updateWaiverPriorityValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with maximum valid priorities', async () => {
      const req = mockRequest(
        {
          claim_priorities: Array(50)
            .fill(null)
            .map((_, i) => ({ claim_id: i + 1, priority: i + 1 })),
        },
        { roster_id: '1' }
      );

      const errors = await runValidators(updateWaiverPriorityValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('checkFAABBudgetValidator', () => {
    it('should pass with valid roster ID', async () => {
      const req = mockRequest({}, { roster_id: '1' });

      const errors = await runValidators(checkFAABBudgetValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid roster ID', async () => {
      const req = mockRequest({}, { roster_id: 'invalid' });

      const errors = await runValidators(checkFAABBudgetValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with zero roster ID', async () => {
      const req = mockRequest({}, { roster_id: '0' });

      const errors = await runValidators(checkFAABBudgetValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with negative roster ID', async () => {
      const req = mockRequest({}, { roster_id: '-1' });

      const errors = await runValidators(checkFAABBudgetValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });
});
