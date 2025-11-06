const pool = require('./dist/config/database').default;

(async () => {
  try {
    // Check for any leagues with null or missing commissioner_id
    const result = await pool.query(`
      SELECT id, settings, settings->>'commissioner_id' as commissioner_id
      FROM leagues
      WHERE settings->>'commissioner_id' IS NULL
      OR settings IS NULL
      LIMIT 5
    `);
    
    console.log('Leagues with NULL commissioner_id:', result.rows.length);
    if (result.rows.length > 0) {
      result.rows.forEach(row => {
        console.log('League ID:', row.id);
        console.log('Settings:', JSON.stringify(row.settings));
        console.log('---');
      });
    } else {
      console.log('No leagues with NULL commissioner_id found');
    }
    
    // Also check what happens when we try to cast null
    const castTest = await pool.query(`
      SELECT NULL::text->>'commissioner_id' as test1,
             (NULL::jsonb)->>'commissioner_id' as test2,
             ('{}'::jsonb)->>'commissioner_id' as test3
    `);
    console.log('\nNull casting tests:', castTest.rows[0]);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
