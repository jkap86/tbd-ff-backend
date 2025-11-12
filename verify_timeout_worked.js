const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function verify() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT dds.roster_id, dds.draft_position, dds.selected_at, dd.status
      FROM draft_derby_selections dds
      JOIN draft_derby dd ON dd.id = dds.derby_id
      WHERE dd.draft_id = 94
      ORDER BY dds.selected_at
    `);

    console.log('\n=== Derby 94 Selections ===');
    result.rows.forEach(r => {
      console.log(`Roster ${r.roster_id} -> Position ${r.draft_position} (${new Date(r.selected_at).toLocaleTimeString()})`);
    });
    console.log(`\nDerby status: ${result.rows[0]?.status || 'N/A'}`);
    console.log(`Total selections: ${result.rows.length}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

verify();
