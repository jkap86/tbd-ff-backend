import { body, param, query } from 'express-validator';

/**
 * Validation rules for draft ID parameter
 */
export const draftIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid draft ID'),
];

/**
 * Validation rules for creating a draft
 */
export const createDraftValidator = [
  body('league_id')
    .isInt({ min: 1 })
    .withMessage('Invalid league ID'),

  body('draft_type')
    .isIn(['snake', 'linear', 'auction'])
    .withMessage('Draft type must be snake, linear, or auction'),

  body('rounds')
    .optional()
    .isInt({ min: 1, max: 30 })
    .withMessage('Rounds must be between 1 and 30'),

  body('pick_time_seconds')
    .optional()
    .isInt({ min: 30, max: 600 })
    .withMessage('Pick time must be between 30 and 600 seconds'),

  body('start_time')
    .optional()
    .isISO8601()
    .withMessage('Start time must be a valid ISO 8601 date'),
];

/**
 * Validation rules for making a draft pick
 */
export const makeDraftPickValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid draft ID'),

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

  body('pick_number')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Pick number must be a positive integer'),
];

/**
 * Validation rules for updating draft settings
 */
export const updateDraftSettingsValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid draft ID'),

  body('pick_time_seconds')
    .optional()
    .isInt({ min: 30, max: 600 })
    .withMessage('Pick time must be between 30 and 600 seconds'),

  body('status')
    .optional()
    .isIn(['not_started', 'in_progress', 'paused', 'completed'])
    .withMessage('Invalid draft status'),

  body('start_time')
    .optional()
    .isISO8601()
    .withMessage('Start time must be a valid ISO 8601 date'),
];

/**
 * Validation rules for setting draft order
 */
export const setDraftOrderValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid draft ID'),

  body('draft_order')
    .isArray({ min: 2, max: 20 })
    .withMessage('Draft order must be an array with 2-20 rosters'),

  body('draft_order.*')
    .isInt({ min: 1 })
    .withMessage('Each roster ID must be a positive integer'),
];

/**
 * Validation rules for autodraft settings
 */
export const autodraftSettingsValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid draft ID'),

  body('roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  body('autodraft_enabled')
    .isBoolean()
    .withMessage('autodraft_enabled must be a boolean'),
];

/**
 * Validation rules for getting available players
 */
export const availablePlayersValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid draft ID'),

  query('position')
    .optional()
    .isIn(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
    .withMessage('Invalid position filter'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage('Limit must be between 1 and 500'),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
];

/**
 * Validation rules for draft pick trades
 */
export const draftPickTradeValidator = [
  body('draft_id')
    .isInt({ min: 1 })
    .withMessage('Invalid draft ID'),

  body('from_roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid from_roster_id'),

  body('to_roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid to_roster_id'),

  body('round')
    .isInt({ min: 1, max: 30 })
    .withMessage('Round must be between 1 and 30'),

  body('pick_number')
    .isInt({ min: 1 })
    .withMessage('Pick number must be a positive integer'),
];
