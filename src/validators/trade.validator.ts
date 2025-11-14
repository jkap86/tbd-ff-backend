import { body, param } from 'express-validator';

/**
 * Validation rules for trade ID parameter
 */
export const tradeIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid trade ID'),
];

/**
 * Validation rules for proposing a trade
 */
export const proposeTradeValidator = [
  body('league_id')
    .isInt({ min: 1 })
    .withMessage('Invalid league ID'),

  body('proposer_roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid proposer roster ID'),

  body('receiver_roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid receiver roster ID')
    .custom((value, { req }) => {
      if (value === req.body.proposer_roster_id) {
        throw new Error('Cannot trade with yourself');
      }
      return true;
    }),

  body('proposer_players')
    .isArray({ min: 0, max: 10 })
    .withMessage('Proposer players must be an array with 0-10 items'),

  body('proposer_players.*')
    .isString()
    .withMessage('Each proposer player must be a valid player ID'),

  body('receiver_players')
    .isArray({ min: 0, max: 10 })
    .withMessage('Receiver players must be an array with 0-10 items'),

  body('receiver_players.*')
    .isString()
    .withMessage('Each receiver player must be a valid player ID'),

  body('proposer_draft_picks')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Proposer draft picks must be an array with max 10 items'),

  body('receiver_draft_picks')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Receiver draft picks must be an array with max 10 items'),

  body('message')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Trade message must not exceed 500 characters'),

  // Ensure trade is not empty
  body()
    .custom((value) => {
      const hasProposerPlayers = value.proposer_players && value.proposer_players.length > 0;
      const hasReceiverPlayers = value.receiver_players && value.receiver_players.length > 0;
      const hasProposerPicks = value.proposer_draft_picks && value.proposer_draft_picks.length > 0;
      const hasReceiverPicks = value.receiver_draft_picks && value.receiver_draft_picks.length > 0;

      if (!hasProposerPlayers && !hasReceiverPlayers && !hasProposerPicks && !hasReceiverPicks) {
        throw new Error('Trade must include at least one player or draft pick');
      }
      return true;
    }),
];

/**
 * Validation rules for responding to a trade
 */
export const respondToTradeValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid trade ID'),

  body('action')
    .isIn(['accept', 'reject', 'counter'])
    .withMessage('Action must be accept, reject, or counter'),

  body('roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  // Counter trade fields (only required if action is 'counter')
  body('counter_proposer_players')
    .if(body('action').equals('counter'))
    .isArray({ min: 0, max: 10 })
    .withMessage('Counter proposer players must be an array with 0-10 items'),

  body('counter_receiver_players')
    .if(body('action').equals('counter'))
    .isArray({ min: 0, max: 10 })
    .withMessage('Counter receiver players must be an array with 0-10 items'),

  body('counter_message')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Counter message must not exceed 500 characters'),
];

/**
 * Validation rules for canceling a trade
 */
export const cancelTradeValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid trade ID'),

  body('roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),
];

/**
 * Validation rules for vetoing a trade
 */
export const vetoTradeValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid trade ID'),

  body('roster_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster ID'),

  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Veto reason must not exceed 500 characters'),
];

/**
 * Validation rules for commissioner forcing a trade
 */
export const forceTradeValidator = [
  body('league_id')
    .isInt({ min: 1 })
    .withMessage('Invalid league ID'),

  body('roster1_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster1 ID'),

  body('roster2_id')
    .isInt({ min: 1 })
    .withMessage('Invalid roster2 ID')
    .custom((value, { req }) => {
      if (value === req.body.roster1_id) {
        throw new Error('Cannot trade roster with itself');
      }
      return true;
    }),

  body('roster1_players')
    .isArray({ min: 0, max: 10 })
    .withMessage('Roster1 players must be an array with 0-10 items'),

  body('roster2_players')
    .isArray({ min: 0, max: 10 })
    .withMessage('Roster2 players must be an array with 0-10 items'),

  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must not exceed 500 characters'),
];
