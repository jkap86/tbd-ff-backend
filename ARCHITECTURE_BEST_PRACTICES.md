# Backend Architecture - Best Practices Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Dependency Injection Container](#dependency-injection-container)
3. [Event Bus Pattern](#event-bus-pattern)
4. [Repository Pattern](#repository-pattern)
5. [Service Layer](#service-layer)
6. [Testing](#testing)
7. [Migration Guide](#migration-guide)
8. [Common Patterns](#common-patterns)

---

## Architecture Overview

Our backend follows a clean architecture pattern with clear separation of concerns:

```
┌─────────────────────────────────────────────────┐
│              Controllers/Routes                  │
│         (HTTP/WebSocket Entry Points)           │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│              Service Layer                       │
│        (Business Logic & Orchestration)         │
└─┬──────────────┬──────────────┬────────────────┘
  │              │              │
  │              │              │
┌─▼────────┐  ┌─▼──────────┐ ┌─▼───────────────┐
│Repository│  │  EventBus  │ │ External APIs   │
│  Layer   │  │ (Real-time)│ │ (Sleeper, etc.) │
└─┬────────┘  └────────────┘ └─────────────────┘
  │
┌─▼──────────┐
│  Database  │
└────────────┘
```

### Key Principles

1. **Dependency Injection**: All dependencies are injected, not imported
2. **Testability**: Every component can be unit tested in isolation
3. **Single Responsibility**: Each layer has one clear purpose
4. **Interface Segregation**: Components depend on interfaces, not concrete implementations
5. **No Global State**: No direct imports of `io`, `pool`, or other global instances

---

## Dependency Injection Container

### What is it?

The DI Container manages service creation and dependencies, making code modular and testable.

### Basic Usage

```typescript
import { container } from './container';

// Resolve a service
const userRepo = container.resolve<UserRepository>('repository.user');

// Check if service exists
if (container.has('myService')) {
  const service = container.resolve('myService');
}
```

### Registering Services

#### 1. Register an Instance (Already Created)

```typescript
const config = { apiKey: 'test-key' };
container.registerInstance('config', config);
```

#### 2. Register a Singleton (Created Once, Cached)

```typescript
container.registerSingleton('service.user', (c) => {
  const userRepo = c.resolve<UserRepository>('repository.user');
  const eventBus = c.resolve<IEventBus>('eventBus');
  const logger = c.resolve<LoggerInterface>('logger');

  return new UserService(userRepo, eventBus, logger);
});
```

#### 3. Register a Factory (Created Every Time)

```typescript
container.registerFactory('request.context', (c) => {
  return {
    requestId: generateId(),
    timestamp: new Date(),
  };
});
```

### When to Use Each Type

- **Instance**: For pre-configured objects (config, logger, database pool)
- **Singleton**: For stateless services that can be reused (repositories, services)
- **Factory**: For stateful objects that need fresh instances (request contexts)

### Available Services

All services registered in `src/container/index.ts`:

- `database.pool` - PostgreSQL connection pool
- `database.client` - Database client wrapper
- `logger` - Winston logger
- `emailService` - Email sending service
- `eventBus` - Real-time event bus
- `repository.user` - User repository
- `repository.league` - League repository
- `repository.draft` - Draft repository
- `repository.roster` - Roster repository
- `repository.matchup` - Matchup repository
- `repository.player` - Player repository
- `repository.trade` - Trade repository
- `repository.waiver` - Waiver repository
- `repository.transaction` - Transaction repository
- `repository.playoff` - Playoff repository
- `repository.notification` - Notification repository
- `repository.stats` - Stats repository

---

## Event Bus Pattern

### What is it?

The EventBus decouples real-time event emission from Socket.io, making services testable.

### Basic Usage

```typescript
import { IEventBus } from '../interfaces/IEventBus';

class MyService {
  constructor(private eventBus: IEventBus) {}

  async doSomething() {
    // Emit to all clients
    this.eventBus.emit('myEvent', { data: 'value' });

    // Emit to specific room
    this.eventBus.emitToRoom('draft:123', 'pick_made', {
      draftId: 123,
      playerId: 456,
    });

    // Emit to specific user
    this.eventBus.emitToUser(userId, 'notification', {
      message: 'Your turn!',
    });
  }
}
```

### Room and User Patterns

**Room Naming Convention:**
- `draft:{draftId}` - Draft-specific events
- `league:{leagueId}` - League-wide events
- `trade:{tradeId}` - Trade-specific events
- `user:{userId}` - User-specific events

**Example:**
```typescript
// Join a room
this.eventBus.joinRoom(socketId, `draft:${draftId}`);

// Emit to everyone in that draft
this.eventBus.emitToRoom(`draft:${draftId}`, 'pick_made', pickData);

// Leave room
this.eventBus.leaveRoom(socketId, `draft:${draftId}`);
```

### Testing with MockEventBus

```typescript
import { MockEventBus } from '../services/eventBus/MockEventBus';

describe('MyService', () => {
  let mockEventBus: MockEventBus;
  let service: MyService;

  beforeEach(() => {
    mockEventBus = new MockEventBus();
    service = new MyService(mockEventBus);
  });

  it('should emit event when action occurs', async () => {
    await service.doSomething();

    // Check if event was emitted
    expect(mockEventBus.wasEventEmitted('myEvent')).toBe(true);

    // Check event data
    expect(mockEventBus.getEventData('myEvent')).toEqual({
      data: 'value',
    });

    // Check room-specific events
    expect(mockEventBus.wasEventEmittedToRoom('draft:123', 'pick_made')).toBe(true);

    // Check user-specific events
    expect(mockEventBus.wasEventEmittedToUser(userId, 'notification')).toBe(true);
  });
});
```

---

## Repository Pattern

### What is it?

Repositories centralize all database access for a specific entity, preventing code duplication and N+1 query problems.

### Creating a Repository

All repositories extend `BaseRepository`:

```typescript
import { BaseRepository } from './BaseRepository';
import pool from '../config/database';

export interface MyEntity {
  id: number;
  name: string;
  created_at: Date;
}

export class MyEntityRepository extends BaseRepository<MyEntity> {
  constructor(dbPool = pool) {
    super('my_entities', 'id', dbPool);
  }

  // Add custom methods specific to this entity
  async getByName(name: string): Promise<MyEntity | null> {
    const result = await this.pool.query(
      'SELECT * FROM my_entities WHERE name = $1',
      [name]
    );
    return result.rows[0] || null;
  }

  // Prevent N+1 problems with JOINs
  async getWithRelations(id: number): Promise<MyEntity & { relations: any[] }> {
    const result = await this.pool.query(
      `SELECT e.*,
              json_agg(r.*) as relations
       FROM my_entities e
       LEFT JOIN related_entities r ON r.entity_id = e.id
       WHERE e.id = $1
       GROUP BY e.id`,
      [id]
    );
    return result.rows[0];
  }
}

// Export singleton instance
export const myEntityRepository = new MyEntityRepository();
```

### Using Repositories

**In Services:**
```typescript
class MyService {
  constructor(private repo: MyEntityRepository) {}

  async getEntity(id: number) {
    return await this.repo.findById(id);
  }
}
```

**Direct Usage:**
```typescript
import { userRepository } from '../repositories/UserRepository';

const user = await userRepository.findById(userId);
const users = await userRepository.search('john');
```

### Testing Repositories

```typescript
import { UserRepository } from '../../repositories/UserRepository';

describe('UserRepository', () => {
  let repository: UserRepository;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
    repository = new UserRepository(mockPool);
  });

  it('should find user by ID', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ id: 1, username: 'test' }],
      rowCount: 1,
    });

    const user = await repository.findById(1);

    expect(user).toEqual({ id: 1, username: 'test' });
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      [1]
    );
  });
});
```

---

## Service Layer

### Structure

Services contain business logic and orchestrate between repositories, external APIs, and events.

```typescript
import { IEventBus } from '../interfaces/IEventBus';
import { UserRepository } from '../repositories/UserRepository';
import { LoggerInterface } from '../types/dependencies';

export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly eventBus: IEventBus,
    private readonly logger: LoggerInterface
  ) {}

  async createUser(data: CreateUserDTO): Promise<User> {
    this.logger.info('Creating user', { username: data.username });

    try {
      // Validation
      const exists = await this.userRepo.usernameExists(data.username);
      if (exists) {
        throw new Error('Username already exists');
      }

      // Create
      const user = await this.userRepo.create(data);

      // Emit event
      this.eventBus.emit('user:created', {
        userId: user.id,
        username: user.username,
      });

      this.logger.info('User created', { userId: user.id });

      return user;
    } catch (error: any) {
      this.logger.error('Failed to create user', { error: error.message });
      throw error;
    }
  }
}
```

### Service Best Practices

1. **Constructor Injection**: All dependencies passed via constructor
2. **Readonly Properties**: Dependencies should be `readonly`
3. **Error Handling**: Try/catch blocks with logging
4. **Event Emission**: Emit events for state changes
5. **Return DTOs**: Don't return entities with sensitive data

### Factory Functions

For use with DI Container:

```typescript
export function createUserService(
  userRepo: UserRepository,
  eventBus: IEventBus,
  logger: LoggerInterface
): UserService {
  return new UserService(userRepo, eventBus, logger);
}

// Register in container
container.registerSingleton('service.user', (c) => {
  return createUserService(
    c.resolve('repository.user'),
    c.resolve('eventBus'),
    c.resolve('logger')
  );
});
```

---

## Testing

### Unit Testing Services

```typescript
import { UserService } from '../services/UserService';
import { MockEventBus } from '../services/eventBus/MockEventBus';

describe('UserService', () => {
  let service: UserService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockEventBus: MockEventBus;
  let mockLogger: jest.Mocked<LoggerInterface>;

  beforeEach(() => {
    mockUserRepo = {
      findById: jest.fn(),
      create: jest.fn(),
      usernameExists: jest.fn(),
    } as any;

    mockEventBus = new MockEventBus();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    service = new UserService(mockUserRepo, mockEventBus, mockLogger);
  });

  it('should create user and emit event', async () => {
    mockUserRepo.usernameExists.mockResolvedValue(false);
    mockUserRepo.create.mockResolvedValue({
      id: 1,
      username: 'testuser',
    } as any);

    const result = await service.createUser({
      username: 'testuser',
      email: 'test@example.com',
    });

    expect(result.id).toBe(1);
    expect(mockUserRepo.create).toHaveBeenCalled();
    expect(mockEventBus.wasEventEmitted('user:created')).toBe(true);
    expect(mockLogger.info).toHaveBeenCalled();
  });
});
```

### Integration Testing

See `src/__tests__/integration/architecture-integration.test.ts` for full example.

---

## Migration Guide

### Migrating an Existing Service to DI

**Before:**
```typescript
import { io } from '../index';
import pool from '../config/database';
import { logger } from '../config/logger';

export async function createUser(data: any) {
  const result = await pool.query('INSERT INTO users...');
  io.emit('user:created', { userId: result.rows[0].id });
  logger.info('User created');
  return result.rows[0];
}
```

**After:**
```typescript
import { IEventBus } from '../interfaces/IEventBus';
import { UserRepository } from '../repositories/UserRepository';
import { LoggerInterface } from '../types/dependencies';

export class UserService {
  constructor(
    private userRepo: UserRepository,
    private eventBus: IEventBus,
    private logger: LoggerInterface
  ) {}

  async createUser(data: any) {
    const user = await this.userRepo.create(data);
    this.eventBus.emit('user:created', { userId: user.id });
    this.logger.info('User created');
    return user;
  }
}
```

### Steps to Migrate

1. **Identify Dependencies**: List all imports (`io`, `pool`, `logger`, etc.)
2. **Create Class**: Convert function to class with constructor
3. **Inject Dependencies**: Add dependencies to constructor
4. **Replace Direct Calls**: Use injected dependencies
5. **Register in Container**: Add to `src/container/index.ts`
6. **Update Callers**: Resolve service from container
7. **Add Tests**: Create unit tests with mocks

---

## Common Patterns

### Pattern 1: Service with Multiple Repositories

```typescript
class TradeService {
  constructor(
    private tradeRepo: TradeRepository,
    private rosterRepo: RosterRepository,
    private playerRepo: PlayerRepository,
    private eventBus: IEventBus,
    private logger: LoggerInterface
  ) {}

  async createTrade(initiatorId: number, receiverId: number, items: any[]) {
    // Use multiple repositories
    const initiator = await this.rosterRepo.findById(initiatorId);
    const receiver = await this.rosterRepo.findById(receiverId);
    const players = await this.playerRepo.getByIds(items.map(i => i.playerId));

    // Create trade
    const trade = await this.tradeRepo.create({
      initiatorId,
      receiverId,
      items,
    });

    // Emit event
    this.eventBus.emitToRoom(`league:${initiator.league_id}`, 'trade_proposed', {
      tradeId: trade.id,
    });

    return trade;
  }
}
```

### Pattern 2: Transaction Wrapper

```typescript
class LeagueService {
  constructor(
    private leagueRepo: LeagueRepository,
    private rosterRepo: RosterRepository,
    private dbClient: DatabaseClient
  ) {}

  async createLeagueWithRosters(leagueData: any, ownerUserId: number) {
    // Start transaction
    const client = await this.dbClient.beginTransaction();

    try {
      const league = await this.leagueRepo.create(leagueData, client);
      const roster = await this.rosterRepo.create({
        league_id: league.id,
        user_id: ownerUserId,
      }, client);

      await client.commit();
      return { league, roster };
    } catch (error) {
      await client.rollback();
      throw error;
    }
  }
}
```

### Pattern 3: Async Event Handlers

```typescript
class DraftService {
  constructor(
    private draftRepo: DraftRepository,
    private eventBus: IEventBus,
    private notificationService: NotificationService
  ) {}

  async makePick(draftId: number, playerId: number) {
    const pick = await this.draftRepo.createPick({ draftId, playerId });

    // Emit real-time event
    this.eventBus.emitToRoom(`draft:${draftId}`, 'pick_made', pick);

    // Trigger async notification (don't await)
    this.notificationService.sendPickNotification(pick).catch(err => {
      // Log but don't fail the pick
      console.error('Failed to send notification', err);
    });

    return pick;
  }
}
```

---

## Summary

### Benefits of This Architecture

1. **Testability**: 100% unit test coverage possible
2. **Maintainability**: Clear separation of concerns
3. **Flexibility**: Easy to swap implementations
4. **Scalability**: Services can be extracted to microservices
5. **Developer Experience**: Clear patterns, easy to understand

### Quick Reference

- **Need database access?** Use a Repository
- **Need real-time events?** Use EventBus
- **Need business logic?** Create a Service
- **Need to test?** Use DI Container with mocks
- **Need configuration?** Register in Container

### Example Files

- Service Example: `src/services/examples/UserManagementService.ts`
- Service Test: `src/__tests__/services/examples/UserManagementService.test.ts`
- Repository Test: `src/__tests__/repositories/UserRepository.test.ts`
- Integration Test: `src/__tests__/integration/architecture-integration.test.ts`

---

## Getting Help

If you're unsure how to implement something:

1. Check this guide
2. Look at example files
3. Check existing repositories and services
4. Review test files for patterns
5. Ask for code review

Remember: **Consistency is key**. Follow established patterns, and the codebase will remain maintainable.
