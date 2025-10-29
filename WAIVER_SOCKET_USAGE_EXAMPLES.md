# Waiver Socket Usage Examples

This document provides concrete examples of how to integrate the waiver socket events into your waiver services.

---

## Example 1: Submit Waiver Claim

**File:** `src/controllers/waiverController.ts` or `src/services/waiverService.ts`

```typescript
import { Request, Response } from "express";
import { io } from "../index";
import { emitClaimSubmitted } from "../socket/waiverSocket";
import { createWaiverClaim, getWaiverClaimById } from "../models/WaiverClaim";

export async function submitWaiverClaim(req: Request, res: Response) {
  try {
    const { league_id, roster_id, player_id, drop_player_id } = req.body;

    // Validate input...
    // Check league settings...
    // Check roster eligibility...

    // Create the waiver claim
    const claim = await createWaiverClaim({
      league_id,
      roster_id,
      player_id,
      drop_player_id,
      priority: 1, // Calculate based on current priority
      status: "pending",
    });

    // ✅ Emit socket event to all users in the league
    emitClaimSubmitted(io, league_id, claim);

    res.status(201).json({
      success: true,
      message: "Waiver claim submitted successfully",
      data: claim,
    });
  } catch (error) {
    console.error("Error submitting waiver claim:", error);
    res.status(500).json({
      success: false,
      message: "Error submitting waiver claim",
    });
  }
}
```

---

## Example 2: Cancel Waiver Claim

**File:** `src/controllers/waiverController.ts`

```typescript
import { Request, Response } from "express";
import { io } from "../index";
import { emitClaimCancelled } from "../socket/waiverSocket";
import { deleteWaiverClaim, getWaiverClaimById } from "../models/WaiverClaim";

export async function cancelWaiverClaim(req: Request, res: Response) {
  try {
    const { claim_id } = req.params;

    // Get the claim before deleting (to get league_id and roster_id)
    const claim = await getWaiverClaimById(parseInt(claim_id));

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: "Waiver claim not found",
      });
    }

    // Verify user owns this claim...
    // Check if claim is still pending...

    // Delete the claim
    await deleteWaiverClaim(parseInt(claim_id));

    // ✅ Emit socket event to notify all users
    emitClaimCancelled(io, claim.league_id, claim.id, claim.roster_id);

    res.status(200).json({
      success: true,
      message: "Waiver claim cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling waiver claim:", error);
    res.status(500).json({
      success: false,
      message: "Error cancelling waiver claim",
    });
  }
}
```

---

## Example 3: Process Waivers (Scheduled Job)

**File:** `src/services/waiverProcessingService.ts`

```typescript
import { io } from "../index";
import {
  emitWaiversProcessing,
  emitWaiversProcessed,
  emitWaiverPriorityChanged,
} from "../socket/waiverSocket";
import {
  getPendingClaimsByLeague,
  updateWaiverClaimStatus,
} from "../models/WaiverClaim";
import { addPlayerToRoster, dropPlayerFromRoster } from "../models/Roster";

export async function processWaiversForLeague(leagueId: number) {
  console.log(`Starting waiver processing for league ${leagueId}`);

  // ✅ Notify users that processing has started
  emitWaiversProcessing(io, leagueId);

  const successful: any[] = [];
  const failed: any[] = [];

  try {
    // Get all pending claims, ordered by priority
    const claims = await getPendingClaimsByLeague(leagueId);

    // Process each claim in priority order
    for (const claim of claims) {
      try {
        // Check if player is still available
        const playerAvailable = await isPlayerAvailable(claim.player_id, leagueId);

        if (!playerAvailable) {
          // Player was claimed by higher priority
          await updateWaiverClaimStatus(claim.id, "failed");
          failed.push({ ...claim, reason: "Player no longer available" });
          continue;
        }

        // Check roster space
        if (claim.drop_player_id) {
          // Drop player first
          await dropPlayerFromRoster(claim.roster_id, claim.drop_player_id);
        } else {
          const hasSpace = await checkRosterSpace(claim.roster_id);
          if (!hasSpace) {
            await updateWaiverClaimStatus(claim.id, "failed");
            failed.push({ ...claim, reason: "No roster space" });
            continue;
          }
        }

        // Add player to roster
        await addPlayerToRoster(claim.roster_id, claim.player_id);

        // Mark claim as successful
        await updateWaiverClaimStatus(claim.id, "successful");
        successful.push(claim);

        console.log(`Claim ${claim.id} processed successfully`);
      } catch (error) {
        console.error(`Error processing claim ${claim.id}:`, error);
        await updateWaiverClaimStatus(claim.id, "failed");
        failed.push({ ...claim, reason: "Processing error" });
      }
    }

    // Update waiver priorities (move successful claimants to end)
    const newPriorities = await updateWaiverPriorities(leagueId, successful);

    // ✅ Notify users of new waiver order
    emitWaiverPriorityChanged(io, leagueId, newPriorities);

    // ✅ Notify users that processing is complete
    emitWaiversProcessed(io, leagueId, { successful, failed });

    console.log(
      `Waiver processing complete for league ${leagueId}: ` +
      `${successful.length} successful, ${failed.length} failed`
    );

    return { successful, failed };
  } catch (error) {
    console.error(`Error processing waivers for league ${leagueId}:`, error);

    // Still emit completion event with error state
    emitWaiversProcessed(io, leagueId, { successful, failed });

    throw error;
  }
}

// Helper functions
async function isPlayerAvailable(playerId: number, leagueId: number): Promise<boolean> {
  // Check if player is on any roster in the league
  // Return true if available, false if owned
  // Implementation depends on your data model
  return true;
}

async function checkRosterSpace(rosterId: number): Promise<boolean> {
  // Check if roster has space for another player
  // Implementation depends on your league settings
  return true;
}

async function updateWaiverPriorities(
  leagueId: number,
  successfulClaims: any[]
): Promise<Array<{ roster_id: number; priority: number }>> {
  // Move successful claimants to the end of the waiver order
  // Return new priorities
  // Implementation depends on your waiver system (rolling vs. inverse standings)
  return [];
}
```

