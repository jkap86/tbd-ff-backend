const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function applyMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();

    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, 'migrations', '027_add_performance_indexes.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Applying migration...');
    await client.query(migrationSQL);

    console.log('✓ Migration applied successfully!');

    console.log('\nVerifying indexes created...');
    const result = await client.query(`
      SELECT
        tablename,
        indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname;
    `);

    console.log(`\nTotal indexes created: ${result.rows.length}`);
    console.log('\nIndexes by table:');

    let currentTable = '';
    result.rows.forEach(row => {
      if (row.tablename !== currentTable) {
        console.log(`\n${row.tablename}:`);
        currentTable = row.tablename;
      }
      console.log(`  - ${row.indexname}`);
    });

    client.release();
    await pool.end();

  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();
