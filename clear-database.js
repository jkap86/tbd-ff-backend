const { Pool } = require('pg');
const fs = require('fs');

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
    
    const sqlScript = fs.readFileSync('./clear-data.sql', 'utf8');
    
    await client.query(sqlScript);
    
    console.log('✅ All data cleared successfully!');
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