---

## Example 4: Free Agent Pickup

**File:** `src/controllers/freeAgentController.ts`

```typescript
import { Request, Response } from "express";
import { io } from "../index";
import { emitFreeAgentAdded } from "../socket/waiverSocket";
import { addPlayerToRoster } from "../models/Roster";
import { createTransaction } from "../models/Transaction";

export async function pickupFreeAgent(req: Request, res: Response) {
  try {
    const { league_id, roster_id, player_id } = req.body;

    // Verify player is a free agent
    const isAvailable = await isPlayerAvailable(player_id, league_id);
    if (!isAvailable) {
      return res.status(400).json({
        success: false,
        message: "Player is not available",
      });
    }

    // Check if waivers have cleared for this player
    const hasCleared = await hasPlayerClearedWaivers(player_id, league_id);
    if (!hasCleared) {
      return res.status(400).json({
        success: false,
        message: "Player is still on waivers",
      });
    }

    // Add player to roster
    await addPlayerToRoster(roster_id, player_id);

    // Create transaction record
    const transaction = await createTransaction({
      league_id,
      roster_id,
      player_id,
      transaction_type: "add",
      transaction_date: new Date(),
    });

    // ✅ Emit socket event to notify all users
    emitFreeAgentAdded(io, league_id, transaction);

    res.status(200).json({
      success: true,
      message: "Free agent picked up successfully",
      data: transaction,
    });
  } catch (error) {
    console.error("Error picking up free agent:", error);
    res.status(500).json({
      success: false,
      message: "Error picking up free agent",
    });
  }
}

async function isPlayerAvailable(playerId: number, leagueId: number): Promise<boolean> {
  // Check if player is on any roster
  return true;
}

async function hasPlayerClearedWaivers(playerId: number, leagueId: number): Promise<boolean> {
  // Check if player is past waiver period
  return true;
}
```

---

## Example 5: Drop Player

**File:** `src/controllers/rosterController.ts`

```typescript
import { Request, Response } from "express";
import { io } from "../index";
import { emitPlayerDropped } from "../socket/waiverSocket";
import { dropPlayerFromRoster } from "../models/Roster";
import { createTransaction } from "../models/Transaction";
import { getLeagueByRosterId } from "../models/League";

export async function dropPlayer(req: Request, res: Response) {
  try {
    const { roster_id, player_id } = req.body;

    // Verify player is on roster
    const isOnRoster = await isPlayerOnRoster(player_id, roster_id);
    if (!isOnRoster) {
      return res.status(400).json({
        success: false,
        message: "Player is not on this roster",
      });
    }

    // Get league_id for socket event
    const league = await getLeagueByRosterId(roster_id);

    // Drop player from roster
    await dropPlayerFromRoster(roster_id, player_id);

    // Create transaction record
    const transaction = await createTransaction({
      league_id: league.id,
      roster_id,
      player_id,
      transaction_type: "drop",
      transaction_date: new Date(),
    });

    // ✅ Emit socket event to notify all users
    emitPlayerDropped(io, league.id, transaction);

    res.status(200).json({
      success: true,
      message: "Player dropped successfully",
      data: transaction,
    });
  } catch (error) {
    console.error("Error dropping player:", error);
    res.status(500).json({
      success: false,
      message: "Error dropping player",
    });
  }
}

async function isPlayerOnRoster(playerId: number, rosterId: number): Promise<boolean> {
  // Check if player is on the roster
  return true;
}
```

