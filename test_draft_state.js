const pool = require('./dist/config/database').default;

(async () => {
  try {
    // Check draft 165 specifically since that was in the error
    const draftResult = await pool.query(`
      SELECT id, current_pick, current_round, current_roster_id, status, pick_deadline
      FROM drafts
      WHERE id = 165
    `);
    
    if (draftResult.rows.length === 0) {
      console.log('Draft 165 not found');
      process.exit(0);
    }
    
    const draft = draftResult.rows[0];
    console.log('Draft state:');
    console.log(JSON.stringify(draft, null, 2));
    
    // Check what roster should be picking based on current_pick
    const rosters = await pool.query(`
      SELECT roster_id, draft_position FROM draft_order WHERE draft_id = 165 ORDER BY draft_position
    `);
    
    console.log('\nDraft order:');
    rosters.rows.forEach(r => {
      const isCurrent = r.roster_id === draft.current_roster_id ? ' ← CURRENT' : '';
      console.log(`Position ${r.draft_position}: Roster ${r.roster_id}${isCurrent}`);
    });
    
    // Check picks already made
    const picks = await pool.query(`
      SELECT pick_number, round, pick_in_round, roster_id, player_id, is_auto_pick
      FROM draft_picks
      WHERE draft_id = 165
      ORDER BY pick_number
    `);
    
    console.log(`\nPicks made (${picks.rows.length}):`);
    picks.rows.forEach(p => {
      console.log(`Pick #${p.pick_number} (Round ${p.round}, Pick in round ${p.pick_in_round}): Roster ${p.roster_id}${p.is_auto_pick ? ' (AUTO)' : ''}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
