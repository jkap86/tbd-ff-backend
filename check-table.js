const { Pool } = require('pg');
require('dotenv').config();

async function checkTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    const client = await pool.connect();

    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'password_reset_tokens'
      ORDER BY ordinal_position;
    `);

    console.log('password_reset_tokens table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    // Check weekly_lineups table too
    const weeklyResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'weekly_lineups'
      ORDER BY ordinal_position;
    `);

    console.log('\nweekly_lineups table columns:');
    if (weeklyResult.rows.length > 0) {
      weeklyResult.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type})`);
      });
    } else {
      console.log('  TABLE DOES NOT EXIST');
    }

    client.release();
    await pool.end();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTable();
