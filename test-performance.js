const { Pool } = require('pg');
require('dotenv').config();

async function testPerformance() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    const client = await pool.connect();

    console.log('=== QUERY PERFORMANCE TESTS ===\n');

    // Test 1: User login query
    console.log('Test 1: User lookup by username');
    const test1 = await client.query(`
      EXPLAIN ANALYZE
      SELECT * FROM users WHERE username = 'test' LIMIT 1;
    `);
    console.log(test1.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Test 2: User lookup by email
    console.log('\n\nTest 2: User lookup by email');
    const test2 = await client.query(`
      EXPLAIN ANALYZE
      SELECT * FROM users WHERE email = 'test@example.com' LIMIT 1;
    `);
    console.log(test2.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Test 3: League rosters
    console.log('\n\nTest 3: League rosters lookup');
    const test3 = await client.query(`
      EXPLAIN ANALYZE
      SELECT * FROM rosters WHERE league_id = 1;
    `);
    console.log(test3.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Test 4: Waiver claims by league and status
    console.log('\n\nTest 4: Waiver claims by league and status');
    const test4 = await client.query(`
      EXPLAIN ANALYZE
      SELECT * FROM waiver_claims
      WHERE league_id = 1 AND status = 'pending'
      ORDER BY created_at ASC;
    `);
    console.log(test4.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Test 5: Player stats lookup
    console.log('\n\nTest 5: Player stats for scoring');
    const test5 = await client.query(`
      EXPLAIN ANALYZE
      SELECT * FROM player_stats
      WHERE player_id = '1' AND week = 1 AND season = '2024';
    `);
    console.log(test5.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Test 6: Matchup by league and week
    console.log('\n\nTest 6: Matchups by league and week');
    const test6 = await client.query(`
      EXPLAIN ANALYZE
      SELECT * FROM matchups WHERE league_id = 1 AND week = 1;
    `);
    console.log(test6.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Test 7: Draft picks
    console.log('\n\nTest 7: Draft picks by draft_id');
    const test7 = await client.query(`
      EXPLAIN ANALYZE
      SELECT * FROM draft_picks WHERE draft_id = 1 ORDER BY pick_number;
    `);
    console.log(test7.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Test 8: Players by position
    console.log('\n\nTest 8: Players by position');
    const test8 = await client.query(`
      EXPLAIN ANALYZE
      SELECT * FROM players WHERE position = 'QB' LIMIT 20;
    `);
    console.log(test8.rows.map(r => r['QUERY PLAN']).join('\n'));

    console.log('\n\n=== SUMMARY ===');
    console.log('All queries should show "Index Scan" instead of "Seq Scan" where indexes exist.');
    console.log('This indicates indexes are being used properly for improved performance.');

    client.release();
    await pool.end();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testPerformance();
