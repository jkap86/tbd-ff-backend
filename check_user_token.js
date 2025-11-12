const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkUserTokens() {
  try {
    console.log('Checking push tokens for all users...\n');

    // Get all active tokens
    const result = await pool.query(`
      SELECT
        pt.user_id,
        u.username,
        pt.device_type,
        pt.device_id,
        LEFT(pt.token, 30) as token_preview,
        pt.is_active,
        pt.created_at,
        pt.last_used_at
      FROM push_tokens pt
      JOIN users u ON u.id = pt.user_id
      ORDER BY pt.last_used_at DESC
    `);

    if (result.rows.length === 0) {
      console.log('❌ No push tokens found in database');
      console.log('\nThis means:');
      console.log('1. The app hasn\'t tried to register a token yet');
      console.log('2. OR the registration failed before reaching the database');
      console.log('\nTroubleshooting steps:');
      console.log('- Make sure you\'re using a RELEASE build (not debug)');
      console.log('- Check that notifications are enabled in iPhone Settings');
      console.log('- Try logging out and back in');
      console.log('- Force close and reopen the app');
    } else {
      console.log(`✅ Found ${result.rows.length} push token(s):\n`);
      result.rows.forEach((row, index) => {
        console.log(`${index + 1}. User: ${row.username} (ID: ${row.user_id})`);
        console.log(`   Device: ${row.device_type}`);
        console.log(`   Token: ${row.token_preview}...`);
        console.log(`   Active: ${row.is_active}`);
        console.log(`   Created: ${row.created_at}`);
        console.log(`   Last Used: ${row.last_used_at}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkUserTokens();
