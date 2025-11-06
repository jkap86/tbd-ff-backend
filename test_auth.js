const draftAuth = require('./dist/utils/draftAuthorization');

(async () => {
  try {
    // Test with draft 1 and user 12 (should be commissioner of league 22)
    // First, let's find a draft and the commissioner
    const pool = require('./dist/config/database').default;
    
    const draftResult = await pool.query(`
      SELECT d.id, d.league_id, l.settings
      FROM drafts d
      JOIN leagues l ON d.league_id = l.id
      LIMIT 1
    `);
    
    if (draftResult.rows.length === 0) {
      console.log('No drafts found');
      process.exit(0);
    }
    
    const draft = draftResult.rows[0];
    const commissionerId = draft.settings.commissioner_id;
    
    console.log('Testing with draft:', draft.id);
    console.log('League:', draft.league_id);
    console.log('Commissioner ID from settings:', commissionerId);
    
    const isCommissioner = await draftAuth.isUserDraftCommissioner(commissionerId, draft.id);
    console.log('isUserDraftCommissioner result:', isCommissioner);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
})();
