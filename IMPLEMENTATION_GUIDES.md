# Implementation Guides for Remaining Refactoring Tasks

## Guide 1: Refactor draftController to use draftPickService

**File:** `src/controllers/draftController.ts`
**Current:** 1,883 lines
**Estimated Time:** 3-4 hours
**Priority:** HIGH

### Steps

1. **Update makeDraftPickHandler** (lines 893-1365)
   ```typescript
   import { createDraftPick, completeDraft } from '../services/draftPickService';

   // Replace lines 899-1273 with:
   try {
     await client.query('BEGIN');

     const { draftId } = req.params;
     const { roster_id, player_id, is_auto_pick = false } = req.body;

     if (!roster_id || !player_id) {
       await client.query('ROLLBACK');
       return res.status(400).json({ success: false, message: "roster_id and player_id are required" });
     }

     // Use service for pick creation
     const result = await createDraftPick(client, {
       draftId: parseInt(draftId),
       rosterId: roster_id,
       playerId: player_id,
       isAutoPick: is_auto_pick,
       userId: req.user?.userId,
     });

     // Commit transaction
     await client.query('COMMIT');

     // Handle draft completion outside transaction
     if (result.isComplete) {
       const updatedDraft = await completeDraft(parseInt(draftId), result.updatedDraft.league_id);
       result.updatedDraft = updatedDraft;

       // Stop timers and monitoring
       stopTimerBroadcast(parseInt(draftId));
       stopAutoPickMonitoring(parseInt(draftId));

       // Emit completion
       emitDraftStatusChange(io, parseInt(draftId), "completed", updatedDraft);
     }

     // Get player details for response (existing code lines 1276-1294)
     // ... keep existing player/roster detail fetching

     // Emit pick via WebSocket (existing code lines 1303-1333)
     // ... keep existing socket emission

     // Send response (existing code lines 1338-1353)
     // ... keep existing response logic
   } catch (error: any) {
     await client.query('ROLLBACK');
     // ... existing error handling
   }
   ```

2. **Test the changes**
   - Test normal pick flow
   - Test draft completion
   - Test error cases (invalid pick, wrong turn, etc.)
   - Test chess timer updates
   - Verify socket emissions work

3. **Expected outcome**
   - ~300 lines of business logic moved to service
   - Controller focuses on HTTP/WebSocket concerns
   - Easier to test pick logic independently

---

## Guide 2: Extract Widget from league_details_screen

**File:** `flutter_app/lib/screens/league_details_screen.dart`
**Current:** 3,405 lines (CRITICAL)
**Estimated Time:** 8-12 hours
**Priority:** CRITICAL

### Phase 1: Extract Settings Section (2-3 hours)

1. **Create** `lib/widgets/league_settings/league_settings_section.dart`
   - Extract lines ~500-900 (settings display section)
   - Move to StatelessWidget with League parameter
   - Include: basic settings, scoring settings, roster positions

2. **Create** `lib/widgets/league_settings/league_settings_card.dart`
   - Reusable card widget for each settings group
   - Parameters: title, children widgets

3. **Update league_details_screen.dart**
   - Import LeagueSettingsSection
   - Replace extracted code with widget call
   - Pass league data as parameter

### Phase 2: Extract Roster Display (2-3 hours)

1. **Create** `lib/widgets/league/roster_list_section.dart`
   - Extract roster display logic
   - Show team names, records, points
   - Handle tap navigation to roster details

2. **Create** `lib/widgets/league/roster_card.dart`
   - Individual roster display card
   - Show avatar, team name, record, stats

3. **Update main screen**
   - Replace roster display with RosterListSection widget

### Phase 3: Extract Matchup/Scoring Display (2-3 hours)

1. **Create** `lib/widgets/league/matchup_display_section.dart`
   - Current week matchups
   - Scores and results

2. **Create** `lib/widgets/league/standings_section.dart`
   - League standings table
   - Sortable columns

3. **Update main screen**

### Phase 4: Create Provider (2-3 hours)

1. **Create** `lib/providers/league_details_provider.dart`
   ```dart
   class LeagueDetailsProvider extends ChangeNotifier {
     League? _league;
     List<Roster> _rosters = [];
     List<Matchup> _matchups = [];
     bool _isLoading = false;
     String? _error;

     // Getters
     League? get league => _league;
     List<Roster> get rosters => _rosters;
     // ... other getters

     // Methods
     Future<void> loadLeague(int leagueId) async {
       _isLoading = true;
       notifyListeners();

       try {
         // Load league data
         _league = await LeagueService().getLeague(leagueId);
         _rosters = await RosterService().getLeagueRosters(leagueId);
         _error = null;
       } catch (e) {
         _error = e.toString();
       } finally {
         _isLoading = false;
         notifyListeners();
       }
     }

     Future<void> updateSettings(Map<String, dynamic> settings) async {
       // Update logic
     }
   }
   ```

2. **Update league_details_screen.dart**
   - Wrap with ChangeNotifierProvider
   - Use Consumer widgets
   - Remove setState calls
   - Move business logic to provider

