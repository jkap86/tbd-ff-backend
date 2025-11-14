import { body, param } from 'express-validator';

/**
 * Validation rules for auction ID parameter
 */
export const auctionIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid auction ID'),
];

/**
 * Validation rules for creating an auction
 */
export const createAuctionValidator = [
  body('league_id')
    .isInt({ min: 1 })
    .withMessage('Invalid league ID'),

  body('budget')
    .optional()
    .isInt({ min: 100, max: 10000 })
    .withMessage('Budget must be between 100 and 10000'),

  body('min_bid')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Minimum bid must be between 0 and 100'),

  body('nomination_time_seconds')
    .optional()
    .isInt({ min: 30, max: 300 })
    .withMessage('Nomination time must be between 30 and 300 seconds'),

  body('bidding_time_seconds')
    .optional()
    .isInt({ min: 10, max: 180 })
    .withMessage('Bidding time must be between 10 and 180 seconds'),
];

/**
 * Validation rules for placing a bid
 */
export const placeBidValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid auction ID'),

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

  body('amount')
    .isInt({ min: 0, max: 10000 })
    .withMessage('Bid amount must be between 0 and 10000')
    .custom((value, { req }) => {
      if (value < 1) {
        throw new Error('Bid amount must be at least 1');
      }
      return true;
    }),
];

/**
 * Validation rules for nominating a player
 */
export const nominatePlayerValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid auction ID'),

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

  body('opening_bid')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('Opening bid must be between 0 and 10000'),
];

/**
 * Validation rules for updating auction settings
 */
export const updateAuctionSettingsValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid auction ID'),

  body('nomination_time_seconds')
    .optional()
    .isInt({ min: 30, max: 300 })
    .withMessage('Nomination time must be between 30 and 300 seconds'),

  body('bidding_time_seconds')
    .optional()
    .isInt({ min: 10, max: 180 })
    .withMessage('Bidding time must be between 10 and 180 seconds'),

  body('status')
    .optional()
    .isIn(['not_started', 'in_progress', 'paused', 'completed'])
    .withMessage('Invalid auction status'),
];

/**
 * Validation rules for auction nomination order
 */
export const setNominationOrderValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid auction ID'),

  body('nomination_order')
    .isArray({ min: 2, max: 20 })
    .withMessage('Nomination order must be an array with 2-20 rosters'),

  body('nomination_order.*')
    .isInt({ min: 1 })
    .withMessage('Each roster ID must be a positive integer'),
];

/**
 * Validation rules for revalidating budget
 */
export const revalidateBudgetValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid auction ID'),

  body('roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),
];
