# Pagination Quick Reference

## Basic Usage

```typescript
import { parsePaginationParams, createPaginatedResponse } from "../utils/pagination";

// In controller
const { page, limit, offset } = parsePaginationParams(req, 20, 100);

const [items, total] = await Promise.all([
  getItems(limit, offset),
  getItemsCount()
]);

const response = createPaginatedResponse(items, total, page, limit);
res.status(200).json(response);
```

## Endpoints

| Endpoint | Default | Max | Order |
|----------|---------|-----|-------|
| `GET /api/leagues/:id/transactions` | 20 | 100 | Recent first |
| `GET /api/matchups/league/:id` | 20 | 100 | Recent first |
| `GET /api/players` | 20 | 100 | By rank |

## Query Parameters

| Parameter | Type | Default | Example |
|-----------|------|---------|---------|
| `page` | number | 1 | `?page=2` |
| `limit` | number | 20 | `?limit=50` |

## Response Format

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "totalPages": 8,
    "hasMore": true,
    "hasPrevious": false
  }
}
```

## Common Patterns

### Model Layer
```typescript
// Add limit and offset parameters
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
  return (await pool.query(query, [someFilter, limit, offset])).rows;
}

// Add count function
export async function getItemsCount(someFilter: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM items WHERE filter = $1`,
    [someFilter]
  );
  return parseInt(result.rows[0].count, 10);
}
```

### Controller Layer
```typescript
const { page, limit, offset } = parsePaginationParams(req, 20, 100);

const [items, total] = await Promise.all([
  getItems(someFilter, limit, offset),
  getItemsCount(someFilter)
]);

const response = createPaginatedResponse(items, total, page, limit);
res.status(200).json(response);
```

## Testing

```bash
# Default (page 1, limit 20)
curl "http://localhost:3000/api/leagues/1/transactions"

# Custom pagination
curl "http://localhost:3000/api/leagues/1/transactions?page=2&limit=50"

# With filters
curl "http://localhost:3000/api/players?page=1&limit=25&position=QB"
```

## Performance Tips

1. **Always fetch in parallel:**
   ```typescript
   const [items, total] = await Promise.all([...]);
   ```

2. **Use database indexes:**
   ```sql
   CREATE INDEX idx_table_order_column ON table(order_column DESC);
   ```

3. **Keep count queries simple:**
   ```typescript
   // Good - Simple count
   SELECT COUNT(*) FROM items WHERE league_id = $1

   // Avoid - Complex count with unnecessary JOINs
   SELECT COUNT(*) FROM items
   JOIN other_table ON ...
   WHERE league_id = $1
   ```

## Full Documentation

- **Complete Guide:** `docs/PAGINATION.md`
- **Examples:** `docs/examples/pagination-example.ts`
- **Summary:** `docs/PAGINATION_SUMMARY.md`
