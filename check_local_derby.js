const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function checkLocalDerby() {
  const client = await pool.connect();
  try {
    // Check if draft_derby table exists
    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('draft_derby', 'draft_derby_selections')
      ORDER BY table_name
    `);

    console.log('Derby tables found:', tableCheck.rows.map(r => r.table_name));

    if (tableCheck.rows.some(r => r.table_name === 'draft_derby')) {
      const columns = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'draft_derby'
        ORDER BY ordinal_position
      `);
      console.log('\ndraft_derby columns:');
      columns.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
    }

    if (tableCheck.rows.some(r => r.table_name === 'draft_derby_selections')) {
      const columns = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'draft_derby_selections'
        ORDER BY ordinal_position
      `);
      console.log('\ndraft_derby_selections columns:');
      columns.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkLocalDerby();
