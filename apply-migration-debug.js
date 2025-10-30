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

    // Split into individual statements (excluding BEGIN/COMMIT)
    const statements = migrationSQL
      .split('\n')
      .filter(line => line.trim() && !line.trim().startsWith('--'))
      .join('\n')
      .replace('BEGIN;', '')
      .replace('COMMIT;', '')
      .split(';')
      .map(s => s.trim())
      .filter(s => s);

    console.log(`Found ${statements.length} statements to execute`);

    await client.query('BEGIN');

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        console.log(`\n[${i + 1}/${statements.length}] Executing: ${statement.substring(0, 80)}...`);
        await client.query(statement);
        console.log('  ✓ Success');
      } catch (error) {
        console.error(`  ✗ Error on statement ${i + 1}:`);
        console.error(`  Statement: ${statement}`);
        console.error(`  Error: ${error.message}`);
        throw error;
      }
    }

    await client.query('COMMIT');
    console.log('\n✓ All statements executed successfully!');

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

    client.release();
    await pool.end();

  } catch (error) {
    console.error('\nError applying migration:', error.message);
    process.exit(1);
  }
}

applyMigration();
