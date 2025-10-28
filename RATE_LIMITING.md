# Rate Limiting Documentation

## Overview

This API implements multi-layer rate limiting to protect against abuse, brute force attacks, data scraping, and resource exhaustion.

## Rate Limiting Strategy

### Layer 1: Global API Rate Limiting
**All `/api/*` endpoints**
- **Limit:** 100 requests per minute per IP
- **Purpose:** Prevents DDoS attacks and general API abuse
- **Response:** 429 Too Many Requests

```
HTTP/1.1 429 Too Many Requests
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: <timestamp>

{
  "success": false,
  "message": "Too many requests from this IP, please try again later."
}
```

### Layer 2: Endpoint-Specific Limits

Stricter limits apply to sensitive endpoints in addition to the global limit.

---

## Authentication Endpoints

### Login & Registration
**Endpoints:**
- `POST /api/auth/login`
- `POST /api/auth/register`

**Limit:** 5 requests per 15 minutes per IP

**Purpose:** Prevents brute force attacks on authentication

**Why this limit:**
- Legitimate users rarely need more than 5 login attempts
- Prevents password guessing attacks
- Allows genuine users who mistype passwords

---

### Password Reset
**Endpoints:**
- `POST /api/auth/request-reset`
- `POST /api/auth/reset-password`

**Limit:** 3 requests per hour per IP

**Purpose:**
- Prevents email spam from password reset abuse
- Limits token guessing attempts
- Protects email sending quota

**Why stricter:**
- Legitimate users rarely need multiple reset requests
- Each request triggers an email (cost + reputation)
- More restrictive = better protection

---

## Public Data Endpoints

### Public Leagues List
**Endpoint:** `GET /api/leagues/public`

**Limit:** 30 requests per minute per IP

**Purpose:** Prevents data scraping and excessive database queries

---

## Search Endpoints

### User Search
**Endpoint:** `GET /api/users/search`

**Limit:** 20 searches per minute per IP

**Purpose:** Prevents search abuse and excessive database queries

### Player Search
**Endpoint:** `GET /api/players`

**Limit:** 20 searches per minute per IP

**Purpose:** Prevents player data scraping

---

## Bulk Operations

### Resource-Intensive Operations
**Endpoints:**
- `POST /api/players/sync`
- `POST /api/player-stats/bulk/:season`
- `POST /api/player-projections/bulk/:season`
- `POST /api/player-projections/bulk/:season/weeks`

**Limit:** 5 requests per 5 minutes per IP

**Purpose:**
- These operations are CPU and database intensive
- Prevents server resource exhaustion
- Protects against malicious bulk data extraction

---

## Rate Limit Headers

All rate-limited endpoints return these headers:

```
RateLimit-Limit: <max requests in window>
RateLimit-Remaining: <remaining requests>
RateLimit-Reset: <unix timestamp when limit resets>
```

Example:
```
RateLimit-Limit: 100
RateLimit-Remaining: 42
RateLimit-Reset: 1706543210
```

---

## Error Responses

### 429 Too Many Requests

When rate limit is exceeded:

```json
{
  "success": false,
  "message": "Too many authentication attempts. Please try again in 15 minutes."
}
```

Messages vary by endpoint type:
- Auth: "Too many authentication attempts. Please try again in 15 minutes."
- Password Reset: "Too many password reset requests. Please try again in 1 hour."
- Public Data: "Too many requests. Please slow down."
- Search: "Too many search requests. Please slow down."
- Bulk: "Too many bulk operations. Please wait 5 minutes."

---

## Implementation Details

### Technology
- Package: `express-rate-limit` v7+
- Storage: In-memory (per server instance)
- Tracking: By IP address

### Rate Limiter Configuration

```typescript
// Global API limiter
windowMs: 1 minute
max: 100 requests

// Auth limiter
windowMs: 15 minutes
max: 5 requests

// Password reset limiter
windowMs: 1 hour
max: 3 requests

// Public data limiter
windowMs: 1 minute
max: 30 requests

// Search limiter
windowMs: 1 minute
max: 20 requests

// Bulk operation limiter
windowMs: 5 minutes
max: 5 requests
```

---

## For Developers

### Adding Rate Limits to New Endpoints

1. Import the appropriate limiter:
```typescript
import { authLimiter, publicDataLimiter, searchLimiter, bulkOperationLimiter } from '../middleware/rateLimiter';
```

2. Apply to route:
```typescript
router.post("/new-endpoint", authLimiter, yourHandler);
```

### Creating Custom Rate Limiters

Add to `src/middleware/rateLimiter.ts`:

```typescript
export const customLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 50,
  message: {
    success: false,
    message: "Custom rate limit message",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
```

---

## Testing Rate Limits

### Using curl:

```bash
# Test login rate limit (should block after 5 attempts)
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"wrong"}' \
    -i
done
```

### Check rate limit headers:
```bash
curl -i http://localhost:3000/api/leagues/public
```

Look for:
```
RateLimit-Limit: 30
RateLimit-Remaining: 29
RateLimit-Reset: 1706543210
```

---

## Production Considerations

### Scaling
- Current implementation uses in-memory storage
- For multi-server deployments, consider:
  - Redis-backed rate limiting (`rate-limit-redis`)
  - Nginx/API Gateway rate limiting
  - CloudFlare rate limiting

### Monitoring
- Monitor 429 responses in logs
- Track which endpoints hit limits most
- Adjust limits based on real usage patterns

### Whitelisting
To whitelist specific IPs (admins, monitoring):

```typescript
export const globalApiLimiter = rateLimit({
  // ...
  skip: (req) => {
    const adminIPs = ['127.0.0.1', '10.0.0.1'];
    return adminIPs.includes(req.ip);
  }
});
```

---

## Security Notes

✅ **What Rate Limiting Protects Against:**
- Brute force login attacks
- Password reset spam
- Data scraping/harvesting
- DDoS attacks
- Resource exhaustion
- API abuse

❌ **What It Doesn't Protect Against:**
- Distributed attacks from many IPs
- Application-level vulnerabilities
- SQL injection (use parameterized queries)
- XSS attacks (use input validation)

**Best Practices:**
- Rate limiting is ONE layer of security
- Always use HTTPS in production
- Keep dependencies updated
- Monitor logs for suspicious patterns
- Use strong JWT secrets
- Implement proper authentication

---

## Questions?

For rate limit adjustments or issues, check:
- `src/middleware/rateLimiter.ts` - Rate limiter definitions
- `src/routes/*.ts` - Endpoint-specific limits
- `src/index.ts` - Global API rate limiting

**Need to adjust limits?** Edit the values in `rateLimiter.ts` and restart the server.
