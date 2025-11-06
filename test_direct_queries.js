const pool = require('./dist/config/database').default;

(async () => {
  try {
    // Get a test roster and draft
    const setup = await pool.query(`
      SELECT d.id as draft_id, r.id as roster_id, r.user_id, l.settings
      FROM drafts d
      JOIN leagues l ON d.league_id = l.id
      JOIN rosters r ON l.id = r.league_id
      LIMIT 1
    `);
    
    if (setup.rows.length === 0) {
      console.log('No test data');
      process.exit(0);
    }
    
    const {draft_id, roster_id, user_id, settings} = setup.rows[0];
    const commissioner_id = settings.commissioner_id;
    
    console.log('Test data:', {draft_id, roster_id, user_id, commissioner_id});
    
    // Test doesUserOwnRoster query directly
    console.log('\nDirect query for doesUserOwnRoster:');
    const ownResult = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM rosters r
        INNER JOIN drafts d ON d.league_id = r.league_id
        WHERE d.id = $1 AND r.id = $2 AND r.user_id = $3
      ) as owns_roster
    `, [draft_id, roster_id, user_id]);
    console.log('Result:', ownResult.rows[0]);
    
    // Test isUserDraftCommissioner query directly  
    console.log('\nDirect query for isUserDraftCommissioner:');
    const commResult = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM leagues l
        INNER JOIN drafts d ON d.league_id = l.id
        WHERE d.id = $1 AND (l.settings->>'commissioner_id')::int = $2
      ) as is_commissioner
    `, [draft_id, commissioner_id]);
    console.log('Result:', commResult.rows[0]);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
