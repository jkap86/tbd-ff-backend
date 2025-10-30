import express, { Application, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";
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
import waiverRoutes from "./routes/waiverRoutes";
import tradeRoutes from "./routes/tradeRoutes";
import auctionRoutes from "./routes/auctionRoutes";
import playoffRoutes from "./routes/playoffRoutes";
import leagueMedianRoutes from "./routes/leagueMedianRoutes";
import { globalApiLimiter } from "./middleware/rateLimiter";
import { checkDatabaseHealth } from "./config/database";

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
    console.warn(
      "WARNING: ALLOWED_ORIGINS not set. Defaulting to localhost:3000 for development."
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

console.log("CORS enabled for origins:", finalAllowedOrigins);

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // In development, allow any localhost port
    if (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost:")) {
      return callback(null, true);
    }

    if (finalAllowedOrigins.includes(origin)) {
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
app.use(cors(corsOptions)); // Enable CORS with configured origins
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Global rate limiting - applies to all API routes
// 100 requests per minute per IP
app.use("/api", globalApiLimiter);

// Health check endpoint
app.get("/health", async (_req, res) => {
  const dbHealthy = await checkDatabaseHealth();

  if (dbHealthy) {
    res.status(200).json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});

// API Routes
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

// Protected route example (to test authentication)
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

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: Function) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth endpoints: http://localhost:${PORT}/api/auth`);
  console.log(`🔌 WebSocket server running for real-time draft updates`);
  console.log(`⏱️  Auto-pick service initialized`);

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
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  stopAllAutoPickMonitoring();
  stopScoreScheduler();
  stopLiveScoreUpdates();
  stopTokenCleanupScheduler();
  httpServer.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  stopAllAutoPickMonitoring();
  stopScoreScheduler();
  stopLiveScoreUpdates();
  stopTokenCleanupScheduler();
  httpServer.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

export default app;

