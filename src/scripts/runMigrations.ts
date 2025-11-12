import pool from "../config/database";
import fs from "fs";
import path from "path";

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log("Starting migrations...");

    // 1. Create migration tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✓ Migration tracking table ready");

    // 2. Get list of already-applied migrations
    const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version');
    const appliedMigrations = new Set(rows.map(r => r.version));
    console.log(`✓ Found ${appliedMigrations.size} previously applied migrations`);

    // 3. Read all migration files
    const migrationsPath = path.join(__dirname, "../migrations");
    const migrationFiles = fs.readdirSync(migrationsPath)
      .filter(file => file.endsWith(".sql"))
      .sort();

    console.log(`✓ Found ${migrationFiles.length} total migration files`);

    // 4. Run pending migrations
    let appliedCount = 0;
    for (const file of migrationFiles) {
      if (!appliedMigrations.has(file)) {
        console.log(`\nRunning migration: ${file}`);
        const filePath = path.join(migrationsPath, file);
        const sql = fs.readFileSync(filePath, "utf8");

        // Run migration in a transaction
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1)',
            [file]
          );
          await client.query('COMMIT');
          console.log(`✓ Migration ${file} completed successfully`);
          appliedCount++;
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`✗ Migration ${file} failed:`, error);
          throw error;
        }
      } else {
        console.log(`⊘ Skipping ${file} (already applied)`);
      }
    }

    console.log(`\n✓ All migrations completed successfully!`);
    console.log(`  - Total migrations: ${migrationFiles.length}`);
    console.log(`  - Already applied: ${appliedMigrations.size}`);
    console.log(`  - Newly applied: ${appliedCount}`);

    process.exit(0);
  } catch (error) {
    console.error("\n✗ Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigrations();
