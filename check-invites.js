const { Pool } = require('pg');
require('dotenv').config();

async function checkInvites() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    const client = await pool.connect();

    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'league_invites'
      ORDER BY ordinal_position;
    `);

    console.log('league_invites table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    // Check league_chat_messages too
    const chatResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'league_chat_messages'
      ORDER BY ordinal_position;
    `);

    console.log('\nleague_chat_messages table columns:');
    chatResult.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    // Check draft_chat_messages too
    const draftChatResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'draft_chat_messages'
      ORDER BY ordinal_position;
    `);

    console.log('\ndraft_chat_messages table columns:');
    draftChatResult.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    client.release();
    await pool.end();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkInvites();
