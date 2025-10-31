export const DATABASE_TIMEOUTS = {
  STATEMENT_TIMEOUT_MS: 5000, // 5 seconds
  LOCK_TIMEOUT_MS: 3000, // 3 seconds for lock acquisition
};

export const TRANSACTION_TIMEOUTS = {
  DRAFT_PICK_SQL: '5000ms',
  AUCTION_BID_SQL: '5000ms',
  WAIVER_CLAIM_SQL: '5000ms',
  TRADE_SQL: '5000ms',
};

export const DB_ERROR_CODES = {
  STATEMENT_TIMEOUT: '57014', // Query canceled (timeout)
  LOCK_TIMEOUT: '55P03', // Lock not available
};
