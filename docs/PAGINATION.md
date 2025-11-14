# Pagination Implementation Guide

## Overview

This document describes the pagination implementation for large dataset endpoints in the TBD Fantasy Football backend. Pagination improves performance and user experience by returning manageable chunks of data instead of potentially thousands of records.

## Architecture

### Core Components

1. **Pagination Utility** (`src/utils/pagination.ts`)
   - Reusable helper functions for parsing, validating, and formatting pagination
   - Supports both offset-based and cursor-based pagination
   - Provides standardized response format

2. **Model Layer Updates**
   - `Transaction.ts` - Added pagination support for transaction history
   - `Matchup.ts` - Added pagination support for matchup history
   - `Player.ts` - Added pagination support for player listings

3. **Controller Layer Updates**
   - `waiverController.ts` - Transaction history endpoint
   - `matchupController.ts` - Matchup history endpoint
   - `playerController.ts` - Player listing endpoint

## Standardized Response Format

All paginated endpoints return responses in this format:

```typescript
{
  success: true,
  data: [...],  // Array of items for current page
  pagination: {
    page: 1,           // Current page number (1-indexed)
    limit: 20,         // Items per page
    total: 156,        // Total number of items across all pages
    totalPages: 8,     // Total number of pages
    hasMore: true,     // Whether there are more pages
    hasPrevious: false // Whether there are previous pages
  }
}
```

## Using Pagination in Controllers

### Basic Example

```typescript
import { parsePaginationParams, createPaginatedResponse } from "../utils/pagination";

// In your controller handler:
const { page, limit, offset } = parsePaginationParams(req, 20, 100);

// Fetch data and total count in parallel
const [items, total] = await Promise.all([
  getItems(limit, offset),
  getItemsCount()
]);

// Return standardized paginated response
const response = createPaginatedResponse(items, total, page, limit);
res.status(200).json(response);
```

### Parameters

- `parsePaginationParams(req, defaultLimit, maxLimit)`
  - `defaultLimit` - Default items per page (commonly 20)
  - `maxLimit` - Maximum allowed items per page (commonly 100)
  - Returns: `{ page, limit, offset }`

### Query Parameters

Clients can control pagination using these query parameters:

- `?page=2` - Get page 2 (default: 1)
- `?limit=50` - Get 50 items per page (default: 20, max: 100)

## Implemented Endpoints

### 1. Transaction History

**Endpoint:** `GET /api/leagues/:leagueId/transactions`

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)

**Example Request:**
```bash
GET /api/leagues/123/transactions?page=2&limit=25
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 45,
      "league_id": 123,
      "roster_id": 5,
      "transaction_type": "waiver",
      "status": "processed",
      "adds": [101, 102],
      "drops": [103],
      "waiver_bid": 15,
      "processed_at": "2024-01-15T10:30:00Z",
      "username": "user123",
      "adds_details": [...],
      "drops_details": [...]
    }
    // ... more transactions
  ],
  "pagination": {
    "page": 2,
    "limit": 25,
    "total": 156,
    "totalPages": 7,
    "hasMore": true,
    "hasPrevious": true
  }
}
```

### 2. Matchup History

**Endpoint:** `GET /api/matchups/league/:leagueId`

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)

**Example Request:**
```bash
GET /api/matchups/league/123?page=1&limit=20
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 789,
      "league_id": 123,
      "week": 14,
      "season": "2024",
      "roster1_id": 5,
      "roster2_id": 8,
      "roster1_score": 125.5,
      "roster2_score": 118.2,
      "status": "completed",
      "roster1_team_name": "Team Alpha",
      "roster1_username": "user1",
      "roster2_team_name": "Team Beta",
      "roster2_username": "user2"
    }
    // ... more matchups
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 84,
    "totalPages": 5,
    "hasMore": true,
    "hasPrevious": false
  }
}
```

### 3. Player Listings

**Endpoint:** `GET /api/players`

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `position` - Filter by position (optional)
- `team` - Filter by team (optional)
- `search` - Search by player name (optional)

