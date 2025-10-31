import { DATABASE_TIMEOUTS } from '../config/constants';
import { PoolClient } from 'pg';

/**
 * Set transaction-level timeouts to prevent hung operations
 * Should be called after BEGIN but before any queries
 */
export async function setTransactionTimeouts(client: PoolClient): Promise<void> {
  await client.query(`SET LOCAL statement_timeout = ${DATABASE_TIMEOUTS.STATEMENT_TIMEOUT_MS}`);
  await client.query(`SET LOCAL lock_timeout = ${DATABASE_TIMEOUTS.LOCK_TIMEOUT_MS}`);
}
