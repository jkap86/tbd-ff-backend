const { Pool } = require('pg');
require('dotenv').config();

async function checkSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    const client = await pool.connect();

    // Get all table names
    const tablesResult = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    console.log('Tables in database:');
    console.log(tablesResult.rows.map(r => r.tablename).join(', '));
    console.log('\n');

    // Check specific tables mentioned in migration
    const tablesToCheck = [
      'users', 'leagues', 'rosters', 'roster_players', 'draft_picks',
      'waiver_claims', 'trades', 'matchups', 'transactions', 'players', 'player_stats'
    ];

    for (const table of tablesToCheck) {
      const result = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);

      if (result.rows.length > 0) {
        console.log(`\n${table.toUpperCase()}:`);
        result.rows.forEach(row => {
          console.log(`  - ${row.column_name} (${row.data_type})`);
        });
      } else {
        console.log(`\n${table.toUpperCase()}: TABLE DOES NOT EXIST`);
      }
    }

    client.release();
    await pool.end();

  } catch (error) {
    console.error('Error checking schema:', error);
    process.exit(1);
  }
}

checkSchema();
