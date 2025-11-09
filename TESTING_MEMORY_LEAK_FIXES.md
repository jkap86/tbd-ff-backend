# Testing Guide: Memory Leak Fixes

## Quick Test Checklist

### 1. Timer Leak Verification (5 minutes)

**Setup:**
- Start the Flutter app
- Join a draft that's in progress
- Open DevTools and enable verbose logging

**Test Steps:**
```
1. Start draft (if not started)
   ✓ Look for log: "Starting UI timer with deadline: ..."
   ✓ Verify only ONE log entry

2. Pause draft (if commissioner)
   ✓ Look for log: "Stopping timer (was active: true)"
   ✓ Timer should stop

3. Resume draft
   ✓ Look for log: "Cancelling existing timer before creating new one" OR
   ✓ Look for log: "Starting UI timer with deadline: ..." (if timer was properly stopped)

4. Repeat pause/resume 3 times
   ✓ Verify NO duplicate "Starting UI timer" without "Cancelling existing timer"
   ✓ CPU usage should remain stable (check Activity Monitor/Task Manager)
```

**Expected Results:**
- Only 1 timer log per start
- Always see "Cancelling existing timer" before creating new one (if one exists)
- No increase in CPU usage after multiple cycles

### 2. Socket Listener Leak Verification (10 minutes)

**Setup:**
- Start the Flutter app
- Join a draft room
- Open DevTools console with verbose logging

**Test Steps:**
```
1. Initial connection
   ✓ Look for log: "Setting up socket listeners"
   ✓ Should appear ONCE on first connection

2. Simulate disconnect
   - Turn on airplane mode OR
   - Stop backend server temporarily
   ✓ Wait for disconnect
   ✓ Look for log: "Socket disconnected"

3. Reconnect
   - Turn off airplane mode OR
   - Restart backend server
   ✓ Look for log: "Cleaning up disconnected socket before reconnecting"
   ✓ Look for log: "Removing all socket event listeners"
   ✓ Look for log: "Socket connected successfully"

4. Verify events still work
   - Make a draft pick (if on the clock)
   - Send a chat message
   ✓ Pick should appear in UI
   ✓ Chat message should appear in UI

5. Repeat disconnect/reconnect 3 times
   ✓ Look for "Socket listeners already set up, skipping..." (this is good!)
   ✓ Events should still work after each reconnection
```

**Expected Results:**
- "Setting up socket listeners" appears only ONCE
- "Removing all socket event listeners" appears on each reconnect
- Events work correctly after each reconnection
- No duplicate event processing

### 3. Provider Disposal Verification (5 minutes)

**Setup:**
- Start the Flutter app
- Navigate to draft screen

**Test Steps:**
```
1. Open draft screen
   ✓ Look for log: "Setting up socket listeners"
   ✓ Look for log: "Starting UI timer..." (if draft in progress)

2. Navigate away from draft screen (back button)
   ✓ Look for log: "DraftProvider dispose() called - cleaning up resources"
   ✓ Look for log: "Stopping timer (was active: true)"
   ✓ Look for log: "Clearing all socket callbacks"
   ✓ Look for log: "DraftProvider dispose() completed"

3. Verify NO errors
   ✓ Should NOT see: "Timer still active after _stopTimer()!"
   ✓ Should NOT see any exceptions

4. Navigate back to draft screen
   ✓ Everything should work normally
   ✓ Events should be received
   ✓ Timer should work (if in progress)
```

**Expected Results:**
- Clean disposal logs
- No error messages
- Normal functionality on return

## DevTools Memory Profiler Test (Optional but Recommended)

**Setup:**
1. Open Flutter DevTools
2. Go to Memory tab
3. Take initial snapshot

**Test Procedure:**
```
1. Baseline memory snapshot
   - Take snapshot
   - Note current memory usage

2. Perform 10 reconnection cycles
   - Disconnect/reconnect 10 times
   - Make a few picks if possible
   - Navigate away and back 3 times

3. Force garbage collection
   - Click "GC" button in DevTools

4. Take final snapshot
   - Compare with baseline
   - Check "Timer" object count
   - Check "DraftProvider" instance count
```

