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
import { setupDerbySocket } from "./socket/derbySocket";
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
import keeperRoutes from "./routes/keeperRoutes";
import dynastyRoutes from "./routes/dynastyRoutes";
import draftPickTradeRoutes from "./routes/draftPickTradeRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import { globalApiLimiter } from "./middleware/rateLimiter";
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

    // In production, allow requests without origin (mobile apps, native clients)
    // Mobile apps typically don't send origin headers
    if (!origin) {
      return callback(null, true);
    }

    // Check against whitelist
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
setupDerbySocket();
setupLeagueSocket(io);
setupMatchupSocket(io);
setupWaiverSocket(io);
setupTradeSocket(io);
setupAuctionSocket(io);

// Make io available globally for controllers
export { io };

// Trust proxy for Heroku (enables x-forwarded-* headers)
// Set to 1 to trust only the first proxy (Heroku router) for security
app.set('trust proxy', 1);

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
app.get("/health", async (_req, res) => {
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
app.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "alive" });
});

// Readiness probe endpoint
app.get("/health/ready", async (_req, res) => {
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
v1Router.use("/", keeperRoutes);
v1Router.use("/", dynastyRoutes);
v1Router.use("/", draftPickTradeRoutes);
v1Router.use("/notifications", notificationRoutes);

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

// Mount v1 API (all routes now use versioned endpoints)
app.use("/api/v1", v1Router);

// Test push notifications page
app.get("/test-push", (req: Request, res: Response) => {
  res.send(\`<!DOCTYPE html>
<html><head><title>Push Test</title><style>
body{font-family:Arial;max-width:800px;margin:50px auto;padding:20px;background:#f5f5f5}
.container{background:white;padding:30px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,.1)}
button{background:#4CAF50;color:white;padding:12px 24px;border:none;border-radius:4px;cursor:pointer;margin:5px}
button:disabled{background:#ccc}
.result{margin:15px 0;padding:15px;border-radius:4px;font-family:monospace;white-space:pre-wrap}
.success{background:#d4edda;color:#155724}.error{background:#f8d7da;color:#721c24}.info{background:#d1ecf1;color:#0c5460}
input{padding:8px;width:300px;margin:5px;border:1px solid #ddd;border-radius:4px}
</style></head><body><div class="container">
<h1>🔔 Push Notification Test</h1>
<div><h2>Login</h2>
<input id="user" placeholder="Username"><input id="pass" type="password" placeholder="Password">
<button onclick="login()">Login</button><div id="loginRes" class="result" style="display:none"></div></div>
<div><h2>Register Token</h2>
<button onclick="reg()" id="regBtn" disabled>Register Test Token</button>
<div id="regRes" class="result" style="display:none"></div></div></div>
<script>
const API='/api/v1';let token;
async function login(){
const u=document.getElementById('user').value,p=document.getElementById('pass').value,r=document.getElementById('loginRes');
r.style.display='block';r.className='result info';r.textContent='Logging in...';
try{
const res=await fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
const d=await res.json();
if(res.ok){token=d.token;r.className='result success';r.textContent='✅ Login OK! User:'+d.user.username;document.getElementById('regBtn').disabled=false}
else{r.className='result error';r.textContent='❌ Failed:'+d.message}}
catch(e){r.className='result error';r.textContent='❌ Error:'+e.message}}
async function reg(){
const r=document.getElementById('regRes');r.style.display='block';r.className='result info';r.textContent='Registering...';
try{
const res=await fetch(API+'/notifications/token',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
body:JSON.stringify({token:'test_web_'+Date.now(),device_type:'web',device_id:'web_test'})});
const d=await res.json();
if(res.ok){r.className='result success';r.textContent='✅ Registered! '+JSON.stringify(d)}
else{r.className='result error';r.textContent='❌ Failed('+res.status+'):'+JSON.stringify(d)}}
catch(e){r.className='result error';r.textContent='❌ Error:'+e.message}}
</script></body></html>\`);
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

