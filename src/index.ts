import express, { Application, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import authRoutes from "./routes/authRoutes";
import { authenticate } from "./middleware/authMiddleware";
import leagueRoutes from "./routes/leagueRoutes";
import inviteRoutes from "./routes/inviteRoutes";
import userRoutes from "./routes/userRoutes";
import draftRoutes from "./routes/draftRoutes";
import playerRoutes from "./routes/playerRoutes";
import playerStatsRoutes from "./routes/playerStatsRoutes";
import playerProjectionsRoutes from "./routes/playerProjectionsRoutes";
import rosterRoutes from "./routes/rosterRoutes";
import matchupRoutes from "./routes/matchupRoutes";
import weeklyLineupRoutes from "./routes/weeklyLineupRoutes";
import nflRoutes from "./routes/nflRoutes";
import { setupDraftSocket } from "./socket/draftSocket";
import { setupLeagueSocket } from "./socket/leagueSocket";
import { setupMatchupSocket } from "./socket/matchupSocket";
import { setupWaiverSocket } from "./socket/waiverSocket";
import { setupTradeSocket } from "./socket/tradeSocket";
import { setupAuctionSocket } from "./socket/auctionSocket";
import { stopAllAutoPickMonitoring } from "./services/autoPickService";
import { startScoreScheduler, stopScoreScheduler } from "./services/scoreScheduler";
import { startLiveScoreUpdates, stopLiveScoreUpdates } from "./services/liveScoreService";
import { startDraftScheduler } from "./services/draftScheduler";
import { startStatsPreloader } from "./services/statsPreloader";
import { startTokenCleanupScheduler, stopTokenCleanupScheduler } from "./services/tokenCleanupService";
import { startWaiverScheduler } from "./services/waiverScheduler";
import { syncInjuriesFromSleeper } from "./services/injuryService";
import { calculateADP } from "./services/adpService";
import cron from "node-cron";
import { withCronLogging } from "./utils/cronHelper";
import waiverRoutes from "./routes/waiverRoutes";
import tradeRoutes from "./routes/tradeRoutes";
import auctionRoutes from "./routes/auctionRoutes";
import playoffRoutes from "./routes/playoffRoutes";
import leagueMedianRoutes from "./routes/leagueMedianRoutes";
import injuryRoutes from "./routes/injuryRoutes";
import adpRoutes from "./routes/adpRoutes";
import { globalApiLimiter } from "./middleware/rateLimiter";
import { checkDatabaseHealth } from "./config/database";
import { requestIdMiddleware } from "./middleware/requestId";
import pool from "./config/database";
import { logger } from "./config/logger";

// Load environment variables
dotenv.config();

// Parse and validate allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map(origin => origin.trim());

if (!allowedOrigins || allowedOrigins.length === 0) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL: ALLOWED_ORIGINS environment variable is required in production. " +
      "Example: ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com"
    );
  } else {
    // Default for development only
    logger.warn(
      "ALLOWED_ORIGINS not set. Defaulting to localhost:3000 for development."
    );
  }
}

// Use default for development if not set
const finalAllowedOrigins = allowedOrigins || ["http://localhost:3000"];

// Validate origin format
finalAllowedOrigins.forEach(origin => {
  try {
    new URL(origin);
  } catch (error) {
    throw new Error(`Invalid origin in ALLOWED_ORIGINS: ${origin}`);
  }
});

logger.info("CORS enabled for origins", { origins: finalAllowedOrigins });

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // In development, allow localhost without origin
    if (process.env.NODE_ENV !== "production" &&
        (!origin || origin.startsWith("http://localhost"))) {
      return callback(null, true);
    }

    // In production, require origin header
    if (process.env.NODE_ENV === "production" && !origin) {
      return callback(new Error("Origin header required in production"));
    }

    // Check against whitelist
    if (origin && finalAllowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true, // Allow cookies/authorization headers
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // Cache preflight requests for 24 hours
};

const app: Application = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps)
      if (!origin) {
        return callback(null, true);
      }
      // In development, allow any localhost port
      if (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost:")) {
        return callback(null, true);
      }
      // Check against allowed origins
      if (finalAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(null, false);
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;

// Setup Socket.io for draft, league, matchup, waiver, trade, and auction events
setupDraftSocket(io);
setupLeagueSocket(io);
setupMatchupSocket(io);
setupWaiverSocket(io);
setupTradeSocket(io);
setupAuctionSocket(io);

// Make io available globally for controllers
export { io };

// Middleware
app.use(helmet()); // Security headers
app.use(requestIdMiddleware); // Request ID tracking
app.use(cors(corsOptions)); // Enable CORS with configured origins
// Request size limits to prevent resource exhaustion attacks
// 100kb limit is adequate for API requests while preventing DoS via large payloads
app.use(express.json({ limit: '100kb' })); // Parse JSON bodies with size limit
app.use(express.urlencoded({ extended: true, limit: '100kb' })); // Parse URL-encoded bodies with size limit

// Global rate limiting - applies to all API routes
// 100 requests per minute per IP
app.use("/api", globalApiLimiter);

// Swagger API documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check endpoint
app.get("/health", async (req, res) => {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: "unknown",
      memory: "unknown",
    },
  };

  try {
    // Check database
    await pool.query("SELECT 1");
    health.checks.database = "healthy";
  } catch (error) {
    health.checks.database = "unhealthy";
    health.status = "degraded";
  }

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const memoryUsageMB = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
  };

  health.checks.memory = memoryUsageMB.heapUsed < 500 ? "healthy" : "warning";

  const statusCode = health.status === "healthy" ? 200 : 503;
  res.status(statusCode).json(health);
});

