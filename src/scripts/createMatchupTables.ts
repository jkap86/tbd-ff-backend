import pool from "../config/database";
import fs from "fs";
import path from "path";

async function createMatchupTables() {
  try {
    console.log("Creating matchup and player stats tables...\n");

    // Read and execute matchups migration
    const matchupsSQL = fs.readFileSync(
      path.join(__dirname, "../migrations/015_create_matchups_table.sql"),
      "utf-8"
    );
    await pool.query(matchupsSQL);
    console.log("✓ Matchups table created successfully");

    // Read and execute player stats migration
    const playerStatsSQL = fs.readFileSync(
      path.join(__dirname, "../migrations/016_create_player_stats_table.sql"),
      "utf-8"
    );
    await pool.query(playerStatsSQL);
    console.log("✓ Player stats table created successfully");

    console.log("\n✅ All tables created successfully!");
    await pool.end();
  } catch (error) {
    console.error("Error creating tables:", error);
    await pool.end();
    process.exit(1);
  }
}

createMatchupTables();
