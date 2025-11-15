# Task 02: Repository Pattern Implementation
## Priority: CRITICAL | Effort: 5 days | Impact: HIGH

## Problem Statement
878 instances of direct `pool.query()` calls scattered across services and models:
- Services directly constructing SQL queries
- No abstraction layer for database operations
- Difficult to mock for testing
- No centralized place for query optimization
- Schema changes require updates in multiple files

## Solution Architecture
Implement a comprehensive Repository pattern for all database entities, extending the existing BaseRepository.

## Current State Analysis
```
GOOD (Already using BaseRepository):
- User (partial)
- League (partial)

NEEDS REPOSITORY:
- Roster (high priority - used everywhere)
- Matchup (high priority - complex queries)
- Draft (medium priority)
- Player (medium priority)
- Trade (medium priority)
- WaiverClaim (medium priority)
- Transaction (low priority)
- PlayerStats (low priority)
```

## Detailed Subtasks

### 1. Enhance BaseRepository (1 hour)
- [ ] Add batch operations support
- [ ] Add transaction support
- [ ] Add query builder helpers
- [ ] Add caching hooks
- [ ] Add performance logging

**Enhance `src/models/BaseRepository.ts`:**
```typescript
export abstract class BaseRepository<T> {
  protected constructor(
    protected tableName: string,
    protected primaryKey: string,
    protected pool?: Pool
  ) {}

  // Add new methods
  async findMany(ids: number[]): Promise<T[]> {
    if (ids.length === 0) return [];
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE ${this.primaryKey} = ANY($1::int[])
    `;
    const result = await this.query(query, [ids]);
    return result.rows;
  }

  async upsert(data: Partial<T>, conflictColumns: string[]): Promise<T> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, i) => `$${i + 1}`);

    const query = `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (${conflictColumns.join(', ')})
      DO UPDATE SET ${columns.map(c => `${c} = EXCLUDED.${c}`).join(', ')}
      RETURNING *
    `;

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async batchInsert(items: Partial<T>[]): Promise<T[]> {
    if (items.length === 0) return [];

    const columns = Object.keys(items[0]);
    const values: any[] = [];
    const placeholders: string[] = [];

    items.forEach((item, index) => {
      const rowPlaceholders = columns.map((col, colIndex) => {
        const paramIndex = index * columns.length + colIndex + 1;
        values.push(item[col as keyof T]);
        return `$${paramIndex}`;
      });
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    });

    const query = `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES ${placeholders.join(', ')}
      RETURNING *
    `;

    const result = await this.query(query, values);
    return result.rows;
  }

  async executeInTransaction<R>(
    operation: (client: PoolClient) => Promise<R>
  ): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

### 2. Create RosterRepository (2 hours)
- [ ] Create `src/repositories/RosterRepository.ts`
- [ ] Migrate all roster-related queries
- [ ] Add complex query methods
- [ ] Add roster statistics methods
- [ ] Write unit tests

**High-priority queries to migrate from:**
- `src/services/recordService.ts`
- `src/services/standingsService.ts`
- `src/models/Roster.ts`

