import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production" && process.env.DB_SSL !== "false"
      ? { rejectUnauthorized: false }
      : false,
});

// Test the connection
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

// Track consecutive errors for circuit breaker pattern
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_RESET_TIMEOUT = 60000; // 1 minute

pool.on("error", (err: any) => {
  console.error("Unexpected error on idle client:", {
    error: err.message,
    code: err.code,
    timestamp: new Date().toISOString(),
  });

  consecutiveErrors++;

  // TODO: Alert monitoring system (integrate with Sentry/monitoring tool)
  // Example: Sentry.captureException(err);

  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.error(
      `CRITICAL: ${MAX_CONSECUTIVE_ERRORS} consecutive database errors. ` +
      "Manual intervention required."
    );
    // In production, this should trigger alerts, not exit
    // For now, log critically but allow server to attempt recovery
  }

  // Reset error counter after timeout
  setTimeout(() => {
    if (consecutiveErrors > 0) {
      consecutiveErrors--;
    }
  }, ERROR_RESET_TIMEOUT);
});

// Add connection health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}

export default pool;
