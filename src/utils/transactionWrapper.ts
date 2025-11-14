import { PoolClient } from "pg";
import pool from "../config/database";
import { setTransactionTimeouts } from "./transactionTimeout";
import { DB_ERROR_CODES } from "../config/constants";
import { logger } from "../config/logger";

/**
 * Custom error for transaction timeouts
 */
export class TransactionTimeoutError extends Error {
  code: string;
  constructor(message: string = "Transaction timed out") {
    super(message);
    this.name = "TransactionTimeoutError";
    this.code = "TIMEOUT";
  }
}

/**
 * Custom error for transaction failures with rollback info
 */
export class TransactionError extends Error {
  originalError: Error;
  rolledBack: boolean;

  constructor(originalError: Error, rolledBack: boolean = true) {
    super(originalError.message);
    this.name = "TransactionError";
    this.originalError = originalError;
    this.rolledBack = rolledBack;
  }
}

/**
 * Transaction isolation level
 */
export type IsolationLevel =
  | "READ UNCOMMITTED"
  | "READ COMMITTED"
  | "REPEATABLE READ"
  | "SERIALIZABLE";

/**
 * Transaction wrapper options
 */
export interface TransactionOptions {
  /**
   * Transaction timeout in milliseconds
   * Default: 10000 (10 seconds)
   */
  timeout?: number;

  /**
   * Transaction isolation level
   * Default: READ COMMITTED (Postgres default)
   */
  isolationLevel?: IsolationLevel;
}

/**
 * Executes a database operation within a transaction.
 * Automatically handles BEGIN, COMMIT, ROLLBACK, and client release.
 *
 * @param operation - The async function to execute within the transaction
 * @param options - Optional configuration (timeout)
 * @returns The result of the operation
 * @throws TransactionTimeoutError if the operation times out
 * @throws TransactionError if the operation fails and is rolled back
 *
 * @example
 * ```typescript
 * const result = await withTransaction(async (client) => {
 *   await client.query('INSERT INTO users (name) VALUES ($1)', ['John']);
 *   const user = await client.query('SELECT * FROM users WHERE name = $1', ['John']);
 *   return user.rows[0];
 * });
 * ```
 */
export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  const client = await pool.connect();

  try {
    // Set transaction timeouts
    await setTransactionTimeouts(client, options?.timeout);

    // Begin transaction with optional isolation level
    if (options?.isolationLevel) {
      await client.query(`BEGIN ISOLATION LEVEL ${options.isolationLevel}`);
    } else {
      await client.query("BEGIN");
    }

    // Execute the operation
    const result = await operation(client);

    // Commit transaction
    await client.query("COMMIT");

    return result;
  } catch (error: any) {
    // Attempt to rollback
    let rolledBack = true;
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logger.error("Failed to rollback transaction", { error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError) });
      rolledBack = false;
    }

    // Handle timeout errors specifically
    if (error.code === DB_ERROR_CODES.STATEMENT_TIMEOUT) {
      throw new TransactionTimeoutError("Transaction operation timed out");
    }

    // Wrap other errors
    throw new TransactionError(error, rolledBack);
  } finally {
    // Always release the client back to the pool
    client.release();
  }
}

/**
 * Executes multiple operations in a single transaction sequentially.
 * Useful when you need to perform several independent operations atomically.
 *
 * @param operations - Array of async functions to execute
 * @param options - Optional configuration (timeout)
 * @returns Array of results from each operation
 *
 * @example
 * ```typescript
 * const [user, profile] = await withTransactionBatch([
 *   (client) => client.query('INSERT INTO users ...'),
 *   (client) => client.query('INSERT INTO profiles ...')
 * ]);
 * ```
 */
export async function withTransactionBatch<T extends any[]>(
  operations: Array<(client: PoolClient) => Promise<any>>,
  options?: TransactionOptions
): Promise<T> {
  return withTransaction(async (client) => {
    const results: any[] = [];
    for (const operation of operations) {
      const result = await operation(client);
      results.push(result);
    }
    return results as T;
  }, options);
}
