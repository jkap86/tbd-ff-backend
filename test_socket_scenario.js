const draftAuth = require('./dist/utils/draftAuthorization');
const pool = require('./dist/config/database').default;

(async () => {
  try {
    // Get a commissioner's roster in a draft they own
    const result = await pool.query(`
      SELECT d.id as draft_id, 
             r.id as roster_id, 
             r.user_id,
             l.id as league_id,
             l.settings->>'commissioner_id' as commissioner_id_str,
             (l.settings->>'commissioner_id')::int as commissioner_id_int
      FROM drafts d
      JOIN leagues l ON d.league_id = l.id
      JOIN rosters r ON l.id = r.league_id
      WHERE (l.settings->>'commissioner_id')::int = r.user_id
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.log('No commissioners with their own rosters found');
      process.exit(0);
    }
    
    const test = result.rows[0];
    console.log('Test scenario - Commissioner toggling their own autodraft:');
    console.log(JSON.stringify(test, null, 2));
    
    // Simulate socket.data.user (might come as string IDs)
    const socketUser = {
      userId: test.user_id,  // Could be number or string
      username: 'TestUser'
    };
    
    console.log('\nSocket user data:', socketUser);
    console.log('User ID type:', typeof socketUser.userId);
    
    // Test doesUserOwnRoster
    console.log('\n--- Testing doesUserOwnRoster ---');
    const ownsRoster = await draftAuth.doesUserOwnRoster(
      socketUser.userId, 
      test.roster_id, 
      test.draft_id
    );
    console.log('Result:', ownsRoster);
    
    // Test isUserDraftCommissioner
    console.log('\n--- Testing isUserDraftCommissioner ---');
    const isCommissioner = await draftAuth.isUserDraftCommissioner(
      socketUser.userId, 
      test.draft_id
    );
    console.log('Result:', isCommissioner);
    
    // Test with string IDs (common socket issue)
    console.log('\n--- Testing with STRING IDs (potential issue) ---');
    const socketUserStr = {
      userId: String(test.user_id),
      username: 'TestUser'
    };
    console.log('Socket user data (strings):', socketUserStr);
    console.log('User ID type:', typeof socketUserStr.userId);
    
    console.log('\nTesting doesUserOwnRoster with string ID:');
    const ownsRosterStr = await draftAuth.doesUserOwnRoster(
      socketUserStr.userId, 
      test.roster_id, 
      test.draft_id
    );
    console.log('Result:', ownsRosterStr);
    
    console.log('\nTesting isUserDraftCommissioner with string ID:');
    const isCommissionerStr = await draftAuth.isUserDraftCommissioner(
      socketUserStr.userId, 
      test.draft_id
    );
    console.log('Result:', isCommissionerStr);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
})();