**Example Request:**
```bash
GET /api/players?page=1&limit=50&position=QB&team=KC&search=mahomes
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 456,
      "player_id": "slpr_12345",
      "full_name": "Patrick Mahomes",
      "position": "QB",
      "team": "KC",
      "age": 28,
      "years_exp": 7,
      "search_rank": 5
    }
    // ... more players
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "totalPages": 1,
    "hasMore": false,
    "hasPrevious": false
  }
}
```

## Adding Pagination to New Endpoints

### Step 1: Update Model Layer

Add pagination parameters to your model function:

```typescript
// Before
export async function getItems(someFilter: string): Promise<Item[]> {
  const query = `
    SELECT * FROM items
    WHERE filter = $1
    ORDER BY created_at DESC
  `;
  const result = await pool.query(query, [someFilter]);
  return result.rows;
}

// After
export async function getItems(
  someFilter: string,
  limit: number = 50,
  offset: number = 0
): Promise<Item[]> {
  const query = `
    SELECT * FROM items
    WHERE filter = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await pool.query(query, [someFilter, limit, offset]);
  return result.rows;
}
```

Add a count function:

```typescript
export async function getItemsCount(someFilter: string): Promise<number> {
  const query = `
    SELECT COUNT(*) as count
    FROM items
    WHERE filter = $1
  `;
  const result = await pool.query(query, [someFilter]);
  return parseInt(result.rows[0].count, 10);
}
```

### Step 2: Update Controller

```typescript
import { parsePaginationParams, createPaginatedResponse } from "../utils/pagination";

getItemsHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const someFilter = req.params.filter;

  // Parse pagination parameters
  const { page, limit, offset } = parsePaginationParams(req, 20, 100);

  // Fetch data and count in parallel
  const [items, total] = await Promise.all([
    getItems(someFilter, limit, offset),
    getItemsCount(someFilter)
  ]);

  // Return paginated response
  const response = createPaginatedResponse(items, total, page, limit);
  res.status(200).json(response);
});
```

### Step 3: Document the Endpoint

Update API documentation with pagination parameters and example responses.

## Advanced: Cursor-Based Pagination

For high-performance scenarios or infinite scroll, cursor-based pagination is available:

```typescript
import { parseCursorParams, createCursorPaginatedResponse, encodeCursor } from "../utils/pagination";

// In controller
const { limit, cursor } = parseCursorParams(req, 20, 100);

// Fetch items after cursor
const items = await getItemsAfterCursor(cursor, limit);

// Determine next cursor (e.g., last item's ID)
const nextCursor = items.length === limit
  ? encodeCursor(items[items.length - 1].id)
  : null;

const response = createCursorPaginatedResponse(items, limit, nextCursor, cursor);
res.status(200).json(response);
```

**Cursor Response Format:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "limit": 20,
    "nextCursor": "ZW5jb2RlZF9jdXJzb3I=",
    "previousCursor": null,
    "hasMore": true,
    "hasPrevious": false
  }
}
```

## Performance Considerations

### Database Indexing

Ensure proper indexes exist for pagination queries:

```sql
-- For transaction history (ordered by processed_at DESC)
CREATE INDEX idx_transactions_league_processed
  ON transactions(league_id, processed_at DESC);

-- For matchup history (ordered by week DESC)
CREATE INDEX idx_matchups_league_week
  ON matchups(league_id, week DESC);

-- For player search (ordered by search_rank)
CREATE INDEX idx_players_search_rank
  ON players(search_rank NULLS LAST);
```

### Parallel Queries

Always fetch data and count in parallel using `Promise.all()`:

```typescript
// Good - Parallel execution
const [items, total] = await Promise.all([
  getItems(limit, offset),
  getItemsCount()
]);

// Bad - Sequential execution (slower)
const items = await getItems(limit, offset);
const total = await getItemsCount();
```

### Caching Counts

For very large tables where counts are expensive, consider caching:

```typescript
const cacheKey = `items_count_${filter}`;
let total = await cache.get(cacheKey);

if (!total) {
  total = await getItemsCount(filter);
  await cache.set(cacheKey, total, 300); // 5 minute TTL
}
```

## Default Limits

