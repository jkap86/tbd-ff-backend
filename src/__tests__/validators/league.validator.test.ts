import { Request } from 'express';
import { validationResult } from 'express-validator';
import {
  createLeagueValidator,
  updateLeagueValidator,
  joinLeagueValidator,
  leagueIdValidator,
  scoringSettingsValidator,
} from '../../validators/league.validator';

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

describe('League Validators', () => {
  describe('createLeagueValidator', () => {
    it('should pass with valid league data', async () => {
      const req = mockRequest({
        name: 'Test League',
        size: 12,
        scoring_type: 'ppr',
        draft_type: 'snake',
        season: 2024,
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing name', async () => {
      const req = mockRequest({
        size: 12,
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'League name is required',
          }),
        ])
      );
    });

    it('should fail with name too short', async () => {
      const req = mockRequest({
        name: 'AB',
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'League name must be between 3 and 100 characters',
          }),
        ])
      );
    });

    it('should fail with name too long', async () => {
      const req = mockRequest({
        name: 'a'.repeat(101),
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid characters in name', async () => {
      const req = mockRequest({
        name: 'Test League@#$',
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'League name contains invalid characters',
          }),
        ])
      );
    });

    it('should pass with valid special characters in name', async () => {
      const req = mockRequest({
        name: "Test League 2024 - John's Team!",
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with size too small', async () => {
      const req = mockRequest({
        name: 'Test League',
        size: 1,
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'League size must be between 2 and 20 teams',
          }),
        ])
      );
    });

    it('should fail with size too large', async () => {
      const req = mockRequest({
        name: 'Test League',
        size: 21,
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid scoring type', async () => {
      const req = mockRequest({
        name: 'Test League',
        scoring_type: 'invalid',
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid scoring type',
          }),
        ])
      );
    });

    it('should pass with all valid scoring types', async () => {
      const scoringTypes = ['standard', 'ppr', 'half_ppr', 'custom'];

      for (const scoringType of scoringTypes) {
        const req = mockRequest({
          name: 'Test League',
          scoring_type: scoringType,
        });

        const errors = await runValidators(createLeagueValidator, req);
        expect(errors.isEmpty()).toBe(true);
      }
    });

    it('should fail with invalid draft type', async () => {
      const req = mockRequest({
        name: 'Test League',
        draft_type: 'invalid',
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid draft type',
          }),
        ])
      );
    });

    it('should pass with all valid draft types', async () => {
      const draftTypes = ['snake', 'linear', 'auction'];

      for (const draftType of draftTypes) {
        const req = mockRequest({
          name: 'Test League',
          draft_type: draftType,
        });

        const errors = await runValidators(createLeagueValidator, req);
        expect(errors.isEmpty()).toBe(true);
      }
    });

    it('should fail with invalid season year', async () => {
      const req = mockRequest({
        name: 'Test League',
        season: 2019,
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid season year',
          }),
        ])
      );
    });

    it('should fail with future season year', async () => {
      const req = mockRequest({
        name: 'Test League',
        season: 2101,
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid trade deadline week', async () => {
      const req = mockRequest({
        name: 'Test League',
        trade_deadline_week: 0,
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with trade deadline week too high', async () => {
      const req = mockRequest({
        name: 'Test League',
        trade_deadline_week: 19,
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid playoff teams count', async () => {
      const req = mockRequest({
        name: 'Test League',
        playoff_teams: 1,
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with too many playoff teams', async () => {
      const req = mockRequest({
        name: 'Test League',
        playoff_teams: 11,
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with all optional fields', async () => {
      const req = mockRequest({
        name: 'Test League',
        size: 12,
        scoring_type: 'ppr',
        draft_type: 'snake',
        season: 2024,
        is_dynasty: true,
        trade_deadline_week: 13,
        playoff_teams: 6,
      });

      const errors = await runValidators(createLeagueValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('updateLeagueValidator', () => {
    it('should pass with valid update data', async () => {
      const req = mockRequest(
        {
          name: 'Updated League Name',
          trade_deadline_week: 14,
        },
        { id: '1' }
      );

      const errors = await runValidators(updateLeagueValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid league ID', async () => {
      const req = mockRequest(
        {
          name: 'Updated League',
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(updateLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid league ID',
          }),
        ])
      );
    });

    it('should fail with league ID zero', async () => {
      const req = mockRequest(
        {
          name: 'Updated League',
        },
        { id: '0' }
      );

      const errors = await runValidators(updateLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with name too short', async () => {
      const req = mockRequest(
        {
          name: 'AB',
        },
        { id: '1' }
      );

      const errors = await runValidators(updateLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with only one field updated', async () => {
      const req = mockRequest(
        {
          playoff_teams: 4,
        },
        { id: '1' }
      );

      const errors = await runValidators(updateLeagueValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('joinLeagueValidator', () => {
    it('should pass with valid join data', async () => {
      const req = mockRequest({
        invite_code: 'ABC123XYZ',
        team_name: 'My Team',
      });

      const errors = await runValidators(joinLeagueValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing invite code', async () => {
      const req = mockRequest({
        team_name: 'My Team',
      });

      const errors = await runValidators(joinLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invite code is required',
          }),
        ])
      );
    });

    it('should fail with invite code too short', async () => {
      const req = mockRequest({
        invite_code: 'ABC12',
      });

      const errors = await runValidators(joinLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invalid invite code format',
          }),
        ])
      );
    });

    it('should fail with invite code too long', async () => {
      const req = mockRequest({
        invite_code: 'A'.repeat(21),
      });

      const errors = await runValidators(joinLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with non-alphanumeric invite code', async () => {
      const req = mockRequest({
        invite_code: 'ABC123-XYZ',
      });

      const errors = await runValidators(joinLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Invite code must be alphanumeric',
          }),
        ])
      );
    });

    it('should fail with team name too short', async () => {
      const req = mockRequest({
        invite_code: 'ABC123XYZ',
        team_name: 'AB',
      });

      const errors = await runValidators(joinLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with team name too long', async () => {
      const req = mockRequest({
        invite_code: 'ABC123XYZ',
        team_name: 'A'.repeat(51),
      });

      const errors = await runValidators(joinLeagueValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass without team name (optional)', async () => {
      const req = mockRequest({
        invite_code: 'ABC123XYZ',
      });

      const errors = await runValidators(joinLeagueValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('leagueIdValidator', () => {
    it('should pass with valid league ID', async () => {
      const req = mockRequest({}, { id: '1' });

      const errors = await runValidators(leagueIdValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid league ID', async () => {
      const req = mockRequest({}, { id: 'invalid' });

      const errors = await runValidators(leagueIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with negative league ID', async () => {
      const req = mockRequest({}, { id: '-1' });

      const errors = await runValidators(leagueIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with zero league ID', async () => {
      const req = mockRequest({}, { id: '0' });

      const errors = await runValidators(leagueIdValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('scoringSettingsValidator', () => {
    it('should pass with valid scoring settings', async () => {
      const req = mockRequest(
        {
          passing_yards: 0.04,
          passing_td: 4,
          rushing_yards: 0.1,
          rushing_td: 6,
          receiving_yards: 0.1,
          receiving_td: 6,
          receptions: 1,
          fumbles_lost: -2,
          interceptions: -2,
        },
        { id: '1' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid league ID', async () => {
      const req = mockRequest(
        {
          passing_td: 4,
        },
        { id: 'invalid' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with passing yards out of range', async () => {
      const req = mockRequest(
        {
          passing_yards: 1.5,
        },
        { id: '1' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with passing TD out of range', async () => {
      const req = mockRequest(
        {
          passing_td: 15,
        },
        { id: '1' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with negative rushing yards', async () => {
      const req = mockRequest(
        {
          rushing_yards: -0.1,
        },
        { id: '1' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with receptions too high', async () => {
      const req = mockRequest(
        {
          receptions: 3,
        },
        { id: '1' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with fumbles penalty too severe', async () => {
      const req = mockRequest(
        {
          fumbles_lost: -10,
        },
        { id: '1' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with positive fumbles value', async () => {
      const req = mockRequest(
        {
          fumbles_lost: 2,
        },
        { id: '1' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should pass with partial scoring settings', async () => {
      const req = mockRequest(
        {
          passing_td: 4,
          receptions: 0.5,
        },
        { id: '1' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with standard scoring (0 PPR)', async () => {
      const req = mockRequest(
        {
          receptions: 0,
        },
        { id: '1' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with PPR scoring', async () => {
      const req = mockRequest(
        {
          receptions: 1,
        },
        { id: '1' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should pass with half PPR scoring', async () => {
      const req = mockRequest(
        {
          receptions: 0.5,
        },
        { id: '1' }
      );

      const errors = await runValidators(scoringSettingsValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });
});
