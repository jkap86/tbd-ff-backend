/**
 * Pagination Utility
 *
 * Provides reusable pagination helpers for large dataset endpoints
 * Supports both offset-based and cursor-based pagination
 */

import { Request } from "express";

/**
 * Pagination metadata returned in API responses
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  hasPrevious: boolean;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Cursor-based pagination metadata
 */
export interface CursorPaginationMeta {
  limit: number;
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
  hasPrevious: boolean;
}

/**
 * Cursor-based paginated response
 */
export interface CursorPaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: CursorPaginationMeta;
}

/**
 * Pagination options parsed from query parameters
 */
export interface PaginationOptions {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Cursor pagination options
 */
export interface CursorPaginationOptions {
  limit: number;
  cursor: string | null;
}

/**
 * Default pagination settings
 */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/**
 * Parse and validate pagination parameters from request query
 *
 * @param req Express request object
 * @param defaultLimit Default limit if not specified (default: 20)
 * @param maxLimit Maximum allowed limit (default: 100)
 * @returns Validated pagination options
 *
 * @example
 * const { page, limit, offset } = parsePaginationParams(req);
 * const results = await getItems(offset, limit);
 * const total = await getItemsCount();
 * return createPaginatedResponse(results, total, page, limit);
 */
export function parsePaginationParams(
  req: Request,
  defaultLimit: number = DEFAULT_LIMIT,
  maxLimit: number = MAX_LIMIT
): PaginationOptions {
  // Parse page number (1-indexed)
  let page = parseInt(req.query.page as string, 10);
  if (isNaN(page) || page < 1) {
    page = DEFAULT_PAGE;
  }

  // Parse limit
  let limit = parseInt(req.query.limit as string, 10);
  if (isNaN(limit) || limit < MIN_LIMIT) {
    limit = defaultLimit;
  }
  if (limit > maxLimit) {
    limit = maxLimit;
  }

  // Calculate offset (0-indexed)
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Parse cursor-based pagination parameters
 *
 * @param req Express request object
 * @param defaultLimit Default limit if not specified
 * @param maxLimit Maximum allowed limit
 * @returns Cursor pagination options
 */
export function parseCursorParams(
  req: Request,
  defaultLimit: number = DEFAULT_LIMIT,
  maxLimit: number = MAX_LIMIT
): CursorPaginationOptions {
  // Parse limit
  let limit = parseInt(req.query.limit as string, 10);
  if (isNaN(limit) || limit < MIN_LIMIT) {
    limit = defaultLimit;
  }
  if (limit > maxLimit) {
    limit = maxLimit;
  }

  // Parse cursor (optional)
  const cursor = (req.query.cursor as string) || null;

  return { limit, cursor };
}

/**
 * Create a standardized paginated response
 *
 * @param data Array of data items
 * @param total Total count of items (across all pages)
 * @param page Current page number
 * @param limit Items per page
 * @returns Paginated response object
 *
 * @example
 * const users = await getUsersPaginated(offset, limit);
 * const totalUsers = await getTotalUsersCount();
 * return createPaginatedResponse(users, totalUsers, page, limit);
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit);
  const hasMore = page < totalPages;
  const hasPrevious = page > 1;

  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore,
      hasPrevious,
    },
  };
}

/**
 * Create a cursor-based paginated response
 *
 * @param data Array of data items
 * @param limit Items per page
 * @param nextCursor Cursor for next page (null if no more pages)
 * @param previousCursor Cursor for previous page (null if first page)
 * @returns Cursor-based paginated response
 */
export function createCursorPaginatedResponse<T>(
  data: T[],
  limit: number,
  nextCursor: string | null,
  previousCursor: string | null = null
): CursorPaginatedResponse<T> {
  return {
    success: true,
    data,
    pagination: {
      limit,
      nextCursor,
      previousCursor,
      hasMore: nextCursor !== null,
      hasPrevious: previousCursor !== null,
    },
  };
}

/**
 * Calculate pagination metadata without fetching data
 * Useful for streaming or when data is already fetched
 *
 * @param total Total count of items
 * @param page Current page number
 * @param limit Items per page
 * @returns Pagination metadata
 */
export function calculatePaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  const hasMore = page < totalPages;
  const hasPrevious = page > 1;

  return {
    page,
    limit,
    total,
    totalPages,
    hasMore,
    hasPrevious,
  };
}

/**
 * Generate SQL LIMIT/OFFSET clause for pagination
 *
 * @param offset Starting offset
 * @param limit Number of items to fetch
 * @returns SQL string and parameter values
 *
 * @example
 * const { page, limit, offset } = parsePaginationParams(req);
 * const { sql, params } = getPaginationSQL(offset, limit, 1);
 * const query = `SELECT * FROM users WHERE active = $1 ${sql}`;
 * const result = await pool.query(query, [...params, true]);
 */
export function getPaginationSQL(
  offset: number,
  limit: number,
  startParamIndex: number = 1
): { sql: string; params: number[] } {
  const sql = `LIMIT $${startParamIndex} OFFSET $${startParamIndex + 1}`;
  const params = [limit, offset];
  return { sql, params };
}

/**
 * Encode a cursor value (typically an ID or timestamp)
 *
 * @param value Value to encode as cursor
 * @returns Base64-encoded cursor string
 */
export function encodeCursor(value: string | number): string {
  return Buffer.from(String(value)).toString("base64");
}

/**
 * Decode a cursor value
 *
 * @param cursor Base64-encoded cursor string
 * @returns Decoded cursor value
 */
export function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, "base64").toString("utf-8");
  } catch (error) {
    throw new Error("Invalid cursor format");
  }
}

/**
 * Validate pagination parameters and throw if invalid
 *
 * @param page Page number
 * @param limit Items per page
 * @throws Error if parameters are invalid
 */
export function validatePaginationParams(page: number, limit: number): void {
  if (page < 1) {
    throw new Error("Page must be greater than or equal to 1");
  }
  if (limit < MIN_LIMIT) {
    throw new Error(`Limit must be at least ${MIN_LIMIT}`);
  }
  if (limit > MAX_LIMIT) {
    throw new Error(`Limit cannot exceed ${MAX_LIMIT}`);
  }
}

/**
 * Create a pagination-aware SQL query with COUNT
 * Returns both data and total count in a single database round-trip
 *
 * @param baseQuery Base SELECT query (without LIMIT/OFFSET)
 * @param offset Starting offset
 * @param limit Number of items
 * @returns Object with data query and count query
 *
 * @example
 * const queries = createPaginatedQuery(
 *   'SELECT * FROM users WHERE active = true',
 *   offset,
 *   limit
 * );
 * const [dataResult, countResult] = await Promise.all([
 *   pool.query(queries.dataQuery),
 *   pool.query(queries.countQuery)
 * ]);
 */
export function createPaginatedQuery(
  baseQuery: string,
  offset: number,
  limit: number
): { dataQuery: string; countQuery: string } {
  const dataQuery = `${baseQuery} LIMIT ${limit} OFFSET ${offset}`;
  const countQuery = baseQuery.replace(/SELECT .+ FROM/, "SELECT COUNT(*) FROM");

  return { dataQuery, countQuery };
}
