import pool from "../config/database";

async function checkDrafts() {
  try {
    console.log("Checking drafts table...\n");

    // Get all drafts with league info
    const draftsQuery = `
      SELECT
        d.id as draft_id,
        d.league_id,
        d.status,
        d.created_at,
        l.name as league_name,
        l.status as league_status
      FROM drafts d
      LEFT JOIN leagues l ON d.league_id = l.id
      ORDER BY d.id;
    `;
    const draftsResult = await pool.query(draftsQuery);

    console.log("=== DRAFTS ===");
    console.table(draftsResult.rows);

    // Get all leagues
    const leaguesQuery = `
      SELECT id, name, status
      FROM leagues
      ORDER BY id;
    `;
    const leaguesResult = await pool.query(leaguesQuery);

    console.log("\n=== LEAGUES ===");
    console.table(leaguesResult.rows);

    // Check for orphaned drafts
    const orphanedDrafts = draftsResult.rows.filter((d: any) => !d.league_name);
    if (orphanedDrafts.length > 0) {
      console.log("\n⚠️  WARNING: Found drafts with invalid league_id:");
      console.table(orphanedDrafts);
    }

    // Check which leagues have drafts
    console.log("\n=== LEAGUE-DRAFT MAPPING ===");
    for (const league of leaguesResult.rows) {
      const draft = draftsResult.rows.find((d: any) => d.league_id === league.id);
      console.log(
        `League ${league.id} (${league.name}) - Status: ${league.status} - Draft: ${
          draft ? `ID ${draft.draft_id} (${draft.status})` : "NONE"
        }`
      );
    }

    await pool.end();
  } catch (error) {
    console.error("Error checking drafts:", error);
    await pool.end();
    process.exit(1);
  }
}

checkDrafts();