### Expected Outcome
- Screen reduced from 3,405 to ~800-1,000 lines
- 4-6 new widget files created
- 1 provider created
- Better separation of concerns
- Improved testability

---

## Guide 3: Extract draggable_chat_widget Components

**File:** `flutter_app/lib/widgets/draggable_chat_widget.dart`
**Current:** 2,326 lines (CRITICAL)
**Estimated Time:** 6-8 hours
**Priority:** HIGH

### Phase 1: Extract Chat Message List (1-2 hours)

1. **Create** `lib/widgets/chat/chat_message_list.dart`
   - Extract message list building logic
   - Parameters: messages, scrollController, userId
   - Handle message filtering and search

2. **Create** `lib/widgets/chat/chat_search_bar.dart`
   - Extract search functionality
   - Filter controls

### Phase 2: Create ChatProvider (2-3 hours)

1. **Create** `lib/providers/chat_provider.dart`
   ```dart
   class ChatProvider extends ChangeNotifier {
     final int leagueId;
     final LeagueChatService _chatService;
     final SocketService _socketService;

     List<LeagueChatMessage> _messages = [];
     bool _isLoading = false;
     int _unreadCount = 0;
     String _searchQuery = '';

     ChatProvider(this.leagueId) {
       _initSocket();
       loadMessages();
     }

     Future<void> loadMessages() async {
       _isLoading = true;
       notifyListeners();

       try {
         _messages = await _chatService.getMessages(leagueId);
       } finally {
         _isLoading = false;
         notifyListeners();
       }
     }

     Future<void> sendMessage(String text) async {
       await _chatService.sendMessage(leagueId, text);
     }

     void setSearchQuery(String query) {
       _searchQuery = query;
       notifyListeners();
     }

     List<LeagueChatMessage> get filteredMessages {
       if (_searchQuery.isEmpty) return _messages;
       return _messages.where((m) =>
         m.message.toLowerCase().contains(_searchQuery.toLowerCase())
       ).toList();
     }
   }
   ```

### Phase 3: Simplify DraggableChatWidget (2-3 hours)

1. **Update widget to use provider**
   - Wrap with ChangeNotifierProvider
   - Remove state management logic
   - Focus on UI and draggable behavior only

2. **Split into files**
   - Keep draggable wrapper in main file (~300 lines)
   - Extract chat content to ChatContent widget (~400 lines)
   - Extract message input to ChatInput widget (~100 lines)

### Expected Outcome
- Main widget reduced from 2,326 to ~800 lines
- 5-7 new widget files created
- 1 provider created
- Testable chat logic
- Reusable chat components

---

## Guide 4: Add Structured Logging with Winston

**Priority:** MEDIUM
**Estimated Time:** 4-6 hours
**Impact:** Replaces 954 console.log statements

### Steps

1. **Install Winston** (5 minutes)
   ```bash
   cd backend
   npm install winston winston-daily-rotate-file
   ```

2. **Create Logger Service** (30 minutes)

   **File:** `src/services/logger.ts`
   ```typescript
   import winston from 'winston';
   import DailyRotateFile from 'winston-daily-rotate-file';

   const logFormat = winston.format.combine(
     winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
     winston.format.errors({ stack: true }),
     winston.format.splat(),
     winston.format.json()
   );

   const consoleFormat = winston.format.combine(
     winston.format.colorize(),
     winston.format.timestamp({ format: 'HH:mm:ss' }),
     winston.format.printf(({ timestamp, level, message, ...meta }) => {
       const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
       return `${timestamp} [${level}]: ${message} ${metaStr}`;
     })
   );

   export const logger = winston.createLogger({
     level: process.env.LOG_LEVEL || 'info',
     format: logFormat,
     transports: [
       // Console transport
       new winston.transports.Console({
         format: consoleFormat,
       }),
       // File transport for errors
       new DailyRotateFile({
         filename: 'logs/error-%DATE%.log',
         datePattern: 'YYYY-MM-DD',
         level: 'error',
         maxSize: '20m',
         maxFiles: '14d',
       }),
       // File transport for all logs
       new DailyRotateFile({
         filename: 'logs/combined-%DATE%.log',
         datePattern: 'YYYY-MM-DD',
         maxSize: '20m',
         maxFiles: '14d',
       }),
     ],
   });

   // Helper functions for common logging patterns
   export const logApiRequest = (method: string, path: string, userId?: number) => {
     logger.info('API Request', { method, path, userId });
   };

   export const logApiResponse = (method: string, path: string, statusCode: number, duration: number) => {
     logger.info('API Response', { method, path, statusCode, duration });
   };

   export const logDraftAction = (action: string, draftId: number, details: any) => {
     logger.info('Draft Action', { action, draftId, ...details });
   };

   export const logDatabaseError = (operation: string, error: Error, query?: string) => {
     logger.error('Database Error', { operation, error: error.message, stack: error.stack, query });
   };
   ```

