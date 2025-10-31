import pool from "../config/database";

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

/**
 * Search users by username or email
 */
export async function searchUsers(
  query: string,
  limit: number = 10
): Promise<User[]> {
  try {
    const searchQuery = `
      SELECT id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
      FROM users
      WHERE username ILIKE $1 OR email ILIKE $1
      ORDER BY username
      LIMIT $2
    `;

    const result = await pool.query(searchQuery, [`%${query}%`, limit]);
    return result.rows;
  } catch (error) {
    console.error("Error searching users:", error);
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
    console.error("Error creating user:", error);

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
 */
export async function getUserById(userId: number): Promise<User | null> {
  try {
    const query = `
      SELECT id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
      FROM users
      WHERE id = $1
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting user:", error);
    throw new Error("Error getting user");
  }
}

/**
 * Get user by username
 */
export async function getUserByUsername(
  username: string
): Promise<User | null> {
  try {
    const query = `
      SELECT id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
      FROM users
      WHERE username = $1
    `;

    const result = await pool.query(query, [username]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting user by username:", error);
    throw new Error("Error getting user by username");
  }
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
    console.error("Error getting user by username:", error);
    throw new Error("Error getting user by username");
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const query = `
      SELECT id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
      FROM users
      WHERE email = $1
    `;

    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting user by email:", error);
    throw new Error("Error getting user by email");
  }
}

/**
 * Update user password
 */
export async function updateUserPassword(
  userId: number,
  hashedPassword: string
): Promise<void> {
  try {
    const query = `
      UPDATE users
      SET password = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;

    await pool.query(query, [hashedPassword, userId]);
  } catch (error) {
    console.error("Error updating user password:", error);
    throw new Error("Error updating user password");
  }
}
