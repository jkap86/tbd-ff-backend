const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not found');
    console.log('Please set it with your Heroku database URL');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('📦 Reading migration file...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'heroku-minimal-indexes.sql'),
      'utf8'
    );

    console.log('🔌 Connecting to Heroku database...');
    const client = await pool.connect();

    console.log('🚀 Running migrations...');
    console.log('   This may take 30-60 seconds for 73 indexes...\n');

    const startTime = Date.now();
    await client.query(migrationSQL);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ All migrations completed successfully in ${duration}s`);
    console.log('\nApplied:');
    console.log('  ✓ Core performance indexes for Heroku schema');

    client.release();
    await pool.end();

    console.log('\n🎉 Database migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigrations();
