import pool from "../config/database";

async function checkCommissioner() {
  try {
    console.log("Checking league commissioners...\n");

    const query = `
      SELECT
        l.id as league_id,
        l.name as league_name,
        l.settings->>'commissioner_id' as commissioner_id,
        u.username as commissioner_username,
        l.status
      FROM leagues l
      LEFT JOIN users u ON (l.settings->>'commissioner_id')::int = u.id
      ORDER BY l.id;
    `;
    const result = await pool.query(query);

    console.log("=== LEAGUE COMMISSIONERS ===");
    console.table(result.rows);

    // Also check all users
    const usersQuery = `SELECT id, username, email FROM users ORDER BY id`;
    const usersResult = await pool.query(usersQuery);

    console.log("\n=== ALL USERS ===");
    console.table(usersResult.rows);

    await pool.end();
  } catch (error) {
    console.error("Error checking commissioners:", error);
    await pool.end();
    process.exit(1);
  }
}

checkCommissioner();
