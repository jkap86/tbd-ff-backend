const { Pool } = require('pg');

async function checkSchema() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Checking Heroku database schema...\n');

    // Check leagues table columns
    const leagues = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'leagues'
      ORDER BY ordinal_position
    `);

    console.log('LEAGUES table columns:');
    leagues.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    // Check drafts table columns
    const drafts = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'drafts'
      ORDER BY ordinal_position
    `);

    console.log('\nDRAFTS table columns:');
    drafts.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkSchema();