**Create `src/repositories/RosterRepository.ts`:**
```typescript
import { BaseRepository } from '../models/BaseRepository';
import { Roster } from '../types/Roster';

export class RosterRepository extends BaseRepository<Roster> {
  constructor(pool: Pool) {
    super('rosters', 'id', pool);
  }

  async getByLeague(leagueId: number): Promise<Roster[]> {
    return this.findBy({ league_id: leagueId });
  }

  async getWithUserDetails(rosterId: number): Promise<RosterWithUser | null> {
    const query = `
      SELECT r.*, u.username, u.email
      FROM rosters r
      JOIN users u ON r.user_id = u.id
      WHERE r.id = $1
    `;
    const result = await this.query(query, [rosterId]);
    return result.rows[0] || null;
  }

  async updateRecord(
    rosterId: number,
    wins: number,
    losses: number,
    ties: number,
    pointsFor: number,
    pointsAgainst: number
  ): Promise<void> {
    const query = `
      UPDATE rosters
      SET settings = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                COALESCE(settings, '{}'::jsonb),
                '{wins}', $2::text::jsonb
              ),
              '{losses}', $3::text::jsonb
            ),
            '{ties}', $4::text::jsonb
          ),
          '{points_for}', $5::text::jsonb
        ),
        '{points_against}', $6::text::jsonb
      )
      WHERE id = $1
    `;
    await this.query(query, [rosterId, wins, losses, ties, pointsFor, pointsAgainst]);
  }

  async batchUpdateRecords(
    updates: Array<{
      rosterId: number;
      wins: number;
      losses: number;
      ties: number;
      pointsFor: number;
      pointsAgainst: number;
    }>
  ): Promise<void> {
    if (updates.length === 0) return;

    // Use UNNEST for efficient batch update
    const rosterIds = updates.map(u => u.rosterId);
    const wins = updates.map(u => u.wins);
    const losses = updates.map(u => u.losses);
    const ties = updates.map(u => u.ties);
    const pointsFor = updates.map(u => u.pointsFor);
    const pointsAgainst = updates.map(u => u.pointsAgainst);

    const query = `
      UPDATE rosters r
      SET settings = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                COALESCE(r.settings, '{}'::jsonb),
                '{wins}', u.wins::text::jsonb
              ),
              '{losses}', u.losses::text::jsonb
            ),
            '{ties}', u.ties::text::jsonb
          ),
          '{points_for}', u.points_for::text::jsonb
        ),
        '{points_against}', u.points_against::text::jsonb
      )
      FROM (
        SELECT * FROM UNNEST(
          $1::int[], $2::int[], $3::int[], $4::int[], $5::numeric[], $6::numeric[]
        ) AS t(roster_id, wins, losses, ties, points_for, points_against)
      ) u
      WHERE r.id = u.roster_id
    `;

    await this.query(query, [rosterIds, wins, losses, ties, pointsFor, pointsAgainst]);
  }

  async getStandings(leagueId: number): Promise<Standing[]> {
    const query = `
      SELECT
        r.id,
        r.user_id,
        r.team_name,
        COALESCE((r.settings->>'wins')::int, 0) as wins,
        COALESCE((r.settings->>'losses')::int, 0) as losses,
        COALESCE((r.settings->>'ties')::int, 0) as ties,
        COALESCE((r.settings->>'points_for')::numeric, 0) as points_for,
        COALESCE((r.settings->>'points_against')::numeric, 0) as points_against,
        u.username
      FROM rosters r
      JOIN users u ON r.user_id = u.id
      WHERE r.league_id = $1
      ORDER BY
        wins DESC,
        losses ASC,
        points_for DESC
    `;
    const result = await this.query(query, [leagueId]);
    return result.rows;
  }
}
```

### 3. Create MatchupRepository (2 hours)
- [ ] Create `src/repositories/MatchupRepository.ts`
- [ ] Migrate matchup queries from services
- [ ] Add week/season query methods
- [ ] Add score calculation methods
- [ ] Write unit tests

**Migrate queries from:**
- `src/services/recordService.ts`
- `src/services/scoringService.ts`
- `src/models/Matchup.ts`

**Create `src/repositories/MatchupRepository.ts`:**
```typescript
export class MatchupRepository extends BaseRepository<Matchup> {
  constructor(pool: Pool) {
    super('matchups', 'id', pool);
  }

  async getUnfinalizedMatchups(
    leagueId: number,
    week: number,
    season: string
  ): Promise<Matchup[]> {
    const query = `
      SELECT * FROM matchups
      WHERE league_id = $1 AND week = $2 AND season = $3
        AND (finalized IS NULL OR finalized = FALSE)
    `;
    const result = await this.query(query, [leagueId, week, season]);
    return result.rows;
  }

  async getWeekMatchups(
    leagueId: number,
    week: number,
    season: string
  ): Promise<Matchup[]> {
    const query = `
      SELECT m.*,
        r1.team_name as roster1_team_name,
        r2.team_name as roster2_team_name,
        u1.username as roster1_username,
        u2.username as roster2_username
      FROM matchups m
      LEFT JOIN rosters r1 ON m.roster1_id = r1.id
      LEFT JOIN rosters r2 ON m.roster2_id = r2.id
      LEFT JOIN users u1 ON r1.user_id = u1.id
      LEFT JOIN users u2 ON r2.user_id = u2.id
      WHERE m.league_id = $1 AND m.week = $2 AND m.season = $3
      ORDER BY m.id
    `;
    const result = await this.query(query, [leagueId, week, season]);
    return result.rows;
  }

  async finalizeMatchups(
    matchupIds: number[]
  ): Promise<void> {
    if (matchupIds.length === 0) return;

    const query = `
      UPDATE matchups
      SET finalized = true
      WHERE id = ANY($1::int[])
    `;
    await this.query(query, [matchupIds]);
  }

  async updateScores(
    updates: Array<{ id: number; roster1Score: number; roster2Score: number }>
  ): Promise<void> {
    if (updates.length === 0) return;

    const ids = updates.map(u => u.id);
    const roster1Scores = updates.map(u => u.roster1Score);
    const roster2Scores = updates.map(u => u.roster2Score);

    const query = `
      UPDATE matchups m
      SET
        roster1_score = u.roster1_score,
        roster2_score = u.roster2_score
      FROM (
        SELECT * FROM UNNEST($1::int[], $2::numeric[], $3::numeric[])
        AS t(id, roster1_score, roster2_score)
      ) u
      WHERE m.id = u.id
    `;

    await this.query(query, [ids, roster1Scores, roster2Scores]);
  }
}
```

