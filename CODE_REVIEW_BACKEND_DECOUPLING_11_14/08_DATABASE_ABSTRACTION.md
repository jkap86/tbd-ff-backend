# Task 08: Database Access Abstraction
## Priority: HIGH | Effort: 5 days | Impact: HIGH

## Problem Statement
- 878 direct `pool.query()` calls
- SQL queries scattered throughout codebase
- No query builder or ORM abstraction
- Difficult to change database
- No query optimization layer

## Detailed Subtasks

### 1. Implement Query Builder (1 day)
- [ ] Create query builder abstraction
- [ ] Support SELECT, INSERT, UPDATE, DELETE
- [ ] Add JOIN support
- [ ] Add transaction support
- [ ] Type-safe query construction

### 2. Create Database Abstraction Layer (1 day)
- [ ] Abstract PostgreSQL specifics
- [ ] Create database agnostic interface
- [ ] Support multiple database types
- [ ] Add connection management

### 3. Migrate Raw Queries (2 days)
- [ ] Convert all 878 pool.query calls
- [ ] Use repositories or query builder
- [ ] Remove SQL from services
- [ ] Centralize complex queries

### 4. Optimize Query Performance (1 day)
- [ ] Add query result caching
- [ ] Implement query batching
- [ ] Add database indexes
- [ ] Profile slow queries
- [ ] Add query monitoring

### 5. Add Migration System (4 hours)
- [ ] Implement migration runner
- [ ] Version control schema changes
- [ ] Add rollback support
- [ ] Create migration templates

## Migration Priority
1. High-frequency queries (matchups, rosters)
2. Complex queries (standings, statistics)
3. Simple CRUD operations
4. Admin/setup queries

## Success Criteria
- [ ] Zero direct pool.query calls
- [ ] All queries through abstraction
- [ ] Query performance improved
- [ ] Database vendor agnostic
- [ ] Migration system in place