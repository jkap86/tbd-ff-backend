const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkPushNotifications() {
  try {
    console.log('Checking push notification tables...\n');

    // Check push_tokens table
    const tokensResult = await pool.query(`
      SELECT COUNT(*) as count FROM push_tokens WHERE is_active = TRUE
    `);
    console.log(`Active push tokens: ${tokensResult.rows[0].count}`);

    // Check notification_preferences table
    const prefsResult = await pool.query(`
      SELECT COUNT(*) as count FROM notification_preferences
    `);
    console.log(`Users with preferences: ${prefsResult.rows[0].count}`);

    // Check notification_history table
    const historyResult = await pool.query(`
      SELECT COUNT(*) as count FROM notification_history
    `);
    console.log(`Notification history entries: ${historyResult.rows[0].count}`);

    // Check recent tokens
    const recentTokens = await pool.query(`
      SELECT user_id, device_type, LEFT(token, 20) as token_prefix, last_used_at
      FROM push_tokens
      WHERE is_active = TRUE
      ORDER BY last_used_at DESC
      LIMIT 5
    `);

    console.log('\nRecent active tokens:');
    if (recentTokens.rows.length === 0) {
      console.log('  No active tokens found');
    } else {
      recentTokens.rows.forEach(row => {
        console.log(`  User ${row.user_id}: ${row.device_type} (${row.token_prefix}...) - Last used: ${row.last_used_at}`);
      });
    }

    // Check Firebase initialization
    console.log('\nFirebase Admin SDK:');
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('  ✓ FIREBASE_SERVICE_ACCOUNT is set');
      try {
        const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log(`  ✓ Project ID: ${account.project_id}`);
        console.log(`  ✓ Client Email: ${account.client_email}`);
      } catch (e) {
        console.log('  ✗ Failed to parse FIREBASE_SERVICE_ACCOUNT');
      }
    } else {
      console.log('  ✗ FIREBASE_SERVICE_ACCOUNT is NOT set');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkPushNotifications();