### 4. Create PlayerRepository (1.5 hours)
- [ ] Create `src/repositories/PlayerRepository.ts`
- [ ] Migrate player search queries
- [ ] Add filtering methods
- [ ] Add stats join methods
- [ ] Write unit tests

**Migrate from:**
- `src/models/Player.ts`
- `src/services/draftPickService.ts`

### 5. Create DraftRepository (1.5 hours)
- [ ] Create `src/repositories/DraftRepository.ts`
- [ ] Migrate draft state queries
- [ ] Add draft pick methods
- [ ] Add draft order methods
- [ ] Write unit tests

**Migrate from:**
- `src/models/Draft.ts`
- `src/models/DraftOrder.ts`
- `src/models/DraftPick.ts`

### 6. Refactor Services to Use Repositories (3 hours)

#### 6a. RecordService Refactoring
- [ ] Remove all direct pool.query calls
- [ ] Inject repositories via constructor
- [ ] Use repository methods
- [ ] Update tests

**Before:**
```typescript
// src/services/recordService.ts
const matchupsResult = await pool.query(matchupsQuery, [leagueId, week, season]);
```

**After:**
```typescript
export class RecordService {
  constructor(
    private matchupRepo: MatchupRepository,
    private rosterRepo: RosterRepository
  ) {}

  async finalizeWeekScores(leagueId: number, week: number, season: string) {
    const matchups = await this.matchupRepo.getUnfinalizedMatchups(leagueId, week, season);

    // Calculate updates...

    await this.rosterRepo.batchUpdateRecords(updates);
    await this.matchupRepo.finalizeMatchups(matchupIds);
  }
}
```

#### 6b. StandingsService Refactoring
- [ ] Remove direct queries
- [ ] Use RosterRepository
- [ ] Simplify logic
- [ ] Update tests

#### 6c. Other Service Refactoring (1 hour each)
- [ ] `leagueMedianService.ts`
- [ ] `tiebreakerService.ts`
- [ ] `playoffService.ts`
- [ ] `waiverService.ts`
- [ ] `tradeService.ts`

### 7. Create Repository Factory (1 hour)
- [ ] Create `src/factories/RepositoryFactory.ts`
- [ ] Initialize all repositories
- [ ] Handle pool injection
- [ ] Add repository registry

**Code to create:**
```typescript
// src/factories/RepositoryFactory.ts
export class RepositoryFactory {
  private repositories = new Map<string, any>();

  constructor(private pool: Pool) {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    this.repositories.set('roster', new RosterRepository(this.pool));
    this.repositories.set('matchup', new MatchupRepository(this.pool));
    this.repositories.set('player', new PlayerRepository(this.pool));
    this.repositories.set('draft', new DraftRepository(this.pool));
    this.repositories.set('trade', new TradeRepository(this.pool));
    this.repositories.set('waiver', new WaiverRepository(this.pool));
    this.repositories.set('user', new UserRepository(this.pool));
    this.repositories.set('league', new LeagueRepository(this.pool));
  }

  get<T>(name: string): T {
    const repo = this.repositories.get(name);
    if (!repo) {
      throw new Error(`Repository ${name} not found`);
    }
    return repo;
  }

  getRosterRepository(): RosterRepository {
    return this.get<RosterRepository>('roster');
  }

  getMatchupRepository(): MatchupRepository {
    return this.get<MatchupRepository>('matchup');
  }

  // ... other typed getters
}
```

