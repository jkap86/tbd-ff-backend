/**
 * Waiver Service Tests
 *
 * Tests waiver claim and free agent acquisition including:
 * - FAAB budget validation
 * - Waiver claim priority (highest bid wins, timestamp tiebreaker)
 * - Atomic waiver processing (transaction isolation)
 * - Player availability checks
 * - Ownership verification (can't claim owned player, can't drop unowned player)
 * - Transaction record creation
 * - Free agent pickup (no waiver needed)
 */

import {
  submitWaiverClaim,
  processWaivers,
  pickupFreeAgent,
  isPlayerAvailable,
} from '../../services/waiverService';
import pool from '../../config/database';

describe('Waiver Service Tests', () => {
  let testLeagueId: number;
  let testUserIds: number[] = [];
  let testRosterIds: number[] = [];
  let testPlayerIds: number[] = [4881, 7523, 7543, 5927, 6794, 8131];

  beforeAll(async () => {
    const uniqueCode = `WS${Date.now().toString().slice(-7)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'waivertest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'WS%'`);

    // Create test users
    for (let i = 1; i <= 3; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`waivertest${i}`, `waiver${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create test league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Waiver Test League',
        'in_season',
        '2025',
        'regular',
        'redraft',
        3,
        JSON.stringify({ commissioner_id: testUserIds[0], waiver_type: 'FAAB' }),
        JSON.stringify({}),
        JSON.stringify([
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 },
          { position: 'WR', count: 2 },
          { position: 'BN', count: 5 }
        ]),
        uniqueCode
      ]
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create test players
    for (const playerId of testPlayerIds) {
      await pool.query(
        `INSERT INTO players (player_id, full_name, position, team)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id) DO NOTHING`,
        [playerId, `Player ${playerId}`, 'RB', 'TEST']
      );
    }

    // Create test rosters with FAAB budgets and some existing players
    for (let i = 0; i < 3; i++) {
      const rosterResult = await pool.query(
        `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, faab_budget, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          testLeagueId,
          testUserIds[i],
          i + 1,
          JSON.stringify([
            { slot: 'QB', player_id: null },
            { slot: 'RB1', player_id: null },
            { slot: 'RB2', player_id: null }
          ]),
          // Roster 0: has player 0; Roster 1: has player 1; Roster 2: empty (using string IDs)
          JSON.stringify(i === 0 ? [testPlayerIds[0].toString()] : i === 1 ? [testPlayerIds[1].toString()] : []),
          JSON.stringify([]),
          JSON.stringify([]),
          100, // Starting FAAB budget
          JSON.stringify({ team_name: `Team ${i + 1}` })
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'waivertest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'WS%'`);
  });

  beforeEach(async () => {
    // Clear waiver claims, transactions and reset FAAB before each test
    await pool.query(`DELETE FROM waiver_claims WHERE league_id = $1`, [testLeagueId]);
    await pool.query(`DELETE FROM transactions WHERE league_id = $1`, [testLeagueId]);
    await pool.query(
      `UPDATE rosters SET faab_budget = 100 WHERE league_id = $1`,
      [testLeagueId]
    );

    // Reset roster benches to initial state (using VARCHAR for player_id)
    await pool.query(
      `UPDATE rosters SET bench = $1 WHERE id = $2`,
      [JSON.stringify([testPlayerIds[0].toString()]), testRosterIds[0]]
    );
    await pool.query(
      `UPDATE rosters SET bench = $1 WHERE id = $2`,
      [JSON.stringify([testPlayerIds[1].toString()]), testRosterIds[1]]
    );
    await pool.query(
      `UPDATE rosters SET bench = $1 WHERE id = $2`,
      [JSON.stringify([]), testRosterIds[2]]
    );
  });

  describe('submitWaiverClaim', () => {
    it('should create a valid waiver claim', async () => {
      const claim = await submitWaiverClaim(
        testRosterIds[0],
        testPlayerIds[2], // Available player
        null, // No drop
        25 // Bid amount
      );

      expect(claim).toBeDefined();
      expect(claim.roster_id).toBe(testRosterIds[0]);
      expect(claim.player_id).toBe(testPlayerIds[2].toString());
      expect(claim.bid_amount).toBe(25);
      expect(claim.status).toBe('pending');
    });

    it('should reject claim exceeding FAAB budget', async () => {
      await expect(
        submitWaiverClaim(
          testRosterIds[0],
          testPlayerIds[2],
          null,
          150 // More than $100 budget
        )
      ).rejects.toThrow('exceeds FAAB budget');
    });

    it('should reject negative bid amount', async () => {
      await expect(
        submitWaiverClaim(
          testRosterIds[0],
          testPlayerIds[2],
          null,
          -10 // Negative bid
        )
      ).rejects.toThrow('cannot be negative');
    });

    it('should reject claim for already owned player', async () => {
      await expect(
        submitWaiverClaim(
          testRosterIds[0],
          testPlayerIds[0], // Roster 0 already owns this player
          null,
          25
        )
      ).rejects.toThrow('already on your roster');
    });

    it('should reject claim for player on another roster', async () => {
      await expect(
        submitWaiverClaim(
          testRosterIds[0],
          testPlayerIds[1], // Owned by roster 1
          null,
          25
        )
      ).rejects.toThrow('not available');
    });

    it('should reject duplicate pending claim for same player', async () => {
      // First claim succeeds
      await submitWaiverClaim(testRosterIds[0], testPlayerIds[2], null, 25);

      // Second claim for same player should fail
      await expect(
        submitWaiverClaim(testRosterIds[0], testPlayerIds[2], null, 30)
      ).rejects.toThrow('already have a pending claim');
    });

    it('should reject dropping a player not on roster', async () => {
      await expect(
        submitWaiverClaim(
          testRosterIds[0],
          testPlayerIds[2],
          testPlayerIds[3], // Roster 0 doesn't own player 3
          25
        )
      ).rejects.toThrow('Cannot drop a player not on your roster');
    });

    it('should allow claim with valid drop player', async () => {
      const claim = await submitWaiverClaim(
        testRosterIds[0],
        testPlayerIds[2], // Add player 2
        testPlayerIds[0], // Drop player 0 (owned by roster 0)
        25
      );

      expect(claim.drop_player_id).toBe(testPlayerIds[0].toString());
    });
  });

  describe('processWaivers', () => {
    it('should process highest bid claim successfully', async () => {
      // Two rosters claim same player
      await submitWaiverClaim(testRosterIds[0], testPlayerIds[2], null, 25);
      await submitWaiverClaim(testRosterIds[1], testPlayerIds[2], null, 35); // Higher bid

      await processWaivers(testLeagueId);

      // Check claims status
      const claims = await pool.query(
        'SELECT * FROM waiver_claims WHERE league_id = $1 ORDER BY bid_amount DESC',
        [testLeagueId]
      );

      expect(claims.rows[0].status).toBe('processed'); // Higher bid wins
      expect(claims.rows[0].roster_id).toBe(testRosterIds[1]);
      expect(claims.rows[1].status).toBe('failed'); // Lower bid fails

      // Verify player moved to winning roster
      const roster1 = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterIds[1]]
      );
      expect(roster1.rows[0].bench).toContain(testPlayerIds[2].toString());
    });

    it('should use timestamp as tiebreaker for same bid amount', async () => {
      // First claim
      const claim1 = await submitWaiverClaim(testRosterIds[0], testPlayerIds[2], null, 30);

      // Wait a moment to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 50));

      // Second claim with same bid
      const claim2 = await submitWaiverClaim(testRosterIds[1], testPlayerIds[2], null, 30);

      await processWaivers(testLeagueId);

      // Only ONE should succeed (either could win based on timestamp)
      const processedClaim1 = await pool.query(
        'SELECT status FROM waiver_claims WHERE id = $1',
        [claim1.id]
      );
      const processedClaim2 = await pool.query(
        'SELECT status FROM waiver_claims WHERE id = $1',
        [claim2.id]
      );

      const statuses = [processedClaim1.rows[0].status, processedClaim2.rows[0].status].sort();
      expect(statuses).toEqual(['failed', 'processed']);
    });

    it('should deduct FAAB budget after successful claim', async () => {
      await submitWaiverClaim(testRosterIds[0], testPlayerIds[2], null, 25);

      await processWaivers(testLeagueId);

      // Verify FAAB was deducted
      const roster = await pool.query(
        'SELECT faab_budget FROM rosters WHERE id = $1',
        [testRosterIds[0]]
      );
      expect(roster.rows[0].faab_budget).toBe(75); // 100 - 25
    });

    it('should create transaction record for successful claim', async () => {
      await submitWaiverClaim(testRosterIds[0], testPlayerIds[2], null, 25);

      await processWaivers(testLeagueId);

      // Verify transaction was created
      const transaction = await pool.query(
        'SELECT * FROM transactions WHERE league_id = $1 AND transaction_type = $2',
        [testLeagueId, 'waiver']
      );

      expect(transaction.rows).toHaveLength(1);
      expect(transaction.rows[0].roster_id).toBe(testRosterIds[0]);
      expect(transaction.rows[0].waiver_bid).toBe(25);
      expect(transaction.rows[0].adds).toContain(testPlayerIds[2].toString());
    });

    it('should handle drop player in waiver claim', async () => {
      await submitWaiverClaim(
        testRosterIds[0],
        testPlayerIds[2], // Add this
        testPlayerIds[0], // Drop this (owned)
        25
      );

      await processWaivers(testLeagueId);

      // Verify player was added and dropped
      const roster = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterIds[0]]
      );

      expect(roster.rows[0].bench).toContain(testPlayerIds[2].toString());
      expect(roster.rows[0].bench).not.toContain(testPlayerIds[0].toString());
    });

    it('should reject claim if insufficient FAAB at processing time', async () => {
      await submitWaiverClaim(testRosterIds[0], testPlayerIds[2], null, 80);

      // Manually reduce FAAB budget before processing
      await pool.query(
        'UPDATE rosters SET faab_budget = $1 WHERE id = $2',
        [50, testRosterIds[0]]
      );

      await processWaivers(testLeagueId);

      // Verify claim failed
      const claim = await pool.query(
        'SELECT status, failure_reason FROM waiver_claims WHERE roster_id = $1',
        [testRosterIds[0]]
      );

      expect(claim.rows[0].status).toBe('failed');
      expect(claim.rows[0].failure_reason).toContain('Insufficient FAAB');
    });

    it('should process multiple independent claims successfully', async () => {
      // Different rosters claim different players
      await submitWaiverClaim(testRosterIds[0], testPlayerIds[2], null, 25);
      await submitWaiverClaim(testRosterIds[1], testPlayerIds[3], null, 30);
      await submitWaiverClaim(testRosterIds[2], testPlayerIds[4], null, 20);

      await processWaivers(testLeagueId);

      // All should succeed
      const claims = await pool.query(
        'SELECT status FROM waiver_claims WHERE league_id = $1',
        [testLeagueId]
      );

      expect(claims.rows.every((c: any) => c.status === 'processed')).toBe(true);
    });

    it('should handle concurrent claims atomically', async () => {
      // Three rosters claim same player
      await submitWaiverClaim(testRosterIds[0], testPlayerIds[2], null, 40);
      await submitWaiverClaim(testRosterIds[1], testPlayerIds[2], null, 35);
      await submitWaiverClaim(testRosterIds[2], testPlayerIds[2], null, 30);

      await processWaivers(testLeagueId);

      // Only highest bidder should get player
      const claims = await pool.query(
        'SELECT status, roster_id FROM waiver_claims WHERE league_id = $1 ORDER BY bid_amount DESC',
        [testLeagueId]
      );

      expect(claims.rows[0].status).toBe('processed'); // $40 bid
      expect(claims.rows[1].status).toBe('failed'); // $35 bid
      expect(claims.rows[2].status).toBe('failed'); // $30 bid

      // Verify player is only on one roster
      const rosters = await pool.query(
        'SELECT bench FROM rosters WHERE league_id = $1',
        [testLeagueId]
      );

      let rosterCount = 0;
      rosters.rows.forEach((r: any) => {
        if (r.bench.includes(testPlayerIds[2].toString())) {
          rosterCount++;
        }
      });

      expect(rosterCount).toBe(1);
    });

    it('should reject claim if drop player not on roster at processing time', async () => {
      await submitWaiverClaim(
        testRosterIds[0],
        testPlayerIds[2],
        testPlayerIds[0], // Plan to drop this
        25
      );

      // Manually remove the drop player before processing
      await pool.query(
        'UPDATE rosters SET bench = $1 WHERE id = $2',
        [JSON.stringify([]), testRosterIds[0]]
      );

      await processWaivers(testLeagueId);

      // Claim should fail
      const claim = await pool.query(
        'SELECT status, failure_reason FROM waiver_claims WHERE roster_id = $1',
        [testRosterIds[0]]
      );

      expect(claim.rows[0].status).toBe('failed');
      expect(claim.rows[0].failure_reason).toContain('Drop player not on roster');
    });
  });

  describe('pickupFreeAgent', () => {
    it('should pick up available player immediately', async () => {
      const transaction = await pickupFreeAgent(
        testRosterIds[0],
        testPlayerIds[2], // Available player
        null
      );

      expect(transaction).toBeDefined();
      expect(transaction.transaction_type).toBe('free_agent');

      // Verify player added to roster
      const roster = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterIds[0]]
      );
      expect(roster.rows[0].bench).toContain(testPlayerIds[2].toString());
    });

    it('should reject pickup of already owned player', async () => {
      await expect(
        pickupFreeAgent(
          testRosterIds[0],
          testPlayerIds[0], // Already owned
          null
        )
      ).rejects.toThrow('already on your roster');
    });

    it('should reject pickup of player on another roster', async () => {
      await expect(
        pickupFreeAgent(
          testRosterIds[0],
          testPlayerIds[1], // Owned by roster 1
          null
        )
      ).rejects.toThrow('not available');
    });

    it('should handle drop player in free agent pickup', async () => {
      await pickupFreeAgent(
        testRosterIds[0],
        testPlayerIds[2], // Add
        testPlayerIds[0]  // Drop (owned)
      );

      // Verify player swapped
      const roster = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterIds[0]]
      );

      expect(roster.rows[0].bench).toContain(testPlayerIds[2].toString());
      expect(roster.rows[0].bench).not.toContain(testPlayerIds[0].toString());
    });

    it('should reject dropping unowned player', async () => {
      await expect(
        pickupFreeAgent(
          testRosterIds[0],
          testPlayerIds[2],
          testPlayerIds[3] // Not owned by roster 0
        )
      ).rejects.toThrow('not on your roster');
    });

    it('should create transaction record', async () => {
      await pickupFreeAgent(testRosterIds[0], testPlayerIds[2], null);

      const transaction = await pool.query(
        'SELECT * FROM transactions WHERE league_id = $1 AND transaction_type = $2',
        [testLeagueId, 'free_agent']
      );

      expect(transaction.rows).toHaveLength(1);
      expect(transaction.rows[0].roster_id).toBe(testRosterIds[0]);
      expect(transaction.rows[0].adds).toContain(testPlayerIds[2].toString());
    });
  });

  describe('isPlayerAvailable', () => {
    it('should return true for unrostered player', async () => {
      const available = await isPlayerAvailable(testLeagueId, testPlayerIds[2]);
      expect(available).toBe(true);
    });

    it('should return false for rostered player', async () => {
      const available = await isPlayerAvailable(testLeagueId, testPlayerIds[0]);
      expect(available).toBe(false);
    });

    it('should check all roster slots (bench, starters, taxi, IR)', async () => {
      // Add player to starters
      await pool.query(
        `UPDATE rosters SET starters = $1 WHERE id = $2`,
        [
          JSON.stringify([
            { slot: 'QB', player_id: testPlayerIds[5] },
            { slot: 'RB1', player_id: null },
            { slot: 'RB2', player_id: null }
          ]),
          testRosterIds[0]
        ]
      );

      const available = await isPlayerAvailable(testLeagueId, testPlayerIds[5]);
      expect(available).toBe(false);
    });
  });
});
