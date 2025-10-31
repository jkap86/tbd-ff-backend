const { Pool } = require('pg');

async function clearDatabase() {
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not found');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🗑️  Clearing all data from Heroku database...\n');
    
    const client = await pool.connect();
    
    // Get all table names
    const tablesResult = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    
    const tables = tablesResult.rows.map(r => r.tablename);
    console.log(`Found ${tables.length} tables to clear\n`);
    
    // Truncate all tables with CASCADE
    for (const table of tables) {
      try {
        await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
        console.log(`✅ Cleared: ${table}`);
      } catch (err) {
        console.log(`⏭️  Skipped: ${table} (${err.message})`);
      }
    }
    
    console.log('\n✅ All data cleared successfully!');
    console.log('📊 Table structures preserved');
    console.log('🔢 Sequences reset to start from 1');
    
    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Error clearing database:', error.message);
    await pool.end();
    process.exit(1);
  }
}

clearDatabase();