// Liveness probe endpoint
app.get("/health/live", (req, res) => {
  res.status(200).json({ status: "alive" });
});

// Readiness probe endpoint
app.get("/health/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ready" });
  } catch (error) {
    res.status(503).json({ status: "not ready" });
  }
});

// Version 1 API routes
const v1Router = express.Router();
v1Router.use("/auth", authRoutes);
v1Router.use("/leagues", leagueRoutes);
v1Router.use("/invites", inviteRoutes);
v1Router.use("/users", userRoutes);
v1Router.use("/drafts", draftRoutes);
v1Router.use("/players", playerRoutes);
v1Router.use("/player-stats", playerStatsRoutes);
v1Router.use("/player-projections", playerProjectionsRoutes);
v1Router.use("/rosters", rosterRoutes);
v1Router.use("/matchups", matchupRoutes);
v1Router.use("/weekly-lineups", weeklyLineupRoutes);
v1Router.use("/nfl", nflRoutes);
v1Router.use("/", waiverRoutes);
v1Router.use("/trades", tradeRoutes);
v1Router.use("/", auctionRoutes);
v1Router.use("/playoffs", playoffRoutes);
v1Router.use("/league-median", leagueMedianRoutes);
v1Router.use("/injuries", injuryRoutes);
v1Router.use("/adp", adpRoutes);

// Protected route example (to test authentication)
v1Router.get("/profile", authenticate, (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Protected route accessed successfully",
    data: {
      user: req.user,
    },
  });
});

// Mount v1 API
app.use("/api/v1", v1Router);

// Middleware to log deprecation warning for non-versioned routes
app.use("/api", (req, res, next) => {
  if (!req.path.startsWith("/v1/")) {
    logger.warn("Non-versioned API route accessed", { method: req.method, path: req.path });
    res.setHeader("X-API-Warn", "This endpoint is deprecated. Use /api/v1 instead");
  }
  next();
});

// Legacy routes (redirect to v1 for backward compatibility)
app.use("/api/auth", authRoutes);
app.use("/api/leagues", leagueRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/users", userRoutes);
app.use("/api/drafts", draftRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/player-stats", playerStatsRoutes);
app.use("/api/player-projections", playerProjectionsRoutes);
app.use("/api/rosters", rosterRoutes);
app.use("/api/matchups", matchupRoutes);
app.use("/api/weekly-lineups", weeklyLineupRoutes);
app.use("/api/nfl", nflRoutes);
app.use("/api", waiverRoutes);
app.use("/api/trades", tradeRoutes);
app.use("/api", auctionRoutes);
app.use("/api/playoffs", playoffRoutes);
app.use("/api/league-median", leagueMedianRoutes);
app.use("/api/injuries", injuryRoutes);
app.use("/api/adp", adpRoutes);

// Protected route example (to test authentication) - legacy
app.get("/api/profile", authenticate, (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Protected route accessed successfully",
    data: {
      user: req.user,
    },
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler - must be registered after all routes
import { errorHandler } from "./middleware/errorHandler";
app.use(errorHandler);

// Start server
httpServer.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
  logger.info(`Auth endpoints: http://localhost:${PORT}/api/auth`);
  logger.info(`WebSocket server running for real-time draft updates`);
  logger.info(`Auto-pick service initialized`);

  // Start background score scheduler (10 minute checks)
  startScoreScheduler();

  // Start live score updates (10 second updates during games)
  startLiveScoreUpdates(io);

  // Start draft scheduler (checks every minute for overnight pause/resume)
  startDraftScheduler(io);

  // Start stats preloader (precomputes and caches stats/projections)
  startStatsPreloader();

  // Start token cleanup scheduler (removes expired password reset tokens)
  startTokenCleanupScheduler();

  // Start waiver scheduler (processes waivers daily at 3 AM UTC)
  startWaiverScheduler();

  // Schedule injury sync (daily at 8 AM ET / 12 PM UTC)
  cron.schedule('0 12 * * *', async () => {
    await withCronLogging(
      async () => await syncInjuriesFromSleeper(),
      'Daily Injury Sync',
      { maxAttempts: 3, baseDelayMs: 1000 }
    );
  }, {
    timezone: 'UTC'
  });

  // Calculate ADP weekly (Tuesdays at 3 AM ET / 7 AM UTC)
  cron.schedule('0 7 * * 2', async () => {
    await withCronLogging(
      async () => {
        const currentSeason = new Date().getFullYear().toString();
        await calculateADP(currentSeason);
      },
      'Weekly ADP Calculation',
      { maxAttempts: 3, baseDelayMs: 1000 }
    );
  }, {
    timezone: 'UTC'
  });

  // Sync injuries on server startup
  syncInjuriesFromSleeper().catch((error) => {
    logger.error('Failed to sync injuries on startup', { error: error.message, stack: error.stack });
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  stopAllAutoPickMonitoring();
  stopScoreScheduler();
  stopLiveScoreUpdates();
  stopTokenCleanupScheduler();
  httpServer.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT signal received: closing HTTP server");
  stopAllAutoPickMonitoring();
  stopScoreScheduler();
  stopLiveScoreUpdates();
  stopTokenCleanupScheduler();
  httpServer.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});

export default app;

