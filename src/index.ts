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
import { setupDraftSocket } from "./socket/draftSocket";

// Load environment variables
dotenv.config();

const app: Application = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

// Setup Socket.io for draft events
setupDraftSocket(io);

// Make io available globally for controllers
export { io };

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/leagues", leagueRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/users", userRoutes);
app.use("/api/drafts", draftRoutes);
app.use("/api/players", playerRoutes);

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
});

export default app;
