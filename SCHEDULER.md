# Background Score Scheduler

## Overview

The score scheduler automatically updates live scores for all active leagues during NFL games. It uses **intelligent game detection** via the Sleeper API to determine when games are live, eliminating the need for hardcoded time windows.

## How It Works

The scheduler checks every 10 minutes (24/7) to see if there are live or upcoming NFL games:

### Smart Detection
- **Checks actual NFL schedule** via Sleeper GraphQL API
- **Detects in-progress games** (currently playing)
- **Detects upcoming games** (starting within the next hour)
- **Updates only when needed** (no wasted API calls when games aren't on)

### Supports All Game Times
- ✅ **Thursday Night Football** (typically 8:15pm ET)
- ✅ **Saturday games** (late season, 1pm/4pm/8pm ET)
- ✅ **Sunday games** (1pm, 4pm, 8:20pm ET)
- ✅ **Monday Night Football** (8:15pm ET)
- ✅ **International games** (9:30am ET London, others)
- ✅ **Any special scheduling** (flexed games, holidays, etc.)

## What It Does

For each scheduled check (every 10 minutes), the system:

1. **Checks NFL Schedule** - Queries Sleeper API for current week's game status
2. **Identifies Live Games** - Looks for in-progress or soon-to-start games
3. **Skips if No Games** - If no live games, exits early (efficient!)
4. **Syncs Stats** - If games are live, fetches latest player stats from Sleeper
5. **Updates Scores** - Recalculates all matchup scores for all active leagues
6. **Finalizes Weeks** - Automatically finalizes and locks records when all games complete

## Performance

- **Smart skipping**: Only updates when games are actually live (saves API calls)
- **Efficient batching**: Updates all active leagues in a single run
- **Shared stat sync**: Fetches stats once per week, used by all leagues
- **Non-blocking**: Runs in background without blocking user requests
- **Error resilient**: One league failure won't stop others

## Example Behavior

### Tuesday 2:00 PM (No Games)
```
[Scheduler] Checking for live games...
[Scheduler] No live games for week 8, skipping update
```
*No API calls made to Sleeper, no database updates - efficient!*

### Sunday 1:00 PM (Games Live)
```
[Scheduler] Checking for live games...
[Scheduler] Live games detected for week 8, updating 5 leagues...
[Scheduler] Syncing stats for 2025 week 8...
[Scheduler] Updating league 19 week 8...
[Scheduler] Score update completed in 1823ms for 5 leagues
```
*Scores updated every 10 minutes while games are in progress*

### Sunday 11:45 AM (Game Starting Soon)
```
[Scheduler] Checking for live games...
[Scheduler] Live games detected for week 8, updating 5 leagues...
```
*Starts updating 1 hour before kickoff to ensure scores are ready*

## Configuration

The scheduler is configured in `src/services/scoreScheduler.ts`:

- **Check interval**: Every 10 minutes (`*/10 * * * *`)
- **Live game window**: 1 hour before kickoff
- **Week calculation**: Based on first Thursday of September
- **Game detection**: Via Sleeper GraphQL schedule API

## Manual Updates

Users can still trigger manual updates from the UI by:
- Refreshing the matchups page
- Using the "force_update=true" query parameter

## Monitoring

The scheduler logs all activities:
- `[Scheduler]` prefix for all log messages
- Start/end times with duration
- Errors per league (non-fatal)
- Number of leagues updated

## Deployment

The scheduler starts automatically when the server starts:
- No additional configuration needed
- No separate dyno/process required
- Runs in the main app process
- Stops gracefully on server shutdown (SIGTERM/SIGINT)

## Cost

**FREE** - Runs in your existing Heroku dyno with no additional cost.

Unlike Heroku Scheduler (which requires a paid dyno for frequent runs), this runs within your main application process.