3. **Replace console.log in Controllers** (3-4 hours)

   **Priority files** (by console.log count):
   - draftController.ts: Replace ~200 console.log statements
   - auctionController.ts: Replace ~150 console.log statements
   - auctionSocket.ts: Replace ~100 console.log statements

   **Pattern:**
   ```typescript
   // Before:
   console.log(`[MakePick] Request started - draftId: ${draftId}, rosterId: ${roster_id}`);
   console.error(`[MakePick] Error:`, error);

   // After:
   import { logger, logDraftAction } from '../services/logger';

   logDraftAction('pick_started', parseInt(draftId), { rosterId: roster_id, playerId: player_id });
   logger.error('Pick creation failed', { draftId, rosterId: roster_id, error: error.message, stack: error.stack });
   ```

4. **Add .gitignore entry** (1 minute)
   ```
   logs/
   *.log
   ```

5. **Update package.json scripts** (2 minutes)
   ```json
   {
     "scripts": {
       "logs:error": "tail -f logs/error-$(date +%Y-%m-%D).log",
       "logs:all": "tail -f logs/combined-$(date +%Y-%m-%D).log",
       "logs:clean": "rm -rf logs/*.log"
     }
   }
   ```

### Benefits
- Structured, searchable logs
- Log rotation (prevents disk space issues)
- Different log levels (debug, info, warn, error)
- Better production debugging
- Performance monitoring (request duration)

---

## Guide 5: Reduce TypeScript 'any' Usage

**Current:** 391 'any' usages
**Priority:** MEDIUM
**Estimated Time:** 8-12 hours (spread across multiple sessions)

### Phase 1: Replace with Error Types (2-3 hours)

**Files:** All controllers and error handling

```typescript
// Before:
catch (error: any) {
  res.status(500).json({ error: error.message });
}

// After:
import { AppError, getErrorMessage, getErrorStatusCode } from '../types/errors';

catch (error: unknown) {
  const message = getErrorMessage(error);
  const statusCode = getErrorStatusCode(error);
  res.status(statusCode).json({ error: message });
}
```

**Priority files:**
1. BaseController.ts - 20 instances
2. draftController.ts - 80+ instances
3. auctionController.ts - 60+ instances

### Phase 2: Add Model Types (2-3 hours)

**Files:** models/ directory

```typescript
// Before:
export async function getDraftOrder(draftId: number): Promise<any[]> {

// After:
import { DraftOrder } from '../types/draft';

export async function getDraftOrder(draftId: number): Promise<DraftOrder[]> {
```

Create type files:
- src/types/draft.ts
- src/types/auction.ts
- src/types/league.ts
- src/types/player.ts
- src/types/matchup.ts

### Phase 3: Add Request/Response Types (2-3 hours)

**Files:** All controllers

```typescript
// Before:
async function handler(req: Request, res: Response): Promise<any> {

// After:
interface DraftPickRequest {
  roster_id: number;
  player_id: number;
  is_auto_pick?: boolean;
}

interface DraftPickResponse {
  success: boolean;
  data?: {
    pick: DraftPick;
    draft: Draft;
  };
  error?: string;
}

async function handler(req: Request, res: Response): Promise<void> {
  const body = req.body as DraftPickRequest;
  const response: DraftPickResponse = { success: true };
  // ... implementation
  res.json(response);
}
```

### Phase 4: Add Database Result Types (2-3 hours)

```typescript
// Before:
const result: any = await pool.query('SELECT * FROM drafts WHERE id = $1', [id]);

// After:
import { QueryResult } from 'pg';
import { Draft } from '../types/draft';

const result: QueryResult<Draft> = await pool.query(
  'SELECT * FROM drafts WHERE id = $1',
  [id]
);
const draft: Draft | undefined = result.rows[0];
```

### Priority Order
1. Error handling (use existing error types)
2. Model return types
3. Request/Response interfaces
4. Database result types

---

## General Best Practices

### When Extracting Widgets
1. Start with self-contained sections (no external state dependencies)
2. Pass data as parameters, not through global state
3. Use callbacks for actions (onTap, onChanged, etc.)
4. Extract constants to separate const files
5. Move > 200 lines to separate files
6. Keep widget files focused on one concern

### When Creating Services
1. Accept dependencies as parameters (PoolClient, userId, etc.)
2. Return typed results, not 'any'
3. Throw custom errors (AppError subclasses)
4. Keep services stateless
5. Make services testable (dependency injection)
6. Document expected behavior and edge cases

### When Creating Providers
1. Extend ChangeNotifier
2. Make properties private with public getters
3. Call notifyListeners() after state changes
4. Handle loading and error states
5. Implement dispose() to clean up resources
6. Keep business logic in providers, not widgets

### When Refactoring
1. Make one change at a time
2. Test after each change
3. Commit frequently with clear messages
4. Keep old code temporarily (comment out, don't delete)
5. Update tests alongside code changes
6. Document breaking changes

---

**Remember:** These are guides, not strict requirements. Adapt as needed based on actual code structure and dependencies. Always test thoroughly after refactoring!
