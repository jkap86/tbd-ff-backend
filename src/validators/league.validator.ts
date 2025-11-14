import { body, param } from 'express-validator';

/**
 * Validation rules for creating a league
 */
export const createLeagueValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('League name is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('League name must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_'!]+$/)
    .withMessage('League name contains invalid characters'),

  body('size')
    .optional()
    .isInt({ min: 2, max: 20 })
    .withMessage('League size must be between 2 and 20 teams'),

  body('scoring_type')
    .optional()
    .isIn(['standard', 'ppr', 'half_ppr', 'custom'])
    .withMessage('Invalid scoring type'),

  body('draft_type')
    .optional()
    .isIn(['snake', 'linear', 'auction'])
    .withMessage('Invalid draft type'),

  body('season')
    .optional()
    .isInt({ min: 2020, max: 2100 })
    .withMessage('Invalid season year'),

  body('is_dynasty')
    .optional()
    .isBoolean()
    .withMessage('is_dynasty must be a boolean'),

  body('trade_deadline_week')
    .optional()
    .isInt({ min: 1, max: 18 })
    .withMessage('Trade deadline must be between week 1 and 18'),

  body('playoff_teams')
    .optional()
    .isInt({ min: 2, max: 10 })
    .withMessage('Playoff teams must be between 2 and 10'),
];

/**
 * Validation rules for updating league settings
 */
export const updateLeagueValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid league ID'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('League name must be between 3 and 100 characters'),

  body('trade_deadline_week')
    .optional()
    .isInt({ min: 1, max: 18 })
    .withMessage('Trade deadline must be between week 1 and 18'),

  body('playoff_teams')
    .optional()
    .isInt({ min: 2, max: 10 })
    .withMessage('Playoff teams must be between 2 and 10'),
];

/**
 * Validation rules for joining a league
 */
export const joinLeagueValidator = [
  body('invite_code')
    .trim()
    .notEmpty()
    .withMessage('Invite code is required')
    .isLength({ min: 6, max: 20 })
    .withMessage('Invalid invite code format')
    .isAlphanumeric()
    .withMessage('Invite code must be alphanumeric'),

  body('team_name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Team name must be between 3 and 50 characters'),
];

/**
 * Validation rules for league ID parameter
 */
export const leagueIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid league ID'),
];

/**
 * Validation rules for updating scoring settings
 */
export const scoringSettingsValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid league ID'),

  body('passing_yards')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Passing yards points must be between 0 and 1'),

  body('passing_td')
    .optional()
    .isFloat({ min: 0, max: 10 })
    .withMessage('Passing TD points must be between 0 and 10'),

  body('rushing_yards')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Rushing yards points must be between 0 and 1'),

  body('rushing_td')
    .optional()
    .isFloat({ min: 0, max: 10 })
    .withMessage('Rushing TD points must be between 0 and 10'),

  body('receiving_yards')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Receiving yards points must be between 0 and 1'),

  body('receiving_td')
    .optional()
    .isFloat({ min: 0, max: 10 })
    .withMessage('Receiving TD points must be between 0 and 10'),

  body('receptions')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Receptions points must be between 0 and 2'),

  body('fumbles_lost')
    .optional()
    .isFloat({ min: -5, max: 0 })
    .withMessage('Fumbles lost points must be between -5 and 0'),

  body('interceptions')
    .optional()
    .isFloat({ min: -5, max: 0 })
    .withMessage('Interceptions points must be between -5 and 0'),
];
