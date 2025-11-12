const draftAuth = require('./dist/utils/draftAuthorization');
const pool = require('./dist/config/database').default;

(async () => {
  try {
    // Find a draft with multiple rosters so we can test OTC scenario
    const result = await pool.query(`
      SELECT d.id as draft_id, 
             r.id as roster_id, 
             r.user_id,
             l.id as league_id,
             (l.settings->>'commissioner_id')::int as commissioner_id
      FROM drafts d
      JOIN leagues l ON d.league_id = l.id
      JOIN rosters r ON l.id = r.league_id
      WHERE (l.settings->>'commissioner_id')::int = r.user_id
      ORDER BY d.id
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.log('No test data');
      process.exit(0);
    }
    
    const test = result.rows[0];
    console.log('Commissioner roster in draft:');
    console.log(JSON.stringify(test, null, 2));
    
    // Test if they own their roster
    console.log('\nTest 1: Does commissioner own their roster?');
    const ownsRoster = await draftAuth.doesUserOwnRoster(test.user_id, test.roster_id, test.draft_id);
    console.log('ownsRoster:', ownsRoster);
    
    // Test if they're commissioner
    console.log('\nTest 2: Is user the commissioner?');
    const isCommissioner = await draftAuth.isUserDraftCommissioner(test.user_id, test.draft_id);
    console.log('isCommissioner:', isCommissioner);
    
    // Test with invalid roster_id (this is what might happen if there's a mismatch)
    console.log('\nTest 3: Testing with invalid roster_id (should fail):');
    const invalidRosterTest = await draftAuth.doesUserOwnRoster(test.user_id, 9999, test.draft_id);
    console.log('doesUserOwnRoster with invalid roster_id:', invalidRosterTest);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
