import { TRANSACTION_TIMEOUTS } from '../config/constants';
import { PoolClient } from 'pg';

/**
 * Set transaction-level timeouts to prevent hung operations
 * Should be called after BEGIN but before any queries
 */
export async function setTransactionTimeouts(client: PoolClient): Promise<void> {
  await client.query(`SET LOCAL statement_timeout = ${TRANSACTION_TIMEOUTS.DEFAULT}`);
  await client.query(`SET LOCAL lock_timeout = ${TRANSACTION_TIMEOUTS.DEFAULT}`);
}
