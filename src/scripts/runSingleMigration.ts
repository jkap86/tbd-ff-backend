import pool from "../config/database";
import fs from "fs";
import path from "path";

async function runMigration() {
  const migrationPath = path.join(__dirname, "../migrations/076_make_rosters_user_id_nullable.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  const client = await pool.connect();
  try {
    console.log("Running migration 076_make_rosters_user_id_nullable.sql...");
    await client.query(sql);
    console.log("✓ Migration applied successfully!");
    process.exit(0);
  } catch (error: any) {
    console.error("Error running migration:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration();
