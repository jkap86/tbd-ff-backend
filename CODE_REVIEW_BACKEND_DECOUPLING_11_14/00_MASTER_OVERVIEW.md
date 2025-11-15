# Backend Decoupling Master Overview
## Code Review Date: November 14, 2024

## Executive Summary
The TBD Fantasy Football backend requires strategic decoupling to improve testability, maintainability, and scalability. This document outlines 12 major tasks organized by priority and impact.

## Critical Issues Identified
1. **Global Socket.io Export**: 7+ services import `io` from index.ts
2. **Direct Database Access**: 878 instances of `pool.query()` bypassing abstractions
3. **Console Statements**: 486+ console.log/error statements instead of logger
4. **No Dependency Injection**: Everything relies on global imports
5. **Mixed Responsibilities**: Controllers handling business logic and socket emissions

## Task Priority Matrix

### Phase 1: Critical Foundation (Week 1-2)
| Task | Impact | Effort | Files Affected |
|------|--------|--------|---------------|
| 01. Event Bus Abstraction | HIGH | 3 days | 15+ files |
| 02. Repository Pattern | HIGH | 5 days | 100+ files |
| 03. Dependency Injection | HIGH | 2 days | All services |

### Phase 2: Core Improvements (Week 3-4)
| Task | Impact | Effort | Files Affected |
|------|--------|--------|---------------|
| 04. External API Adapters | MEDIUM | 3 days | 10+ files |
| 05. Controller Refactoring | MEDIUM | 3 days | 35+ files |
| 06. Console to Logger | MEDIUM | 1 day | 50+ files |

### Phase 3: Architecture Enhancement (Week 5-6)
| Task | Impact | Effort | Files Affected |
|------|--------|--------|---------------|
| 07. Service Layer Decoupling | HIGH | 4 days | 40+ services |
| 08. Database Abstraction | HIGH | 5 days | 100+ files |
| 09. Socket.io Decoupling | HIGH | 3 days | 7+ services |

### Phase 4: Quality & Testing (Week 7-8)
| Task | Impact | Effort | Files Affected |
|------|--------|--------|---------------|
| 10. Configuration Management | MEDIUM | 2 days | 20+ files |
| 11. Testing Infrastructure | HIGH | 5 days | New files |
| 12. Authorization Consolidation | MEDIUM | 2 days | 15+ files |

## Success Metrics
- [ ] Zero global exports from index.ts
- [ ] All database queries through repositories
- [ ] 100% services with constructor injection
- [ ] Zero console statements in production code
- [ ] 80%+ unit test coverage for services
- [ ] All external APIs abstracted

## Risk Mitigation
1. **Incremental Refactoring**: Each task can be completed independently
2. **Backward Compatibility**: Maintain existing APIs during transition
3. **Feature Flags**: Use environment variables to toggle new patterns
4. **Testing First**: Write tests before refactoring critical paths

## Quick Wins (Can do today)
1. Remove `export { io }` from index.ts
2. Create EventBus interface and implementation
3. Replace console.log in 10 most critical files
4. Create first repository for Roster model

## Long-term Vision
Transform the codebase into a clean, hexagonal architecture:
```
    Controllers (HTTP/Socket)
            ↓
    Application Services
            ↓
    Domain Services
            ↓
    Repositories (Data Access)
            ↓
    Database/External APIs
```

## File Organization
```
CODE_REVIEW_BACKEND_DECOUPLING_11_14/
├── 00_MASTER_OVERVIEW.md (this file)
├── 01_EVENT_BUS_ABSTRACTION.md
├── 02_REPOSITORY_PATTERN.md
├── 03_DEPENDENCY_INJECTION.md
├── 04_EXTERNAL_API_ADAPTERS.md
├── 05_CONTROLLER_REFACTORING.md
├── 06_CONSOLE_TO_LOGGER.md
├── 07_SERVICE_LAYER_DECOUPLING.md
├── 08_DATABASE_ABSTRACTION.md
├── 09_SOCKET_IO_DECOUPLING.md
├── 10_CONFIGURATION_MANAGEMENT.md
├── 11_TESTING_INFRASTRUCTURE.md
└── 12_AUTHORIZATION_CONSOLIDATION.md
```

## Tracking Progress
Each task document includes:
- Current state analysis
- Detailed subtasks with checkboxes
- Code examples (before/after)
- File-by-file migration checklist
- Testing requirements
- Rollback plan

## Estimated Total Effort
- **Minimum (Critical only)**: 2 weeks
- **Recommended (Phase 1-2)**: 4 weeks
- **Complete (All phases)**: 8 weeks

## Next Steps
1. Review and approve task prioritization
2. Start with Task 01: Event Bus Abstraction
3. Set up feature flags for gradual rollout
4. Create branch: `decoupling-phase-1`