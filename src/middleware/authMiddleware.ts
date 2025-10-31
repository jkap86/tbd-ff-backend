import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../utils/jwt";

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error('[Auth] Missing or invalid Authorization header', {
        endpoint: `${req.method} ${req.path}`,
        hasAuthHeader: !!authHeader,
        authHeaderValue: authHeader ? authHeader.substring(0, 20) + '...' : 'none',
      });
      res.status(401).json({
        success: false,
        message: "No token provided",
      });
      return;
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyToken(token);

    // Attach user info to request
    req.user = decoded;

    next();
  } catch (error: any) {
    console.error('[Auth] Authentication error', {
      endpoint: `${req.method} ${req.path}`,
      errorMessage: error.message,
    });

    if (error.message === "Token expired") {
      res.status(401).json({
        success: false,
        message: "Token expired",
      });
      return;
    }

    if (error.message === "Invalid token") {
      res.status(401).json({
        success: false,
        message: "Invalid token",
      });
      return;
    }

    res.status(401).json({
      success: false,
      message: "Authentication failed",
    });
  }
}
