import pool from "../config/database";

/**
 * Create password_reset_tokens table
 * Stores temporary tokens for password reset requests
 */
async function createPasswordResetTable() {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
      );

      -- Index for faster lookups
      CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_password_reset_expires_at ON password_reset_tokens(expires_at);
    `;

    await pool.query(query);
    console.log("✅ password_reset_tokens table created successfully");
  } catch (error) {
    console.error("❌ Error creating password_reset_tokens table:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createPasswordResetTable()
    .then(() => {
      console.log("✅ Password reset table setup complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Password reset table setup failed:", error);
      process.exit(1);
    });
}

export default createPasswordResetTable;
