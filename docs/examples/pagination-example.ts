/**
 * Pagination Implementation Examples
 *
 * This file demonstrates how to use the pagination utilities
 * in different scenarios.
 */

import { Request, Response } from "express";
import {
  parsePaginationParams,
  createPaginatedResponse,
  parseCursorParams,
  createCursorPaginatedResponse,
  encodeCursor,
  decodeCursor
} from "../utils/pagination";

/**
 * EXAMPLE 1: Basic Offset-Based Pagination
 * Most common use case for typical list endpoints
 */
export async function basicPaginationExample(req: Request, res: Response) {
  // Parse pagination parameters from query string
  // Defaults: page=1, limit=20, max=100
  const { page, limit, offset } = parsePaginationParams(req, 20, 100);

  // Example: ?page=2&limit=25
  // Results: { page: 2, limit: 25, offset: 25 }

  // Fetch your data using limit and offset
  const items = await fetchItemsFromDatabase(offset, limit);
  const total = await getTotalItemCount();

  // Create standardized response
  const response = createPaginatedResponse(items, total, page, limit);

  res.status(200).json(response);
  // Response format:
  // {
  //   success: true,
  //   data: [...],
  //   pagination: {
  //     page: 2,
  //     limit: 25,
  //     total: 156,
  //     totalPages: 7,
  //     hasMore: true,
  //     hasPrevious: true
  //   }
  // }
}

/**
 * EXAMPLE 2: Pagination with Filters
 * Combining pagination with search/filter parameters
 */
export async function paginationWithFiltersExample(req: Request, res: Response) {
  // Extract filter parameters
  const { position, team, search } = req.query;

  // Parse pagination
  const { page, limit, offset } = parsePaginationParams(req, 20, 100);

  // Build filters object
  const filters = {
    position: position as string,
    team: team as string,
    search: search as string,
  };

  // Fetch data and count with same filters (in parallel)
  const [items, total] = await Promise.all([
    fetchFilteredItems(filters, limit, offset),
    getFilteredItemsCount(filters)
  ]);

  const response = createPaginatedResponse(items, total, page, limit);
  res.status(200).json(response);
}

/**
 * EXAMPLE 3: Custom Default Limits
 * Different endpoints may need different defaults
 */
export async function customLimitsExample(req: Request, res: Response) {
  // Large dataset endpoint - use smaller default (10), allow up to 50
  const { page, limit, offset } = parsePaginationParams(req, 10, 50);

  const items = await fetchLargeDataset(offset, limit);
  const total = await getTotalCount();

  const response = createPaginatedResponse(items, total, page, limit);
  res.status(200).json(response);
}

/**
 * EXAMPLE 4: Cursor-Based Pagination
 * Better for real-time feeds or infinite scroll
 */
export async function cursorPaginationExample(req: Request, res: Response) {
  // Parse cursor parameters
  const { limit, cursor } = parseCursorParams(req, 20, 100);

  let startingId: number | null = null;
  if (cursor) {
    // Decode cursor to get starting ID
    const decodedCursor = decodeCursor(cursor);
    startingId = parseInt(decodedCursor, 10);
  }

  // Fetch items after cursor (or from start if no cursor)
  const items = await fetchItemsAfterCursor(startingId, limit + 1); // Fetch one extra

  // Check if there are more items
  const hasMore = items.length > limit;
  if (hasMore) {
    items.pop(); // Remove the extra item
  }

  // Generate next cursor from last item
  const nextCursor = hasMore && items.length > 0
    ? encodeCursor(items[items.length - 1].id)
    : null;

  const response = createCursorPaginatedResponse(items, limit, nextCursor, cursor);
  res.status(200).json(response);
  // Response format:
  // {
  //   success: true,
  //   data: [...],
  //   pagination: {
  //     limit: 20,
  //     nextCursor: "MTIzNDU=",
  //     previousCursor: "MTAwMDA=",
  //     hasMore: true,
  //     hasPrevious: true
  //   }
  // }
}

/**
 * EXAMPLE 5: Handling Empty Results
 * Proper response when page is beyond available data
 */
