# Task 03: Dependency Injection Container
## Priority: CRITICAL | Effort: 2 days | Impact: HIGH

## Problem Statement
All services and components rely on global imports:
- `import pool from "../config/database"`
- `import { logger } from "../utils/logger"`
- `import { io } from "../index"`

This creates:
- Tight coupling to specific implementations
- Difficulty in testing (can't mock dependencies)
- Hidden dependencies
- Initialization order problems

## Solution Architecture
Implement a centralized Dependency Injection Container using constructor injection pattern.

## Detailed Subtasks

### 1. Create DI Container Core (1 hour)
- [ ] Create `src/container/DIContainer.ts`
- [ ] Implement service registration
- [ ] Implement dependency resolution
- [ ] Add lifecycle management (singleton/transient)
- [ ] Add circular dependency detection

**Create `src/container/DIContainer.ts`:**
```typescript
export interface ServiceDescriptor {
  factory: (container: DIContainer) => any;
  lifecycle: 'singleton' | 'transient' | 'scoped';
  dependencies?: string[];
}

export class DIContainer {
  private services = new Map<string, ServiceDescriptor>();
  private singletons = new Map<string, any>();
  private resolving = new Set<string>();

  register<T>(name: string, descriptor: ServiceDescriptor): void {
    this.services.set(name, descriptor);
  }

  registerSingleton<T>(name: string, factory: (container: DIContainer) => T): void {
    this.register(name, { factory, lifecycle: 'singleton' });
  }

  registerTransient<T>(name: string, factory: (container: DIContainer) => T): void {
    this.register(name, { factory, lifecycle: 'transient' });
  }

  resolve<T>(name: string): T {
    if (this.resolving.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    const descriptor = this.services.get(name);
    if (!descriptor) {
      throw new Error(`Service not registered: ${name}`);
    }

    if (descriptor.lifecycle === 'singleton') {
      if (!this.singletons.has(name)) {
        this.resolving.add(name);
        try {
          const instance = descriptor.factory(this);
          this.singletons.set(name, instance);
        } finally {
          this.resolving.delete(name);
        }
      }
      return this.singletons.get(name);
    }

    this.resolving.add(name);
    try {
      return descriptor.factory(this);
    } finally {
      this.resolving.delete(name);
    }
  }

  get<T>(name: string): T {
    return this.resolve<T>(name);
  }

  // Helper for typed resolution
  getRepository<T>(name: string): T {
    return this.resolve<T>(`repository.${name}`);
  }

  getService<T>(name: string): T {
    return this.resolve<T>(`service.${name}`);
  }

  getController<T>(name: string): T {
    return this.resolve<T>(`controller.${name}`);
  }
}
```

### 2. Create Application Container Setup (2 hours)
- [ ] Create `src/container/AppContainer.ts`
- [ ] Register all infrastructure services
- [ ] Register all repositories
- [ ] Register all business services
- [ ] Register all controllers

**Create `src/container/AppContainer.ts`:**
```typescript
import { DIContainer } from './DIContainer';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { Logger } from 'winston';

export class AppContainer {
  private container: DIContainer;

  constructor(
    private pool: Pool,
    private io: Server,
    private logger: Logger
  ) {
    this.container = new DIContainer();
    this.registerServices();
  }

  private registerServices(): void {
    // Infrastructure
    this.registerInfrastructure();

    // Repositories
    this.registerRepositories();

    // Services
    this.registerBusinessServices();

    // Controllers
    this.registerControllers();
  }

  private registerInfrastructure(): void {
    // Database pool
    this.container.registerSingleton('infrastructure.pool', () => this.pool);

    // Logger
    this.container.registerSingleton('infrastructure.logger', () => this.logger);

    // Event bus
    this.container.registerSingleton('infrastructure.eventBus', (container) => {
      const io = this.io;
      return new SocketEventBus(io);
    });

    // Cache service
    this.container.registerSingleton('infrastructure.cache', (container) => {
      const redis = container.get('infrastructure.redis');
      return new CacheService(redis);
    });
  }

  private registerRepositories(): void {
    // User repository
    this.container.registerSingleton('repository.user', (container) => {
      const pool = container.get<Pool>('infrastructure.pool');
      return new UserRepository(pool);
    });

    // Roster repository
    this.container.registerSingleton('repository.roster', (container) => {
      const pool = container.get<Pool>('infrastructure.pool');
      return new RosterRepository(pool);
    });

    // Matchup repository
    this.container.registerSingleton('repository.matchup', (container) => {
      const pool = container.get<Pool>('infrastructure.pool');
      return new MatchupRepository(pool);
    });

    // ... register all other repositories
  }

  private registerBusinessServices(): void {
    // Record service
    this.container.registerSingleton('service.record', (container) => {
      const matchupRepo = container.getRepository<MatchupRepository>('matchup');
      const rosterRepo = container.getRepository<RosterRepository>('roster');
      const logger = container.get<Logger>('infrastructure.logger');
      return new RecordService(matchupRepo, rosterRepo, logger);
    });

    // Auto-pick service
    this.container.registerSingleton('service.autoPick', (container) => {
      const eventBus = container.get<IEventBus>('infrastructure.eventBus');
      const draftRepo = container.getRepository<DraftRepository>('draft');
      const logger = container.get<Logger>('infrastructure.logger');
      return new AutoPickService(eventBus, draftRepo, logger);
    });

    // ... register all other services
  }

  private registerControllers(): void {
    // League controller
    this.container.registerTransient('controller.league', (container) => {
      const leagueService = container.getService<LeagueService>('league');
      const authService = container.getService<AuthorizationService>('authorization');
      return new LeagueController(leagueService, authService);
    });

    // ... register all other controllers
  }

  getContainer(): DIContainer {
    return this.container;
  }

  // Convenience methods
  getService<T>(name: string): T {
    return this.container.getService<T>(name);
  }

  getRepository<T>(name: string): T {
    return this.container.getRepository<T>(name);
  }

  getController<T>(name: string): T {
    return this.container.getController<T>(name);
  }
}
```

### 3. Update Services for Constructor Injection (3 hours)

#### 3a. RecordService Update
- [ ] Add constructor with dependencies
- [ ] Remove global imports
- [ ] Update all method signatures
- [ ] Update tests

**Before:**
```typescript
import pool from "../config/database";
import { logger } from "../utils/logger";

export async function finalizeWeekScores(leagueId: number, week: number) {
  // Direct usage of global imports
  const result = await pool.query(...);
  logger.info(...);
}
```

**After:**
```typescript
export class RecordService {
  constructor(
    private matchupRepo: MatchupRepository,
    private rosterRepo: RosterRepository,
    private logger: Logger
  ) {}

  async finalizeWeekScores(leagueId: number, week: number): Promise<void> {
    // Use injected dependencies
    const matchups = await this.matchupRepo.getUnfinalizedMatchups(leagueId, week);
    this.logger.info(`Finalizing ${matchups.length} matchups`);
  }
}
```

#### 3b. Update All Service Classes (2 hours each)
- [ ] AutoPickService
- [ ] LiveScoreService
- [ ] DraftScheduler
- [ ] ScoreScheduler
- [ ] WaiverScheduler
- [ ] StandingsService
- [ ] LeagueMedianService
- [ ] TiebreakerService

### 4. Update Controllers for Injection (2 hours)

#### 4a. BaseController Update
- [ ] Add dependency injection support
- [ ] Create controller factory method
- [ ] Update authentication handling

**Update `src/controllers/BaseController.ts`:**
```typescript
export abstract class BaseController {
  constructor(
    protected logger?: Logger
  ) {}

  protected asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
  ) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // ... existing methods
}
```

#### 4b. Update Individual Controllers
- [ ] LeagueController
- [ ] DraftController
- [ ] RosterController
- [ ] MatchupController
- [ ] TradeController
- [ ] WaiverController

### 5. Create Service Locator for Backward Compatibility (1 hour)
- [ ] Create `src/container/ServiceLocator.ts`
- [ ] Provide static access to container
- [ ] Add migration helpers
- [ ] Document deprecation warnings

**Create `src/container/ServiceLocator.ts`:**
```typescript
import { DIContainer } from './DIContainer';

let globalContainer: DIContainer | null = null;

export class ServiceLocator {
  static initialize(container: DIContainer): void {
    globalContainer = container;
  }

  static getContainer(): DIContainer {
    if (!globalContainer) {
      throw new Error('ServiceLocator not initialized. Call initialize() first.');
    }
    return globalContainer;
  }

  static getService<T>(name: string): T {
    return this.getContainer().getService<T>(name);
  }

  static getRepository<T>(name: string): T {
    return this.getContainer().getRepository<T>(name);
  }

  // Backward compatibility helpers
  static getPool(): Pool {
    console.warn('Deprecated: Use dependency injection instead of ServiceLocator.getPool()');
    return this.getContainer().get<Pool>('infrastructure.pool');
  }

  static getLogger(): Logger {
    console.warn('Deprecated: Use dependency injection instead of ServiceLocator.getLogger()');
    return this.getContainer().get<Logger>('infrastructure.logger');
  }
}

// Export convenience functions for gradual migration
export function getService<T>(name: string): T {
  return ServiceLocator.getService<T>(name);
}

export function getRepository<T>(name: string): T {
  return ServiceLocator.getRepository<T>(name);
}
```

### 6. Update Application Bootstrap (1 hour)
- [ ] Modify `src/index.ts`
- [ ] Initialize container
- [ ] Wire up all dependencies
- [ ] Update route handlers

**Update `src/index.ts`:**
```typescript
import { AppContainer } from './container/AppContainer';
import { ServiceLocator } from './container/ServiceLocator';

async function startServer() {
  // Initialize infrastructure
  const pool = createPool();
  const io = new Server(httpServer, corsOptions);
  const logger = createLogger();

  // Initialize DI container
  const appContainer = new AppContainer(pool, io, logger);
  const container = appContainer.getContainer();

  // Initialize service locator for backward compatibility
  ServiceLocator.initialize(container);

  // Setup routes with dependency injection
  setupRoutes(app, container);

  // Setup socket handlers with dependency injection
  const eventBus = container.get<IEventBus>('infrastructure.eventBus');
  setupDraftSocket(io, eventBus);
  setupLeagueSocket(io, eventBus);
  // ... other socket setups

  // Start scheduled services
  const draftScheduler = container.getService<DraftScheduler>('draftScheduler');
  draftScheduler.start();

  // Start server
  httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}
```

### 7. Update Route Setup (2 hours)
- [ ] Create route factory functions
- [ ] Inject controllers into routes
- [ ] Update middleware to use DI
- [ ] Test all endpoints

**Create `src/routes/routeSetup.ts`:**
```typescript
export function setupRoutes(app: Express, container: DIContainer): void {
  // League routes
  const leagueController = container.getController<LeagueController>('league');
  const leagueRouter = Router();

  leagueRouter.post('/',
    authenticate,
    validateLeagueCreation,
    leagueController.create
  );

  leagueRouter.get('/:id',
    authenticate,
    leagueController.getById
  );

  app.use('/api/leagues', leagueRouter);

  // Draft routes
  const draftController = container.getController<DraftController>('draft');
  const draftRouter = Router();

  // ... setup draft routes

  app.use('/api/drafts', draftRouter);

  // ... setup all other routes
}
```

### 8. Create Test Container (1 hour)
- [ ] Create `src/__tests__/helpers/TestContainer.ts`
- [ ] Setup mock dependencies
- [ ] Create test-specific services
- [ ] Add helper methods

**Create `src/__tests__/helpers/TestContainer.ts`:**
```typescript
export class TestContainer {
  private container: DIContainer;

  constructor() {
    this.container = new DIContainer();
    this.registerMocks();
  }

  private registerMocks(): void {
    // Mock logger
    this.container.registerSingleton('infrastructure.logger', () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }));

    // Mock event bus
    this.container.registerSingleton('infrastructure.eventBus', () =>
      new MockEventBus()
    );

    // Mock repositories
    this.container.registerSingleton('repository.roster', () => ({
      findById: jest.fn(),
      findBy: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    }));
  }

  registerMockService(name: string, mock: any): void {
    this.container.registerSingleton(`service.${name}`, () => mock);
  }

  registerMockRepository(name: string, mock: any): void {
    this.container.registerSingleton(`repository.${name}`, () => mock);
  }

  getContainer(): DIContainer {
    return this.container;
  }
}
```

### 9. Write Unit Tests (2 hours)
- [ ] Test DIContainer core functionality
- [ ] Test service registration and resolution
- [ ] Test circular dependency detection
- [ ] Test lifecycle management
- [ ] Test AppContainer setup
- [ ] Test ServiceLocator

**Create test files:**
- `src/__tests__/container/DIContainer.test.ts`
- `src/__tests__/container/AppContainer.test.ts`
- `src/__tests__/container/ServiceLocator.test.ts`

### 10. Migration Helpers (30 min)
- [ ] Create migration script
- [ ] Document migration steps
- [ ] Create code snippets
- [ ] Add VS Code snippets

**Create `scripts/migrate-to-di.js`:**
```javascript
// Script to help migrate files to use DI
const fs = require('fs');
const path = require('path');

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace pool imports
  content = content.replace(
    /import pool from ['"].*database['"]/g,
    '// Pool now injected via constructor'
  );

  // Replace logger imports
  content = content.replace(
    /import { logger } from ['"].*logger['"]/g,
    '// Logger now injected via constructor'
  );

  // Add constructor template if class exists
  if (content.includes('export class')) {
    // Add constructor template...
  }

  fs.writeFileSync(filePath, content);
}
```

## Migration Checklist

### Services to Convert
- [ ] RecordService
- [ ] AutoPickService
- [ ] LiveScoreService
- [ ] DraftScheduler
- [ ] ScoreScheduler
- [ ] WaiverScheduler
- [ ] StandingsService
- [ ] LeagueMedianService
- [ ] TiebreakerService
- [ ] All other services (30+ files)

### Controllers to Convert
- [ ] LeagueController
- [ ] DraftController
- [ ] RosterController
- [ ] MatchupController
- [ ] TradeController
- [ ] WaiverController
- [ ] All other controllers (20+ files)

### Infrastructure Updates
- [ ] Remove global exports from index.ts
- [ ] Update all route files
- [ ] Update all socket handlers
- [ ] Update middleware
- [ ] Update scheduled tasks

## Testing Strategy
1. **Unit Tests**: Use TestContainer for isolated testing
2. **Integration Tests**: Use real AppContainer with test database
3. **E2E Tests**: Verify entire application works with DI
4. **Performance Tests**: Ensure no overhead from DI

## Rollback Plan
1. ServiceLocator provides backward compatibility
2. Can gradually migrate services
3. Feature flag to toggle DI usage
4. Keep old initialization code temporarily

## Success Criteria
- [ ] All services use constructor injection
- [ ] No global imports in business logic
- [ ] All tests passing
- [ ] ServiceLocator working for gradual migration
- [ ] No performance degradation
- [ ] Container initialization < 100ms

## Files Affected
```
NEW:
- src/container/DIContainer.ts
- src/container/AppContainer.ts
- src/container/ServiceLocator.ts
- src/routes/routeSetup.ts
- src/__tests__/helpers/TestContainer.ts
- src/__tests__/container/*.test.ts

MODIFIED:
- src/index.ts
- src/services/*.ts (all service files)
- src/controllers/*.ts (all controller files)
- src/routes/*.ts (all route files)
- src/socket/*.ts (all socket handlers)
```

## Benefits
1. **Testability**: Easy to mock dependencies
2. **Flexibility**: Can swap implementations
3. **Clarity**: Dependencies are explicit
4. **Maintainability**: Centralized configuration
5. **Scalability**: Easy to add new services

## Estimated Timeline
- Day 1: Core container, infrastructure setup
- Day 2: Service migration, controller updates, testing

## Dependencies
- Requires Task 01 (Event Bus) completion
- Requires Task 02 (Repository Pattern) completion
- Enables all other refactoring tasks