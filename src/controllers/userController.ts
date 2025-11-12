// Before refactor: 34 lines
// After refactor: 28 lines
// Lines saved: 6 lines

import { Request, Response } from "express";
import { searchUsers } from "../models/User";
import { BaseController } from "./BaseController";

class UserController extends BaseController {
  /**
   * Search users
   * GET /api/users/search?query=username
   */
  search = this.asyncHandler(async (req: Request, res: Response) => {
    const query = req.query.query as string;

    if (!query || query.trim().length < 2) {
      this.respondBadRequest(res, "Query must be at least 2 characters");
      return;
    }

    const users = await searchUsers(query.trim());

    this.respondSuccess(res, users);
  });
}

const userController = new UserController();
export const search = userController.search;