- **Default page:** 1
- **Default limit:** 20 items per page
- **Maximum limit:** 100 items per page
- **Minimum limit:** 1 item per page

These can be customized per endpoint by passing different values to `parsePaginationParams()`.

## Testing Pagination

### Example cURL Commands

```bash
# Get first page (default)
curl "http://localhost:3000/api/leagues/123/transactions"

# Get second page with 50 items
curl "http://localhost:3000/api/leagues/123/transactions?page=2&limit=50"

# Test max limit enforcement (should cap at 100)
curl "http://localhost:3000/api/players?limit=1000"

# Test invalid page (should default to page 1)
curl "http://localhost:3000/api/players?page=-1"
```

### Unit Test Example

```typescript
describe('Pagination', () => {
  it('should return paginated transactions', async () => {
    const response = await request(app)
      .get('/api/leagues/123/transactions?page=2&limit=10')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(10);
    expect(response.body.pagination).toMatchObject({
      page: 2,
      limit: 10,
      hasMore: expect.any(Boolean),
      hasPrevious: true
    });
  });
});
```

## Migration Checklist

When migrating an existing endpoint to use pagination:

- [ ] Update model function to accept `limit` and `offset` parameters
- [ ] Add count function to model
- [ ] Import pagination utilities in controller
- [ ] Update controller to use `parsePaginationParams()` and `createPaginatedResponse()`
- [ ] Verify database indexes exist for ORDER BY columns
- [ ] Update API documentation
- [ ] Test with various page/limit combinations
- [ ] Update frontend to handle paginated responses
- [ ] Check backward compatibility (optional query params should not break existing clients)

## Frontend Integration

### React Example

```typescript
const [transactions, setTransactions] = useState([]);
const [pagination, setPagination] = useState(null);

const fetchTransactions = async (page = 1, limit = 20) => {
  const response = await fetch(
    `/api/leagues/${leagueId}/transactions?page=${page}&limit=${limit}`
  );
  const data = await response.json();

  setTransactions(data.data);
  setPagination(data.pagination);
};

// Pagination controls
<button
  disabled={!pagination?.hasPrevious}
  onClick={() => fetchTransactions(pagination.page - 1)}
>
  Previous
</button>
<span>Page {pagination?.page} of {pagination?.totalPages}</span>
<button
  disabled={!pagination?.hasMore}
  onClick={() => fetchTransactions(pagination.page + 1)}
>
  Next
</button>
```

## Troubleshooting

### Common Issues

**Issue:** Count query is slow
- **Solution:** Add index on filter columns, consider caching counts

**Issue:** Page parameter not working
- **Solution:** Ensure query param is spelled correctly (`?page=2` not `?p=2`)

**Issue:** Getting empty results on valid page
- **Solution:** Check if offset calculation is correct, verify data exists

**Issue:** Total count doesn't match expectations
- **Solution:** Ensure count query has same WHERE clause as data query

## Best Practices

1. **Always validate pagination parameters** - Use `parsePaginationParams()` to enforce limits
2. **Fetch count and data in parallel** - Use `Promise.all()` for performance
3. **Index pagination columns** - Ensure ORDER BY columns are indexed
4. **Use consistent defaults** - Typically page=1, limit=20 across all endpoints
5. **Return empty array, not error** - If page exceeds total pages, return `{ data: [], pagination: {...} }`
6. **Document query parameters** - Make it clear what pagination options are available
7. **Consider infinite scroll** - For mobile/infinite scroll UIs, use cursor-based pagination

## Future Enhancements

Potential improvements for future iterations:

- [ ] Add `sort` and `order` query parameters for flexible sorting
- [ ] Implement GraphQL-style cursor connections
- [ ] Add support for `offset` query parameter (in addition to `page`)
- [ ] Create pagination middleware for automatic application
- [ ] Add response caching for frequently accessed pages
- [ ] Implement cursor-based pagination for real-time data streams

## References

- Pagination utility: `src/utils/pagination.ts`
- Transaction model: `src/models/Transaction.ts`
- Matchup model: `src/models/Matchup.ts`
- Player model: `src/models/Player.ts`
- System truths: `docs/TRUTHS.md` (Section 6: Performance Constraints)
