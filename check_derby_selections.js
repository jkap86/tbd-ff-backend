const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkAndRecreateTable() {
  const client = await pool.connect();
  try {
    // Check table structure
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'draft_derby_selections'
      ORDER BY ordinal_position
    `);

    console.log('Current draft_derby_selections columns:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });

    // Check if we need to recreate
    const hasAllColumns = result.rows.length === 5 &&
      result.rows.some(r => r.column_name === 'id') &&
      result.rows.some(r => r.column_name === 'derby_id') &&
      result.rows.some(r => r.column_name === 'roster_id') &&
      result.rows.some(r => r.column_name === 'draft_position') &&
      result.rows.some(r => r.column_name === 'selected_at');

    if (hasAllColumns) {
      console.log('\nTable structure is correct!');
    } else {
      console.log('\nTable needs to be recreated. Recreating now...');

      await client.query('DROP TABLE IF EXISTS draft_derby_selections CASCADE');

      await client.query(`
        CREATE TABLE draft_derby_selections (
          id SERIAL PRIMARY KEY,
          derby_id INTEGER NOT NULL REFERENCES draft_derby(id) ON DELETE CASCADE,
          roster_id INTEGER NOT NULL,
          draft_position INTEGER NOT NULL,
          selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(derby_id, roster_id),
          UNIQUE(derby_id, draft_position)
        )
      `);

      await client.query(`CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_derby_id ON draft_derby_selections(derby_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_roster_id ON draft_derby_selections(roster_id)`);

      console.log('Table recreated successfully!');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkAndRecreateTable();
