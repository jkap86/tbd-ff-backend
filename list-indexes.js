const { Pool } = require('pg');
require('dotenv').config();

async function listIndexes() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    const client = await pool.connect();

    const result = await client.query(`
      SELECT
        tablename,
        indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname;
    `);

    console.log(`\nTotal indexes created: ${result.rows.length}\n`);
    console.log('Indexes by table:\n');

    let currentTable = '';
    let count = 0;
    result.rows.forEach(row => {
      if (row.tablename !== currentTable) {
        if (currentTable !== '') {
          console.log(`  (${count} indexes)\n`);
        }
        console.log(`${row.tablename.toUpperCase()}:`);
        currentTable = row.tablename;
        count = 0;
      }
      console.log(`  - ${row.indexname}`);
      count++;
    });
    if (currentTable !== '') {
      console.log(`  (${count} indexes)\n`);
    }

    client.release();
    await pool.end();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

listIndexes();
