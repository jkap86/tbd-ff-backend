const pool = require('./dist/config/database').default;

async function fixDerbyTimer() {
  try {
    const result = await pool.query(`
      UPDATE drafts
      SET derby_time_limit_seconds = 30
      WHERE derby_enabled = true
      AND derby_time_limit_seconds IS NULL
      RETURNING id, league_id;
    `);

    console.log(`Updated ${result.rows.length} drafts to have 30-second derby timer:`);
    result.rows.forEach(row => {
      console.log(`  - Draft ${row.id} (League ${row.league_id})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixDerbyTimer();
