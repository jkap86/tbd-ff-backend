/**
 * Test script for Derby Timeout functionality
 *
 * This script will:
 * 1. Check if there's an active derby
 * 2. Show current derby status
 * 3. Manually trigger a timeout to test the auto-assignment
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function testTimeout() {
  const client = await pool.connect();

  try {
    console.log('=== Derby Timeout Test ===\n');

    // Find active derby
    const derbyResult = await client.query(`
      SELECT dd.*, d.derby_time_limit_seconds, d.derby_timeout_behavior
      FROM draft_derby dd
      JOIN drafts d ON d.id = dd.draft_id
      WHERE dd.status = 'in_progress'
      ORDER BY dd.id DESC
      LIMIT 1
    `);

    if (derbyResult.rows.length === 0) {
      console.log('No active derby found. Please start a derby first.');
      return;
    }

    const derby = derbyResult.rows[0];
    console.log('Found active derby:');
    console.log(`  Draft ID: ${derby.draft_id}`);
    console.log(`  Derby ID: ${derby.id}`);
    console.log(`  Current Turn: ${derby.current_turn}`);
    console.log(`  Timeout Behavior: ${derby.derby_timeout_behavior}`);
    console.log(`  Time Limit: ${derby.derby_time_limit_seconds} seconds`);
    console.log(`  Deadline: ${derby.turn_deadline}`);

    // Parse derby order
    const derbyOrder = typeof derby.derby_order === 'string'
      ? JSON.parse(derby.derby_order)
      : derby.derby_order;

    const currentRosterId = derbyOrder[derby.current_turn];
    console.log(`  Current Roster ID: ${currentRosterId}\n`);

    // Get selections
    const selectionsResult = await client.query(`
      SELECT * FROM draft_derby_selections WHERE derby_id = $1 ORDER BY selected_at
    `, [derby.id]);

    console.log(`Selections made: ${selectionsResult.rows.length}/${derbyOrder.length}`);
    selectionsResult.rows.forEach(s => {
      console.log(`  Roster ${s.roster_id} -> Position ${s.draft_position}`);
    });

    // Check deadline
    const now = new Date();
    const deadline = new Date(derby.turn_deadline);
    const timeRemaining = deadline - now;

    console.log(`\nTime until deadline: ${Math.round(timeRemaining / 1000)} seconds`);

    if (timeRemaining > 0) {
      console.log('\n⏰ Deadline has not passed yet.');
      console.log(`   Wait ${Math.round(timeRemaining / 1000)} seconds or manually trigger timeout below.`);
    } else {
      console.log('\n⚠️  Deadline has already passed! Timeout should have been processed.');
    }

    // Ask if user wants to manually trigger timeout
    console.log('\n--- Manual Timeout Trigger ---');
    console.log('To manually test timeout processing, you can:');
    console.log('1. Wait for the deadline to pass naturally');
    console.log('2. Or update the deadline to trigger immediately:');
    console.log(`\nRun this SQL to trigger timeout NOW:`);
    console.log(`UPDATE draft_derby SET turn_deadline = NOW() - INTERVAL '1 second' WHERE id = ${derby.id};`);
    console.log('\nNote: The backend server must be running for the timeout to be processed!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testTimeout();
