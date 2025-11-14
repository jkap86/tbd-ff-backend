import { body, param, query } from 'express-validator';

/**
 * Validation rules for roster ID parameter
 */
export const rosterIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),
];

/**
 * Validation rules for adding a player to roster
 */
export const addPlayerValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  body('player_id')
    .notEmpty()
    .withMessage('Player ID is required')
    .isString()
    .withMessage('Player ID must be a string')
    .isLength({ min: 1, max: 20 })
    .withMessage('Invalid player ID format'),
];

/**
 * Validation rules for dropping a player from roster
 */
export const dropPlayerValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  body('player_id')
    .notEmpty()
    .withMessage('Player ID is required')
    .isString()
    .withMessage('Player ID must be a string'),
];

/**
 * Validation rules for setting lineup
 */
export const setLineupValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  body('week')
    .isInt({ min: 1, max: 18 })
    .withMessage('Week must be between 1 and 18'),

  body('starters')
    .isArray({ min: 1, max: 20 })
    .withMessage('Starters must be an array with at least 1 player and max 20'),

  body('starters.*')
    .isString()
    .withMessage('Each starter must be a valid player ID'),

  body('bench')
    .optional()
    .isArray({ max: 30 })
    .withMessage('Bench cannot exceed 30 players'),

  body('bench.*')
    .isString()
    .withMessage('Each bench player must be a valid player ID'),
];

/**
 * Validation rules for updating roster name
 */
export const updateRosterNameValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  body('name')
    .trim()
    .notEmpty()
    .withMessage('Roster name is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Roster name must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9\s\-_'!]+$/)
    .withMessage('Roster name contains invalid characters'),
];

/**
 * Validation rules for player transaction
 */
export const playerTransactionValidator = [
  body('roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  body('player_id')
    .notEmpty()
    .withMessage('Player ID is required')
    .isString()
    .withMessage('Player ID must be a string'),

  body('transaction_type')
    .isIn(['add', 'drop', 'trade', 'waiver'])
    .withMessage('Invalid transaction type'),
];

/**
 * Validation rules for getting roster by week
 */
export const rosterWeekValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  query('week')
    .optional()
    .isInt({ min: 1, max: 18 })
    .withMessage('Week must be between 1 and 18'),
];

/**
 * Validation rules for player position assignment
 */
export const playerPositionValidator = [
  body('player_id')
    .notEmpty()
    .withMessage('Player ID is required')
    .isString()
    .withMessage('Player ID must be a string'),

  body('position')
    .notEmpty()
    .withMessage('Position is required')
    .isIn(['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'IR'])
    .withMessage('Invalid position'),
];