export async function emptyResultsExample(req: Request, res: Response) {
  const { page, limit, offset } = parsePaginationParams(req);

  const [items, total] = await Promise.all([
    fetchItems(offset, limit),
    getTotalCount()
  ]);

  // Even if items is empty, return proper pagination metadata
  const response = createPaginatedResponse(items, total, page, limit);
  res.status(200).json(response);
  // If page=100 but only 3 pages exist:
  // {
  //   success: true,
  //   data: [],
  //   pagination: {
  //     page: 100,
  //     limit: 20,
  //     total: 60,
  //     totalPages: 3,
  //     hasMore: false,
  //     hasPrevious: true
  //   }
  // }
}

/**
 * EXAMPLE 6: SQL Query with Pagination
 * Using pagination in raw SQL queries
 */
export async function sqlPaginationExample(req: Request, res: Response) {
  const { page, limit, offset } = parsePaginationParams(req, 20, 100);

  // Data query with LIMIT and OFFSET
  const dataQuery = `
    SELECT *
    FROM items
    WHERE active = true
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `;

  // Count query (same WHERE clause)
  const countQuery = `
    SELECT COUNT(*) as count
    FROM items
    WHERE active = true
  `;

  // Execute in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [limit, offset]),
    pool.query(countQuery)
  ]);

  const items = dataResult.rows;
  const total = parseInt(countResult.rows[0].count, 10);

  const response = createPaginatedResponse(items, total, page, limit);
  res.status(200).json(response);
}

/**
 * EXAMPLE 7: Paginating Nested/Complex Queries
 * Handling JOINs and complex data structures
 */
export async function complexQueryPaginationExample(req: Request, res: Response) {
  const leagueId = parseInt(req.params.leagueId, 10);
  const { page, limit, offset } = parsePaginationParams(req, 20, 100);

  // Complex query with JOINs
  const dataQuery = `
    SELECT
      t.*,
      r.roster_id,
      r.settings->>'team_name' as team_name,
      u.username
    FROM transactions t
    JOIN rosters r ON t.roster_id = r.id
    JOIN users u ON r.user_id = u.id
    WHERE t.league_id = $1
    ORDER BY t.processed_at DESC
    LIMIT $2 OFFSET $3
  `;

  // Simpler count query (don't need JOINs for count)
  const countQuery = `
    SELECT COUNT(*) as count
    FROM transactions
    WHERE league_id = $1
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [leagueId, limit, offset]),
    pool.query(countQuery, [leagueId])
  ]);

  const transactions = dataResult.rows;
  const total = parseInt(countResult.rows[0].count, 10);

  const response = createPaginatedResponse(transactions, total, page, limit);
  res.status(200).json(response);
}

/**
 * EXAMPLE 8: Caching Paginated Results
 * Improve performance by caching frequently accessed pages
 */
export async function cachedPaginationExample(req: Request, res: Response) {
  const { page, limit, offset } = parsePaginationParams(req, 20, 100);

  // Create cache key based on pagination params
  const cacheKey = `items_page_${page}_limit_${limit}`;

  // Try to get from cache
  let response = await cache.get(cacheKey);

  if (!response) {
    // Cache miss - fetch from database
    const [items, total] = await Promise.all([
      fetchItems(offset, limit),
      getTotalCount()
    ]);

    response = createPaginatedResponse(items, total, page, limit);

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);
  }

  res.status(200).json(response);
}

// Mock functions (replace with actual implementations)
async function fetchItemsFromDatabase(offset: number, limit: number): Promise<any[]> {
  return [];
}

async function getTotalItemCount(): Promise<number> {
  return 0;
}

async function fetchFilteredItems(filters: any, limit: number, offset: number): Promise<any[]> {
  return [];
}

async function getFilteredItemsCount(filters: any): Promise<number> {
  return 0;
}

async function fetchLargeDataset(offset: number, limit: number): Promise<any[]> {
  return [];
}

async function getTotalCount(): Promise<number> {
  return 0;
}

async function fetchItemsAfterCursor(cursorId: number | null, limit: number): Promise<any[]> {
  return [];
}

async function fetchItems(offset: number, limit: number): Promise<any[]> {
  return [];
}

// Mock pool and cache
const pool = {
  query: async (query: string, params?: any[]) => ({ rows: [] })
};

const cache = {
  get: async (key: string) => null,
  set: async (key: string, value: any, ttl: number) => {}
};
