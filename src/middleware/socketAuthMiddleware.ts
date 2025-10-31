import { Socket } from "socket.io";
import { verifyToken, JwtPayload } from "../utils/jwt";

// Extend Socket data interface to include authenticated user
declare module "socket.io" {
  interface SocketData {
    user?: JwtPayload;
  }
}

/**
 * Socket.io authentication middleware
 * Verifies JWT token from socket handshake and attaches user to socket.data
 */
export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  try {
    // Get token from handshake auth
    const token = socket.handshake.auth.token;

    if (!token) {
      console.log(`[SocketAuth] Connection rejected: No token provided (socket: ${socket.id})`);
      return next(new Error("Authentication failed: No token provided"));
    }

    // Verify token
    const decoded = verifyToken(token);

    // Store verified user in socket data
    socket.data.user = decoded;

    console.log(`[SocketAuth] User ${decoded.username} (${decoded.userId}) authenticated (socket: ${socket.id})`);
    next();
  } catch (error: any) {
    console.log(`[SocketAuth] Connection rejected: ${error.message} (socket: ${socket.id})`);

    if (error.message === "Token expired") {
      return next(new Error("Authentication failed: Token expired"));
    }

    if (error.message === "Invalid token") {
      return next(new Error("Authentication failed: Invalid token"));
    }

    return next(new Error("Authentication failed: Token verification failed"));
  }
}
