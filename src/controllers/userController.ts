import { Request, Response } from "express";
import { searchUsers } from "../models/User";

/**
 * Search users
 * GET /api/users/search?query=username
 */
export async function search(req: Request, res: Response): Promise<void> {
  try {
    const query = req.query.query as string;

    if (!query || query.trim().length < 2) {
      res.status(400).json({
        success: false,
        message: "Query must be at least 2 characters",
      });
      return;
    }

    const users = await searchUsers(query.trim());

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error: any) {
    console.error("Search users error:", error);
    res.status(500).json({
      success: false,
      message: "Error searching users",
    });
  }
}