---

## Example 6: Scheduled Waiver Processing (Cron Job)

**File:** `src/services/waiverScheduler.ts`

```typescript
import cron from "node-cron";
import { Server } from "socket.io";
import { getAllActiveLeagues } from "../models/League";
import { processWaiversForLeague } from "./waiverProcessingService";

let schedulerTask: cron.ScheduledTask | null = null;

/**
 * Start the waiver processing scheduler
 * Runs every day at 3:00 AM
 */
export function startWaiverScheduler(io: Server) {
  // Run at 3:00 AM every day
  schedulerTask = cron.schedule("0 3 * * *", async () => {
    console.log("Starting scheduled waiver processing...");

    try {
      // Get all active leagues
      const leagues = await getAllActiveLeagues();

      // Process waivers for each league
      for (const league of leagues) {
        try {
          await processWaiversForLeague(league.id);
        } catch (error) {
          console.error(`Error processing waivers for league ${league.id}:`, error);
          // Continue with other leagues even if one fails
        }
      }

      console.log("Scheduled waiver processing complete");
    } catch (error) {
      console.error("Error in waiver scheduler:", error);
    }
  });

  console.log("Waiver scheduler started (runs daily at 3:00 AM)");
}

/**
 * Stop the waiver processing scheduler
 */
export function stopWaiverScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log("Waiver scheduler stopped");
  }
}
```

**Then add to `src/index.ts`:**

```typescript
import { startWaiverScheduler, stopWaiverScheduler } from "./services/waiverScheduler";

// In the server start section:
httpServer.listen(PORT, () => {
  // ... existing code ...

  // Start waiver scheduler
  startWaiverScheduler(io);
});

// In the graceful shutdown sections:
process.on("SIGTERM", () => {
  stopWaiverScheduler();
  // ... existing shutdown code ...
});

process.on("SIGINT", () => {
  stopWaiverScheduler();
  // ... existing shutdown code ...
});
```

---

## Quick Reference: When to Use Each Emitter

| Event | When to Call | Function |
|-------|-------------|----------|
| `claim_submitted` | After creating waiver claim in DB | `emitClaimSubmitted(io, leagueId, claim)` |
| `claim_cancelled` | After deleting waiver claim from DB | `emitClaimCancelled(io, leagueId, claimId, rosterId)` |
| `waivers_processing` | At start of waiver processing job | `emitWaiversProcessing(io, leagueId)` |
| `waivers_processed` | After waiver processing completes | `emitWaiversProcessed(io, leagueId, results)` |
| `free_agent_added` | After adding free agent to roster | `emitFreeAgentAdded(io, leagueId, transaction)` |
| `player_dropped` | After dropping player from roster | `emitPlayerDropped(io, leagueId, transaction)` |
| `waiver_priority_changed` | After updating waiver priorities | `emitWaiverPriorityChanged(io, leagueId, priorities)` |

---

## Important Notes

1. **Always import `io` from "../index"** to use the same Socket.io server instance
2. **Always emit AFTER database operations succeed** - don't emit before saving to DB
3. **Include error handling** - socket emissions should not prevent the main operation from completing
4. **Use try/catch** around emissions in case socket server is unavailable
5. **Test in development** - use multiple browser tabs to verify real-time updates work

---

## Testing Checklist

- [ ] Waiver claim submitted → all users in league see it
- [ ] Waiver claim cancelled → claim disappears for all users
- [ ] Waivers processing → all users see "processing" status
- [ ] Waivers completed → all users see results and updated rosters
- [ ] Free agent pickup → all users see transaction
- [ ] Player drop → all users see transaction
- [ ] Multiple leagues → events only go to correct league
- [ ] Reconnection → users can rejoin and sync state

---

**Last Updated:** 2025-10-28
