import { body, param, query } from 'express-validator';

/**
 * Validation rules for waiver claim ID parameter
 */
export const waiverClaimIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid waiver claim ID'),
];

/**
 * Validation rules for submitting a waiver claim
 */
export const submitWaiverClaimValidator = [
  body('roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  body('player_id')
    .notEmpty()
    .withMessage('Player ID is required')
    .isString()
    .withMessage('Player ID must be a string')
    .isLength({ min: 1, max: 20 })
    .withMessage('Invalid player ID format'),

  body('drop_player_id')
    .optional()
    .isString()
    .withMessage('Drop player ID must be a string')
    .isLength({ min: 1, max: 20 })
    .withMessage('Invalid drop player ID format'),

  body('bid_amount')
    .isInt({ min: 0, max: 10000 })
    .withMessage('Bid amount must be between 0 and 10000')
    .custom((value) => {
      if (value < 0) {
        throw new Error('Bid amount cannot be negative');
      }
      return true;
    }),

  body('priority')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Priority must be between 1 and 100'),
];

/**
 * Validation rules for canceling a waiver claim
 */
export const cancelWaiverClaimValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid waiver claim ID'),

  body('roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),
];

/**
 * Validation rules for updating waiver settings
 */
export const updateWaiverSettingsValidator = [
  param('league_id')
    .isInt({ min: 1 })
    .withMessage('Invalid league ID'),

  body('waiver_type')
    .optional()
    .isIn(['rolling', 'reverse_standings', 'faab'])
    .withMessage('Waiver type must be rolling, reverse_standings, or faab'),

  body('waiver_period_days')
    .optional()
    .isInt({ min: 0, max: 7 })
    .withMessage('Waiver period must be between 0 and 7 days'),

  body('faab_budget')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('FAAB budget must be between 0 and 10000'),

  body('waiver_day')
    .optional()
    .isInt({ min: 0, max: 6 })
    .withMessage('Waiver day must be between 0 (Sunday) and 6 (Saturday)'),

  body('waiver_hour')
    .optional()
    .isInt({ min: 0, max: 23 })
    .withMessage('Waiver hour must be between 0 and 23'),
];

/**
 * Validation rules for processing waivers
 */
export const processWaiversValidator = [
  param('league_id')
    .isInt({ min: 1 })
    .withMessage('Invalid league ID'),
];

/**
 * Validation rules for getting waiver claims
 */
export const getWaiverClaimsValidator = [
  query('roster_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  query('league_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid league ID'),

  query('status')
    .optional()
    .isIn(['pending', 'successful', 'failed', 'cancelled'])
    .withMessage('Status must be pending, successful, failed, or cancelled'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
];

/**
 * Validation rules for updating waiver priority
 */
export const updateWaiverPriorityValidator = [
  param('roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  body('claim_priorities')
    .isArray({ min: 1, max: 50 })
    .withMessage('Claim priorities must be an array with 1-50 items'),

  body('claim_priorities.*.claim_id')
    .isInt({ min: 1 })
    .withMessage('Each claim ID must be a positive integer'),

  body('claim_priorities.*.priority')
    .isInt({ min: 1, max: 100 })
    .withMessage('Each priority must be between 1 and 100'),
];

/**
 * Validation rules for checking FAAB budget
 */
export const checkFAABBudgetValidator = [
  param('roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),
];
