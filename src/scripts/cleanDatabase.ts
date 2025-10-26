import pool from "../config/database";

async function cleanDatabase() {
  try {
    console.log("Cleaning database...");

    // Delete in correct order due to foreign key constraints
    await pool.query("DELETE FROM draft_picks");
    console.log("✓ Deleted draft picks");

    await pool.query("DELETE FROM drafts");
    console.log("✓ Deleted drafts");

    await pool.query("DELETE FROM rosters");
    console.log("✓ Deleted rosters");

    await pool.query("DELETE FROM leagues");
    console.log("✓ Deleted leagues");

    console.log("\n✓ Database cleaned successfully!");
  } catch (error) {
    console.error("Error cleaning database:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

cleanDatabase()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
