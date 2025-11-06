const draftAuth = require('./dist/utils/draftAuthorization');

(async () => {
  try {
    const pool = require('./dist/config/database').default;
    
    // Get a draft and a roster in that draft
    const result = await pool.query(`
      SELECT d.id as draft_id, r.id as roster_id, r.user_id, l.settings->>'commissioner_id' as commissioner_id
      FROM drafts d
      JOIN leagues l ON d.league_id = l.id
      JOIN rosters r ON l.id = r.league_id
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.log('No drafts/rosters found');
      process.exit(0);
    }
    
    const test = result.rows[0];
    console.log('Test data:', {
      draft_id: test.draft_id,
      roster_id: test.roster_id,
      user_id: test.user_id,
      commissioner_id: test.commissioner_id
    });
    
    // Test with the roster owner
    console.log('\nTesting with roster owner (user_id):');
    const ownsRoster = await draftAuth.doesUserOwnRoster(test.user_id, test.roster_id, test.draft_id);
    console.log('doesUserOwnRoster:', ownsRoster);
    
    // Test with the commissioner
    console.log('\nTesting with commissioner:');
    const commId = parseInt(test.commissioner_id);
    const isCommissioner = await draftAuth.isUserDraftCommissioner(commId, test.draft_id);
    console.log('isUserDraftCommissioner:', isCommissioner);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
})();
