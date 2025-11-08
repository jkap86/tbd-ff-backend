import pool from "../config/database";

async function checkRosters() {
  try {
    // Check leagues and their rosters
    const leaguesQuery = `
      SELECT
        l.id as league_id,
        l.name,
        l.total_rosters,
        COUNT(r.id) as actual_rosters
      FROM leagues l
      LEFT JOIN rosters r ON r.league_id = l.id
      GROUP BY l.id, l.name, l.total_rosters
      ORDER BY l.id DESC
      LIMIT 5
    `;

    const leagues = await pool.query(leaguesQuery);
    console.log('\n=== LEAGUES AND ROSTERS ===');
    console.log(leagues.rows);

    // Check draft orders for recent drafts
    const draftsQuery = `
      SELECT
        d.id as draft_id,
        d.league_id,
        d.draft_type,
        d.status,
        COUNT(do.id) as draft_order_count
      FROM drafts d
      LEFT JOIN draft_order do ON do.draft_id = d.id
      GROUP BY d.id, d.league_id, d.draft_type, d.status
      ORDER BY d.id DESC
      LIMIT 5
    `;

    const drafts = await pool.query(draftsQuery);
    console.log('\n=== DRAFTS AND DRAFT ORDERS ===');
    console.log(drafts.rows);

    // Get most recent draft with details
    if (drafts.rows.length > 0) {
      const mostRecentDraftId = drafts.rows[0].draft_id;

      const draftOrderQuery = `
        SELECT
          do.id,
          do.draft_position,
          do.roster_id,
          r.roster_id as roster_number,
          r.user_id,
          u.username
        FROM draft_order do
        LEFT JOIN rosters r ON do.roster_id = r.id
        LEFT JOIN users u ON r.user_id = u.id
        WHERE do.draft_id = $1
        ORDER BY do.draft_position ASC
      `;

      const draftOrder = await pool.query(draftOrderQuery, [mostRecentDraftId]);
      console.log(`\n=== DRAFT ORDER FOR DRAFT ${mostRecentDraftId} ===`);
      console.log(draftOrder.rows);

      // Check all rosters for this draft's league
      const leagueId = drafts.rows[0].league_id;
      const rostersQuery = `
        SELECT
          id,
          roster_id,
          user_id,
          league_id
        FROM rosters
        WHERE league_id = $1
        ORDER BY roster_id ASC
      `;

      const rosters = await pool.query(rostersQuery, [leagueId]);
      console.log(`\n=== ALL ROSTERS FOR LEAGUE ${leagueId} ===`);
      console.log(rosters.rows);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkRosters();
