import pool from "../config/database";

async function backfillRosters() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find leagues where actual roster count doesn't match total_rosters
    const leaguesQuery = `
      SELECT
        l.id as league_id,
        l.name,
        l.total_rosters,
        COALESCE(COUNT(r.id), 0) as actual_rosters
      FROM leagues l
      LEFT JOIN rosters r ON r.league_id = l.id
      GROUP BY l.id, l.name, l.total_rosters
      HAVING COUNT(r.id) < l.total_rosters
    `;

    const result = await client.query(leaguesQuery);

    console.log(`\nFound ${result.rows.length} leagues with missing rosters:`);
    console.log(result.rows);

    for (const league of result.rows) {
      const leagueId = league.league_id;
      const totalRosters = league.total_rosters;
      const actualRosters = parseInt(league.actual_rosters);

      console.log(`\nBackfilling rosters for league ${leagueId} (${league.name})`);
      console.log(`  Total needed: ${totalRosters}, Current: ${actualRosters}`);

      // Get existing roster IDs to avoid duplicates
      const existingRostersQuery = `
        SELECT roster_id
        FROM rosters
        WHERE league_id = $1
        ORDER BY roster_id ASC
      `;

      const existingRosters = await client.query(existingRostersQuery, [leagueId]);
      const existingRosterIds = new Set(existingRosters.rows.map(r => r.roster_id));

      // Create missing rosters
      let created = 0;
      for (let i = 1; i <= totalRosters; i++) {
        if (!existingRosterIds.has(i)) {
          const insertQuery = `
            INSERT INTO rosters (league_id, roster_id, user_id, settings)
            VALUES ($1, $2, NULL, '{}')
          `;

          await client.query(insertQuery, [leagueId, i]);
          created++;
          console.log(`  Created roster ${i}`);
        }
      }

      console.log(`  Created ${created} missing rosters`);
    }

    await client.query('COMMIT');
    console.log('\n✓ Roster backfill complete!');
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error backfilling rosters:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

backfillRosters();
