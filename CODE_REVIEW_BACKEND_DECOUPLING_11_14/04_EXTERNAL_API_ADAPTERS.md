# Task 04: External API Adapters
## Priority: MEDIUM | Effort: 3 days | Impact: MEDIUM

## Problem Statement
External API calls are scattered across multiple services without abstraction:
- Sleeper API calls in 5+ service files
- Direct axios usage without error handling patterns
- No caching layer for API responses
- No circuit breaker for API failures
- Hard to mock for testing

## Solution Architecture
Create adapter pattern for all external APIs with consistent error handling, caching, and retry logic.

## Detailed Subtasks

### 1. Create External API Interface (30 min)
- [ ] Create `src/adapters/interfaces/IExternalAPI.ts`
- [ ] Define standard response types
- [ ] Define error types
- [ ] Add retry configuration

**Create interface:**
```typescript
// src/adapters/interfaces/IExternalAPI.ts
export interface IAPIResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  cached: boolean;
}

export interface IAPIError {
  code: string;
  message: string;
  status?: number;
  retryable: boolean;
}

export interface IRetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryOn: number[];
  exponentialBackoff: boolean;
}

export interface IExternalAPI {
  get<T>(path: string, params?: any): Promise<IAPIResponse<T>>;
  post<T>(path: string, data?: any): Promise<IAPIResponse<T>>;
  put<T>(path: string, data?: any): Promise<IAPIResponse<T>>;
  delete<T>(path: string): Promise<IAPIResponse<T>>;
}
```

### 2. Create Sleeper API Adapter (2 hours)
- [ ] Create `src/adapters/SleeperAPIAdapter.ts`
- [ ] Implement all Sleeper endpoints
- [ ] Add response caching
- [ ] Add error handling
- [ ] Add rate limiting

**Implementation:**
```typescript
// src/adapters/SleeperAPIAdapter.ts
export class SleeperAPIAdapter implements IStatsProvider, IScheduleProvider {
  private baseURL = 'https://api.sleeper.app/v1';
  private cache: Map<string, { data: any; expires: number }> = new Map();

  constructor(
    private httpClient: AxiosInstance,
    private cacheService?: ICacheService,
    private logger?: Logger
  ) {
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request logging
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger?.debug(`Sleeper API Request: ${config.url}`);
        return config;
      }
    );

    // Response caching
    this.httpClient.interceptors.response.use(
      async (response) => {
        await this.cacheResponse(response);
        return response;
      },
      async (error) => {
        return this.handleError(error);
      }
    );
  }

  async getPlayerStats(season: string, week: number): Promise<PlayerStats[]> {
    const cacheKey = `sleeper:stats:${season}:${week}`;

    // Check cache first
    const cached = await this.cacheService?.get(cacheKey);
    if (cached) {
      this.logger?.debug(`Cache hit for ${cacheKey}`);
      return cached;
    }

    // Make API call
    const response = await this.httpClient.get(
      `${this.baseURL}/stats/nfl/${season}/${week}`
    );

    // Cache for 1 hour
    await this.cacheService?.set(cacheKey, response.data, 3600);

    return this.mapStatsResponse(response.data);
  }

  async getPlayers(): Promise<Player[]> {
    const cacheKey = 'sleeper:players';

    const cached = await this.cacheService?.get(cacheKey);
    if (cached) return cached;

    const response = await this.httpClient.get(
      `${this.baseURL}/players/nfl`
    );

    // Cache for 24 hours
    await this.cacheService?.set(cacheKey, response.data, 86400);

    return this.mapPlayersResponse(response.data);
  }

  private mapStatsResponse(data: any): PlayerStats[] {
    // Map Sleeper format to internal format
    return Object.entries(data).map(([playerId, stats]: [string, any]) => ({
      player_id: playerId,
      ...stats
    }));
  }

  private async handleError(error: AxiosError): Promise<never> {
    if (error.response?.status === 429) {
      // Rate limited - implement exponential backoff
      throw new APIError('RATE_LIMITED', 'Sleeper API rate limit exceeded', true);
    }

    if (error.response?.status >= 500) {
      // Server error - retryable
      throw new APIError('SERVER_ERROR', 'Sleeper API server error', true);
    }

    throw new APIError('API_ERROR', error.message, false);
  }
}
```

### 3. Create Email Service Adapter (1 hour)
- [ ] Create `src/adapters/EmailAdapter.ts`
- [ ] Abstract email provider
- [ ] Add template support
- [ ] Add queue support
- [ ] Add retry logic

### 4. Create Push Notification Adapter (1 hour)
- [ ] Create `src/adapters/PushNotificationAdapter.ts`
- [ ] Abstract Firebase implementation
- [ ] Add batch sending
- [ ] Add failure tracking
- [ ] Add delivery reports

### 5. Create HTTP Client Factory (1 hour)
- [ ] Create `src/adapters/HttpClientFactory.ts`
- [ ] Configure axios instances
- [ ] Add interceptors
- [ ] Add timeout handling
- [ ] Add retry logic

