import { TRANSACTION_TIMEOUTS } from '../config/constants';
import { PoolClient } from 'pg';

/**
 * Set transaction-level timeouts to prevent hung operations
 * Should be called after BEGIN but before any queries
 * @param client - The database client
 * @param timeout - Optional custom timeout in milliseconds (defaults to TRANSACTION_TIMEOUTS.DEFAULT)
 */
export async function setTransactionTimeouts(client: PoolClient, timeout?: number): Promise<void> {
  const timeoutMs = timeout || TRANSACTION_TIMEOUTS.DEFAULT;
  await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
  await client.query(`SET LOCAL lock_timeout = ${timeoutMs}`);
}
