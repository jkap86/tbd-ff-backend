import pool from "../config/database";
import fs from "fs";
import path from "path";

async function runMigrations() {
  try {
    console.log("Starting migrations...");

    const migrationsPath = path.join(__dirname, "../migrations");
    const migrationFiles = fs.readdirSync(migrationsPath).sort();

    for (const file of migrationFiles) {
      if (file.endsWith(".sql")) {
        console.log(`Running migration: ${file}`);
        const filePath = path.join(migrationsPath, file);
        const sql = fs.readFileSync(filePath, "utf8");

        await pool.query(sql);
        console.log(`✓ Migration ${file} completed successfully`);
      }
    }

    console.log("All migrations completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigrations();
