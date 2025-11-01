/**
 * Application-wide constants
 */

// Transaction timeout settings (in milliseconds)
export const TRANSACTION_TIMEOUTS = {
  DEFAULT: 5000,        // 5 seconds for most transactions
  DRAFT_PICK: 10000,    // 10 seconds for draft picks (more complex)
  BATCH_OPERATION: 30000, // 30 seconds for batch operations
};

// PostgreSQL error codes
export const DB_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',
  CONNECTION_FAILURE: '08000',
  CONNECTION_DOES_NOT_EXIST: '08003',
  CONNECTION_EXCEPTION: '08006',
  INSUFFICIENT_PRIVILEGE: '42501',
  STATEMENT_TIMEOUT: '57014',
};

// Draft-related constants
export const DRAFT_CONSTANTS = {
  DEFAULT_TIMER_SECONDS: 90,
  MIN_TIMER_SECONDS: 30,
  MAX_TIMER_SECONDS: 300,
  AUTO_PAUSE_HOURS: [3, 4, 5, 6, 7, 8], // Hours when draft auto-pauses (3am-8am)
  CHESS_TIMER_DEFAULT_MINUTES: 60,
  CHESS_TIMER_MIN_MINUTES: 10,
  CHESS_TIMER_MAX_MINUTES: 180,
};

// Auction draft constants
export const AUCTION_CONSTANTS = {
  DEFAULT_BUDGET: 200,
  MIN_BID: 1,
  DEFAULT_BID_INCREMENT: 1,
  DEFAULT_NOMINATION_TIMER_SECONDS: 30,
  DEFAULT_BID_TIMER_SECONDS: 10,
  MAX_SIMULTANEOUS_NOMINATIONS: 1,
};

// Rate limiting
export const RATE_LIMITS = {
  DRAFT_PICK_PER_MINUTE: 10,
  CHAT_MESSAGES_PER_MINUTE: 30,
  API_CALLS_PER_MINUTE: 100,
};

// WebSocket events
export const SOCKET_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',

  // Draft events
  JOIN_DRAFT: 'join_draft',
  LEAVE_DRAFT: 'leave_draft',
  DRAFT_PICK: 'draft_pick',
  DRAFT_UPDATE: 'draft_update',
  DRAFT_COMPLETE: 'draft_complete',
  TIMER_UPDATE: 'timer_update',

  // League events
  JOIN_LEAGUE: 'join_league',
  LEAVE_LEAGUE: 'leave_league',
  LEAGUE_UPDATE: 'league_update',

  // Chat events
  DRAFT_CHAT: 'draft_chat',
  LEAGUE_CHAT: 'league_chat',

  // Derby events
  DERBY_UPDATE: 'derby_update',
  DERBY_SLOT_SELECTED: 'derby_slot_selected',
  DERBY_COMPLETE: 'derby_complete',

  // Auction events
  AUCTION_BID: 'auction_bid',
  AUCTION_NOMINATION: 'auction_nomination',
  AUCTION_UPDATE: 'auction_update',
};

// HTTP Status codes for consistent responses
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};