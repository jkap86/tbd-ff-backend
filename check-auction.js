const { Pool } = require('pg');
require('dotenv').config();

async function checkAuction() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    const client = await pool.connect();

    const bidsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'auction_bids'
      ORDER BY ordinal_position;
    `);

    console.log('auction_bids table columns:');
    bidsResult.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    const nominationsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'auction_nominations'
      ORDER BY ordinal_position;
    `);

    console.log('\nauction_nominations table columns:');
    nominationsResult.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    client.release();
    await pool.end();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAuction();
