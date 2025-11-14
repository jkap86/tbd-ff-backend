import pool from "../config/database";
import { logger } from "../config/logger";
import { escapeLikePattern } from "../utils/sqlHelpers";
import { BaseRepository } from "./BaseRepository";

export interface User {
  id: number;
  username: string;
  email: string;
  phone_number?: string;
  is_phone_verified: boolean;
  is_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users', 'id');
  }
}

const userRepo = new UserRepository();

/**
 * Search users by username or email
 */
export async function searchUsers(
  query: string,
  limit: number = 10
): Promise<User[]> {
  try {
    const escapedQuery = escapeLikePattern(query);
    const searchQuery = `
      SELECT id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
      FROM users
      WHERE username ILIKE $1 OR email ILIKE $1
      ORDER BY username
      LIMIT $2
    `;

    const result = await pool.query(searchQuery, [`%${escapedQuery}%`, limit]);
    return result.rows;
  } catch (error) {
    logger.error("Error searching users:", { error });
    throw new Error("Error searching users");
  }
}

/**
 * Create a new user
 */
export async function createUser(
  username: string,
  email: string,
  password: string,
  phoneNumber?: string
): Promise<User> {
  try {
    const query = `
      INSERT INTO users (username, email, password, phone_number)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
    `;

    const result = await pool.query(query, [
      username,
      email,
      password,
      phoneNumber,
    ]);
    return result.rows[0];
  } catch (error: any) {
    logger.error("Error creating user:", { error });

    // Check for unique constraint violations
    if (error.code === "23505") {
      if (error.constraint === "users_username_key") {
        throw new Error("Username already exists");
      }
      if (error.constraint === "users_email_key") {
        throw new Error("Email already exists");
      }
    }

    throw new Error("Error creating user");
  }
}

/**
 * Get user by ID
 * BEFORE: 18 lines with manual query
 * AFTER: 1 line using BaseRepository
 */
export async function getUserById(userId: number): Promise<User | null> {
  return userRepo.findById(userId);
}

/**
 * Get user by username
 * BEFORE: 20 lines with manual query
 * AFTER: 2 lines using BaseRepository
 */
export async function getUserByUsername(
  username: string
): Promise<User | null> {
  const users = await userRepo.findBy('username', username);
  return users.length > 0 ? users[0] : null;
}

/**
 * Get user by username (for authentication - includes password)
 */
export async function getUserByUsernameWithPassword(
  username: string
): Promise<any | null> {
  try {
    const query = `
      SELECT id, username, email, password, phone_number, is_phone_verified, is_admin, created_at, updated_at
      FROM users
      WHERE username = $1
    `;

    const result = await pool.query(query, [username]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error("Error getting user by username:", { error });
    throw new Error("Error getting user by username");
  }
}

/**
 * Get user by email
 * BEFORE: 18 lines with manual query
 * AFTER: 2 lines using BaseRepository
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const users = await userRepo.findBy('email', email);
  return users.length > 0 ? users[0] : null;
}

/**
 * Update user password
 * BEFORE: 15 lines with manual query
 * AFTER: 1 line using BaseRepository
 */
export async function updateUserPassword(
  userId: number,
  hashedPassword: string
): Promise<void> {
  await userRepo.update(userId, { password: hashedPassword } as any);
}
