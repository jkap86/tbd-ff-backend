# Background Score Scheduler

## Overview

The score scheduler automatically updates live scores for all active leagues during NFL game times. This ensures scores stay current even when no users are actively viewing the app.

## Schedule

The scheduler runs at the following times (all in UTC):

### Sunday (Game Day)
- **Every 10 minutes** all day Sunday
- Covers early games (1pm ET), late games (4pm ET), and Sunday Night Football

### Monday
- **Every 10 minutes** from midnight-4am UTC
- Covers Monday Night Football (8pm ET start)

### Thursday
- **Every 10 minutes** from midnight-4am UTC
- Covers Thursday Night Football (8pm ET start)

### Tuesday
- **Once at 9am UTC** (4am ET)
- Final update to catch any late stat corrections from Monday night

## What It Does

For each scheduled run, the system:

1. **Identifies Active Leagues** - Finds all leagues in the current NFL season
2. **Syncs Stats** - Fetches latest player stats from Sleeper API
3. **Updates Scores** - Recalculates all matchup scores based on updated stats
4. **Finalizes Weeks** - Automatically finalizes and locks records when all games are complete

## Performance

- Updates all active leagues in a single batch (efficient)
- Shares stat sync across leagues (only fetches stats once per week)
- Runs in background without blocking API requests
- Gracefully handles errors (one league failure won't stop others)

## Configuration

The scheduler is configured in `src/services/scoreScheduler.ts`:

- `UPDATE_INTERVAL`: Not used for scheduled updates (only for on-demand)
- Cron schedules: Defined in `startScoreScheduler()`
- Week calculation: Based on first Thursday of September

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