### 8. Update Model Files (2 hours)
- [ ] Convert model files to use repositories
- [ ] Remove direct pool imports
- [ ] Create backward compatibility layer
- [ ] Update exports

**Example migration:**
```typescript
// src/models/Roster.ts
import { getRepositoryFactory } from '../factories/RepositoryFactory';

// Backward compatibility functions
export async function getRosterById(id: number) {
  const repo = getRepositoryFactory().getRosterRepository();
  return repo.findById(id);
}

export async function getRostersByLeague(leagueId: number) {
  const repo = getRepositoryFactory().getRosterRepository();
  return repo.getByLeague(leagueId);
}
```

### 9. Write Comprehensive Tests (3 hours)
- [ ] Test BaseRepository enhancements
- [ ] Test RosterRepository methods
- [ ] Test MatchupRepository methods
- [ ] Test service integrations
- [ ] Test transaction handling
- [ ] Test batch operations
- [ ] Performance tests for batch vs individual queries

**Create test files:**
- `src/__tests__/repositories/BaseRepository.test.ts`
- `src/__tests__/repositories/RosterRepository.test.ts`
- `src/__tests__/repositories/MatchupRepository.test.ts`
- `src/__tests__/repositories/RepositoryFactory.test.ts`

### 10. Performance Optimization (2 hours)
- [ ] Add database indexes for common queries
- [ ] Implement query result caching
- [ ] Add connection pooling optimization
- [ ] Add query performance logging
- [ ] Create slow query alerts

### 11. Documentation (1 hour)
- [ ] Document repository pattern usage
- [ ] Create migration guide for services
- [ ] Document query optimization techniques
- [ ] Add troubleshooting guide

## Migration Checklist

### Services to Update
- [ ] recordService.ts (33 queries)
- [ ] standingsService.ts (8 queries)
- [ ] leagueMedianService.ts (13 queries)
- [ ] tiebreakerService.ts (14 queries)
- [ ] scoringService.ts (5 queries)
- [ ] playoffService.ts (12 queries)
- [ ] waiverService.ts (25 queries)
- [ ] tradeService.ts (18 queries)
- [ ] draftPickService.ts (15 queries)
- [ ] authorizationService.ts (8 queries)

### Models to Convert
- [ ] Roster.ts
- [ ] Matchup.ts
- [ ] Player.ts
- [ ] Draft.ts
- [ ] DraftOrder.ts
- [ ] DraftPick.ts
- [ ] Trade.ts
- [ ] WaiverClaim.ts
- [ ] Transaction.ts
- [ ] PlayerStats.ts

## Testing Strategy
1. **Unit Tests**: Mock database connections
2. **Integration Tests**: Use test database
3. **Performance Tests**: Compare before/after query times
4. **Migration Tests**: Verify backward compatibility

## Rollback Plan
1. Keep old query functions temporarily
2. Use feature flag to switch between old/new
3. Monitor query performance
4. Gradual service migration

## Success Criteria
- [ ] Zero direct pool.query calls in services
- [ ] All database operations through repositories
- [ ] 50% reduction in duplicate queries
- [ ] Tests passing with > 90% coverage
- [ ] No performance degradation
- [ ] Query times logged and monitored

## Files Affected
```
NEW:
- src/repositories/*.ts (10+ files)
- src/factories/RepositoryFactory.ts
- src/__tests__/repositories/*.test.ts

MODIFIED:
- src/models/*.ts (all model files)
- src/services/*.ts (all services with DB queries)
- src/models/BaseRepository.ts
```

## Performance Improvements Expected
- **N+1 Query Elimination**: 84-98% reduction in queries
- **Batch Operations**: 10-20x faster for bulk updates
- **Connection Pooling**: Better resource utilization
- **Query Caching**: 50-70% reduction in repeated queries

## Estimated Timeline
- Day 1: BaseRepository enhancement, RosterRepository
- Day 2: MatchupRepository, PlayerRepository, DraftRepository
- Day 3: Service refactoring (recordService, standingsService)
- Day 4: Service refactoring (remaining services)
- Day 5: Testing, documentation, performance optimization

## Dependencies
- Required for Task 03 (Dependency Injection)
- Blocks Task 08 (Database Abstraction)
- Enables Task 11 (Testing Infrastructure)