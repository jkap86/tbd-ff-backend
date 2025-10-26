import pool from "../config/database";
import fs from "fs";
import path from "path";

async function addAutodraftColumn() {
  try {
    console.log("Adding autodraft column to draft_order table...\n");

    const sql = fs.readFileSync(
      path.join(__dirname, "../migrations/017_add_autodraft_to_draft_order.sql"),
      "utf-8"
    );

    await pool.query(sql);
    console.log("✓ Autodraft column added successfully");

    await pool.end();
  } catch (error) {
    console.error("Error adding autodraft column:", error);
    await pool.end();
    process.exit(1);
  }
}

addAutodraftColumn();