**Implementation:**
```typescript
// src/adapters/HttpClientFactory.ts
export class HttpClientFactory {
  static createClient(config: {
    baseURL: string;
    timeout?: number;
    retryConfig?: IRetryConfig;
    rateLimitConfig?: IRateLimitConfig;
  }): AxiosInstance {
    const client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000
    });

    // Add retry interceptor
    if (config.retryConfig) {
      axiosRetry(client, {
        retries: config.retryConfig.maxRetries,
        retryDelay: axiosRetry.exponentialDelay,
        retryCondition: (error) => {
          return config.retryConfig.retryOn.includes(error.response?.status || 0);
        }
      });
    }

    // Add rate limiting
    if (config.rateLimitConfig) {
      client.interceptors.request.use(
        RateLimiter.createInterceptor(config.rateLimitConfig)
      );
    }

    return client;
  }
}
```

### 6. Create Circuit Breaker (1 hour)
- [ ] Create `src/adapters/CircuitBreaker.ts`
- [ ] Implement circuit states (closed/open/half-open)
- [ ] Add failure threshold
- [ ] Add recovery timeout
- [ ] Add metrics collection

### 7. Update Services to Use Adapters (2 hours)

#### 7a. Update Stats Services
- [ ] `sleeperStatsService.ts`
- [ ] `sleeperProjectionsService.ts`
- [ ] `sleeperScheduleService.ts`
- [ ] `statsPreloader.ts`
- [ ] `statsSync.ts`

**Before:**
```typescript
// sleeperStatsService.ts
const response = await axios.get(
  `${SLEEPER_API_BASE}/stats/nfl/${season}/${week}`,
  { timeout: API_TIMEOUT }
);
```

**After:**
```typescript
export class SleeperStatsService {
  constructor(
    private sleeperAPI: IStatsProvider,
    private logger: Logger
  ) {}

  async syncPlayerStats(season: string, week: number): Promise<void> {
    try {
      const stats = await this.sleeperAPI.getPlayerStats(season, week);
      // Process stats...
    } catch (error) {
      if (error.retryable) {
        // Schedule retry
      }
      this.logger.error('Failed to sync stats', error);
    }
  }
}
```

### 8. Create Mock Adapters for Testing (1 hour)
- [ ] Create `src/adapters/mocks/MockSleeperAPI.ts`
- [ ] Create `src/adapters/mocks/MockEmailAdapter.ts`
- [ ] Create `src/adapters/mocks/MockPushAdapter.ts`
- [ ] Add test data fixtures

### 9. Add Monitoring and Metrics (1 hour)
- [ ] Track API call counts
- [ ] Track response times
- [ ] Track error rates
- [ ] Track cache hit rates
- [ ] Create health check endpoints

### 10. Documentation (30 min)
- [ ] Document adapter patterns
- [ ] Document configuration options
- [ ] Document testing approach
- [ ] Add troubleshooting guide

## Migration Checklist

### Services to Update
- [ ] sleeperStatsService.ts
- [ ] sleeperProjectionsService.ts
- [ ] sleeperScheduleService.ts
- [ ] statsPreloader.ts
- [ ] statsSync.ts
- [ ] projectionsSync.ts
- [ ] emailService.ts
- [ ] pushNotificationService.ts
- [ ] notificationHelpers.ts

### External APIs to Abstract
- [ ] Sleeper API (stats, projections, schedule)
- [ ] Email (SMTP/SendGrid)
- [ ] Push Notifications (Firebase)
- [ ] Future: Payment APIs
- [ ] Future: Social media APIs

## Testing Strategy
1. **Unit Tests**: Mock adapters for all tests
2. **Integration Tests**: Test with real APIs in staging
3. **Contract Tests**: Verify API response formats
4. **Performance Tests**: Measure caching impact

## Success Criteria
- [ ] All external API calls through adapters
- [ ] 90% cache hit rate for repeated calls
- [ ] Zero direct axios imports in services
- [ ] All API errors properly handled
- [ ] Circuit breaker preventing cascading failures

## Files Affected
```
NEW:
- src/adapters/interfaces/IExternalAPI.ts
- src/adapters/SleeperAPIAdapter.ts
- src/adapters/EmailAdapter.ts
- src/adapters/PushNotificationAdapter.ts
- src/adapters/HttpClientFactory.ts
- src/adapters/CircuitBreaker.ts
- src/adapters/mocks/*.ts

MODIFIED:
- src/services/sleeper*.ts
- src/services/emailService.ts
- src/services/pushNotificationService.ts
- src/services/stats*.ts
```

## Benefits
1. **Testability**: Easy to mock external dependencies
2. **Reliability**: Circuit breaker prevents cascading failures
3. **Performance**: Caching reduces API calls
4. **Maintainability**: Centralized API logic
5. **Flexibility**: Easy to switch providers

## Estimated Timeline
- Day 1: Create interfaces and Sleeper adapter
- Day 2: Create other adapters, update services
- Day 3: Testing, monitoring, documentation