import pool from "../config/database";

export interface RosterPayment {
  id: number;
  roster_id: number;
  league_id: number;
  user_id: number;
  season: string;
  amount_due: number;
  amount_paid: number;
  status: "pending" | "partial" | "paid" | "overdue" | "refunded";
  due_date: Date | null;
  paid_date: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateRosterPaymentInput {
  roster_id: number;
  league_id: number;
  user_id: number;
  season: string;
  amount_due: number;
  amount_paid?: number;
  status?: "pending" | "partial" | "paid" | "overdue" | "refunded";
  due_date?: Date | null;
  paid_date?: Date | null;
  notes?: string | null;
}

export interface PaymentStatusSummary {
  total_due: number;
  total_paid: number;
  count_paid: number;
  count_unpaid: number;
  count_partial: number;
  count_overdue: number;
}

/**
 * Get all roster payments for a league
 */
export async function getByLeagueId(
  leagueId: number,
  season?: string
): Promise<RosterPayment[]> {
  try {
    let query = `
      SELECT rp.*, r.roster_id, u.username, u.email
      FROM roster_payments rp
      JOIN rosters r ON rp.roster_id = r.id
      JOIN users u ON rp.user_id = u.id
      WHERE rp.league_id = $1
    `;

    const values: any[] = [leagueId];

    if (season) {
      query += ` AND rp.season = $2`;
      values.push(season);
    }

    query += ` ORDER BY rp.created_at DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting roster payments by league:", error);
    throw new Error("Error getting roster payments by league");
  }
}

/**
 * Get payment history for a specific roster
 */
export async function getByRosterId(
  rosterId: number,
  season?: string
): Promise<RosterPayment[]> {
  try {
    let query = `
      SELECT * FROM roster_payments
      WHERE roster_id = $1
    `;

    const values: any[] = [rosterId];

    if (season) {
      query += ` AND season = $2`;
      values.push(season);
    }

    query += ` ORDER BY season DESC, created_at DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting roster payments by roster:", error);
    throw new Error("Error getting roster payments by roster");
  }
}

/**
 * Get all payments across all leagues for a specific user
 */
export async function getByUserId(userId: number): Promise<any[]> {
  try {
    const query = `
      SELECT rp.*, r.roster_id, l.name as league_name
      FROM roster_payments rp
      JOIN rosters r ON rp.roster_id = r.id
      JOIN leagues l ON rp.league_id = l.id
      WHERE rp.user_id = $1
      ORDER BY rp.season DESC, rp.created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting roster payments by user:", error);
    throw new Error("Error getting roster payments by user");
  }
}

/**
 * Create a new roster payment record
 */
export async function create(
  data: CreateRosterPaymentInput
): Promise<RosterPayment> {
  const {
    roster_id,
    league_id,
    user_id,
    season,
    amount_due,
    amount_paid = 0.00,
    status = "pending",
    due_date = null,
    paid_date = null,
    notes = null,
  } = data;

  try {
    const query = `
      INSERT INTO roster_payments (
        roster_id,
        league_id,
        user_id,
        season,
        amount_due,
        amount_paid,
        status,
        due_date,
        paid_date,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      roster_id,
      league_id,
      user_id,
      season,
      amount_due,
      amount_paid,
      status,
      due_date,
      paid_date,
      notes,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error: any) {
    console.error("Error creating roster payment:", error);

    // Handle unique constraint violation
    if (error.code === "23505") {
      throw new Error("Payment record already exists for this roster and season");
    }

    throw new Error("Error creating roster payment");
  }
}

/**
 * Update a roster payment record
 */
export async function update(
  id: number,
  updates: Partial<RosterPayment>
): Promise<RosterPayment | null> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic update query
    if (updates.amount_due !== undefined) {
      fields.push(`amount_due = $${paramCount}`);
      values.push(updates.amount_due);
      paramCount++;
    }

    if (updates.amount_paid !== undefined) {
      fields.push(`amount_paid = $${paramCount}`);
      values.push(updates.amount_paid);
      paramCount++;
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramCount}`);
      values.push(updates.status);
      paramCount++;
    }

    if (updates.due_date !== undefined) {
      fields.push(`due_date = $${paramCount}`);
      values.push(updates.due_date);
      paramCount++;
    }

    if (updates.paid_date !== undefined) {
      fields.push(`paid_date = $${paramCount}`);
      values.push(updates.paid_date);
      paramCount++;
    }

    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramCount}`);
      values.push(updates.notes);
      paramCount++;
    }

    // If no fields to update, return current record
    if (fields.length === 0) {
      const query = "SELECT * FROM roster_payments WHERE id = $1";
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    }

    values.push(id);

    const query = `
      UPDATE roster_payments
      SET ${fields.join(", ")}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error updating roster payment:", error);
    throw new Error("Error updating roster payment");
  }
}

/**
 * Get payment status summary for a league and season
 * Returns total amounts due/paid and counts by status
 */
export async function getPaymentStatus(
  leagueId: number,
  season: string
): Promise<PaymentStatusSummary> {
  try {
    const query = `
      SELECT
        COALESCE(SUM(amount_due), 0) as total_due,
        COALESCE(SUM(amount_paid), 0) as total_paid,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as count_paid,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as count_unpaid,
        COUNT(CASE WHEN status = 'partial' THEN 1 END) as count_partial,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) as count_overdue
      FROM roster_payments
      WHERE league_id = $1 AND season = $2
    `;

    const result = await pool.query(query, [leagueId, season]);

    if (result.rows.length === 0) {
      return {
        total_due: 0,
        total_paid: 0,
        count_paid: 0,
        count_unpaid: 0,
        count_partial: 0,
        count_overdue: 0,
      };
    }

    const row = result.rows[0];
    return {
      total_due: parseFloat(row.total_due),
      total_paid: parseFloat(row.total_paid),
      count_paid: parseInt(row.count_paid),
      count_unpaid: parseInt(row.count_unpaid),
      count_partial: parseInt(row.count_partial),
      count_overdue: parseInt(row.count_overdue),
    };
  } catch (error: any) {
    console.error("Error getting payment status:", error);
    throw new Error("Error getting payment status");
  }
}

/**
 * Get a single roster payment by ID
 */
export async function getById(id: number): Promise<RosterPayment | null> {
  try {
    const query = `SELECT * FROM roster_payments WHERE id = $1`;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error getting roster payment by ID:", error);
    throw new Error("Error getting roster payment by ID");
  }
}

/**
 * Get a roster payment by roster and season
 */
export async function getByRosterAndSeason(
  rosterId: number,
  season: string
): Promise<RosterPayment | null> {
  try {
    const query = `
      SELECT * FROM roster_payments
      WHERE roster_id = $1 AND season = $2
    `;

    const result = await pool.query(query, [rosterId, season]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error getting roster payment by roster and season:", error);
    throw new Error("Error getting roster payment by roster and season");
  }
}

/**
 * Delete a roster payment record
 */
export async function deleteById(id: number): Promise<boolean> {
  try {
    const query = `DELETE FROM roster_payments WHERE id = $1 RETURNING id`;
    const result = await pool.query(query, [id]);
    return result.rows.length > 0;
  } catch (error: any) {
    console.error("Error deleting roster payment:", error);
    throw new Error("Error deleting roster payment");
  }
}

/**
 * Mark a payment as overdue
 */
export async function markAsOverdue(id: number): Promise<RosterPayment | null> {
  try {
    const query = `
      UPDATE roster_payments
      SET status = 'overdue',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status != 'paid' AND status != 'refunded'
      RETURNING *
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error marking payment as overdue:", error);
    throw new Error("Error marking payment as overdue");
  }
}

/**
 * Record a payment (updates amount_paid and status)
 */
export async function recordPayment(
  id: number,
  amount: number
): Promise<RosterPayment | null> {
  try {
    // Get current payment record
    const current = await getById(id);
    if (!current) {
      throw new Error("Payment record not found");
    }

    const newAmountPaid = parseFloat(current.amount_paid.toString()) + amount;
    const amountDue = parseFloat(current.amount_due.toString());

    // Determine new status
    let newStatus: "pending" | "partial" | "paid" | "overdue" | "refunded";
    if (newAmountPaid >= amountDue) {
      newStatus = "paid";
    } else if (newAmountPaid > 0) {
      newStatus = "partial";
    } else {
      newStatus = current.status;
    }

    const query = `
      UPDATE roster_payments
      SET amount_paid = $1,
          status = $2,
          paid_date = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;

    const paidDate = newStatus === "paid" ? new Date() : current.paid_date;
    const values = [newAmountPaid, newStatus, paidDate, id];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error recording payment:", error);
    throw new Error("Error recording payment");
  }
}