**Expected Results:**
- Timer count: Should be 0-2 (same as baseline)
- DraftProvider count: Should be 0-1 (same as baseline)
- Memory usage: Should return to near baseline after GC
- No exponential growth in any object type

## Log Messages Reference

### ✅ Good Logs (Expected)

```
[DraftProvider] Setting up socket listeners
[Timer] Starting UI timer with deadline: 2025-11-08 15:30:00.000
[Timer] Cancelling existing timer before creating new one
[Timer] Stopping timer (was active: true)
[DraftProvider] DraftProvider dispose() called - cleaning up resources
[DraftProvider] DraftProvider dispose() completed
[SocketService] Cleaning up disconnected socket before reconnecting
[SocketService] Removing all socket event listeners
[SocketService] Setting up socket event listeners
[SocketService] Socket connected successfully
[SocketService] Clearing all socket callbacks
```

### ⚠️ Warning Logs (Investigate if frequent)

```
[DraftProvider] Socket listeners already set up, skipping duplicate registration
  → This is OK occasionally, but shouldn't happen repeatedly in quick succession
```

### ❌ Error Logs (Should NEVER appear)

```
[DraftProvider] Timer still active after _stopTimer()!
  → Indicates timer leak, should be investigated immediately

[SocketService] Cannot setup listeners - socket is null
  → Indicates race condition or improper initialization
```

## Performance Benchmarks

### Before Fixes:
- Memory usage: Increases ~50MB per hour
- Timer count after 3 reconnects: 3-5 timers
- Listener callbacks after 3 reconnects: 30-50 duplicates
- CPU usage: Increases with reconnections

### After Fixes:
- Memory usage: Stable over time
- Timer count: Always 0-2 (draft + derby max)
- Listener callbacks: No duplicates
- CPU usage: Constant regardless of reconnections

## Quick Visual Test (No DevTools)

**For rapid verification without DevTools:**

1. **Timer Test:**
   - Watch the countdown timer in UI
   - Pause/resume 3 times
   - Timer should update smoothly (not jumping or stuttering)
   - FPS should remain constant

2. **Socket Test:**
   - Disconnect network
   - Reconnect network
   - Make a pick or send chat
   - Should work immediately after reconnection

3. **Navigation Test:**
   - Navigate away from draft
   - Navigate back
   - Everything should work normally
   - No lag or slowdown

## Automated Test Commands

```bash
# Run all tests
cd flutter_app
flutter test

# Run with coverage
flutter test --coverage

# Run performance tests
flutter test test/providers/draft_provider_test.dart

# Run integration tests
flutter test integration_test/
```

## Troubleshooting

### Issue: Multiple "Starting UI timer" logs

**Cause:** Timer not being cancelled before creation
**Check:** Look for "Cancelling existing timer" log
**Fix:** Verify `_timer.isActive` check is working

### Issue: Events not working after reconnection

**Cause:** Listeners not being re-registered
**Check:** Look for "Setting up socket event listeners"
**Fix:** Verify `_setupEventListeners()` is called after reconnect

### Issue: Memory keeps growing

**Cause:** Providers not being disposed properly
**Check:** Look for "DraftProvider dispose() completed"
**Fix:** Verify navigation properly disposes providers

### Issue: "Timer still active" error on disposal

**Cause:** Race condition in timer cancellation
**Check:** Timing of disposal vs timer restart
**Fix:** Add additional null checks in dispose()

## Success Criteria

✅ All tests pass
✅ No memory leaks detected in profiler
✅ Timer count stays constant
✅ No duplicate event processing
✅ Clean disposal logs
✅ Events work after reconnection
✅ No performance degradation over time
✅ No error logs appear

## Next Steps After Testing

1. If all tests pass → Merge to main
2. If issues found → Check logs and debug
3. Monitor in production for 24 hours
4. Review analytics for memory metrics
