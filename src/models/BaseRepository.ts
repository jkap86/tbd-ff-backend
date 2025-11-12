import { Pool, QueryResult, QueryResultRow } from "pg";
import pool from "../config/database";

/**
 * Abstract base repository class providing generic CRUD operations
 *
 * This class eliminates repetitive database query code by providing:
 * - Generic CRUD methods (findById, findAll, create, update, delete)
 * - Automatic error handling with consistent error messages
 * - Type-safe operations using TypeScript generics
 * - Protected query method for custom queries
 *
 * @template T The entity type this repository manages
 *
 * @example
 * ```typescript
 * export class PlayerRepository extends BaseRepository<Player> {
 *   constructor() {
 *     super('players', 'player_id'); // table name, primary key column
 *   }
 * }
 * ```
 */
export abstract class BaseRepository<T> {
  protected pool: Pool;
  protected tableName: string;
  protected primaryKey: string;

  /**
   * Creates a new repository instance
   *
   * @param tableName - The database table name
   * @param primaryKey - The primary key column name (defaults to 'id')
   */
  constructor(tableName: string, primaryKey: string = 'id') {
    this.pool = pool;
    this.tableName = tableName;
    this.primaryKey = primaryKey;
  }

  /**
   * Execute a database query with automatic error handling
   *
   * @param query - SQL query string
   * @param params - Query parameters
   * @returns Query result
   * @throws Error with contextual message on failure
   */
  protected async query<R extends QueryResultRow = any>(query: string, params?: any[]): Promise<QueryResult<R>> {
    try {
      return await this.pool.query<R>(query, params);
    } catch (error) {
      console.error(`Database query error in ${this.tableName}:`, error);
      throw new Error(`Database operation failed for ${this.tableName}`);
    }
  }

  /**
   * Find a single record by its primary key
   *
   * @param id - The primary key value
   * @returns The record if found, null otherwise
   */
  async findById(id: number | string): Promise<T | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
    const result = await this.query(query, [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Find all records in the table
   *
   * @param orderBy - Optional ORDER BY clause (e.g., 'created_at DESC')
   * @returns Array of all records
   */
  async findAll(orderBy?: string): Promise<T[]> {
    let query = `SELECT * FROM ${this.tableName}`;
    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }
    const result = await this.query(query);
    return result.rows;
  }

  /**
   * Create a new record
   *
   * @param data - Object containing column names and values
   * @returns The created record with all database-generated fields
   */
  async create(data: Partial<T>): Promise<T> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const query = `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.query(query, values);
    return result.rows[0];
  }

  /**
   * Update an existing record by primary key
   *
   * @param id - The primary key value
   * @param data - Object containing column names and new values
   * @returns The updated record, or null if not found
   */
  async update(id: number | string, data: Partial<T>): Promise<T | null> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    const query = `
      UPDATE ${this.tableName}
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE ${this.primaryKey} = $${columns.length + 1}
      RETURNING *
    `;

    const result = await this.query(query, [...values, id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Delete a record by primary key
   *
   * @param id - The primary key value
   * @returns true if deleted, false if not found
   */
  async delete(id: number | string): Promise<boolean> {
    const query = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1 RETURNING ${this.primaryKey}`;
    const result = await this.query(query, [id]);
    return result.rows.length > 0;
  }

  /**
   * Find records by a specific column value
   *
   * @param column - The column name to filter by
   * @param value - The value to match
   * @param orderBy - Optional ORDER BY clause
   * @returns Array of matching records
   */
  async findBy(column: string, value: any, orderBy?: string): Promise<T[]> {
    let query = `SELECT * FROM ${this.tableName} WHERE ${column} = $1`;
    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }
    const result = await this.query(query, [value]);
    return result.rows;
  }

  /**
   * Count total records in the table
   *
   * @param whereClause - Optional WHERE clause (without the WHERE keyword)
   * @param params - Parameters for the WHERE clause
   * @returns Total count
   */
  async count(whereClause?: string, params?: any[]): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }
    const result = await this.query<{ count: string }>(query, params);
    return parseInt(result.rows[0].count, 10);
  }
}
