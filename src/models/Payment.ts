import pool from "../config/database";
import { logger } from "../config/logger";
import { PoolClient } from "pg";

export interface PaymentTransaction {
  id: number;
  roster_payment_id: number;
  roster_id: number;
  league_id: number;
  user_id: number;
  amount: number;
  payment_method: string | null;
  external_transaction_id: string | null;
  status: "pending" | "completed" | "failed" | "refunded";
  notes: string | null;
  processed_at: Date | null;
  created_at: Date;
}

export interface CreatePaymentTransactionInput {
  roster_payment_id: number;
  roster_id: number;
  league_id: number;
  user_id: number;
  amount: number;
  payment_method?: string | null;
  external_transaction_id?: string | null;
  status?: "pending" | "completed" | "failed" | "refunded";
  notes?: string | null;
}

/**
 * Get all payment transactions for a roster payment
 */
export async function getByRosterPaymentId(
  rosterPaymentId: number
): Promise<PaymentTransaction[]> {
  try {
    const query = `
      SELECT * FROM payment_transactions
      WHERE roster_payment_id = $1
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [rosterPaymentId]);
    return result.rows;
  } catch (error: any) {
    logger.error("Error getting payment transactions by roster payment:", { error });
    throw new Error("Error getting payment transactions by roster payment");
  }
}

/**
 * Get all payment transactions for a league
 */
export async function getByLeagueId(
  leagueId: number
): Promise<any[]> {
  try {
    const query = `
      SELECT pt.*, rp.season, u.username, r.roster_id
      FROM payment_transactions pt
      JOIN roster_payments rp ON pt.roster_payment_id = rp.id
      JOIN users u ON pt.user_id = u.id
      JOIN rosters r ON pt.roster_id = r.id
      WHERE pt.league_id = $1
      ORDER BY pt.created_at DESC
    `;

    const result = await pool.query(query, [leagueId]);
    return result.rows;
  } catch (error: any) {
    logger.error("Error getting payment transactions by league:", { error });
    throw new Error("Error getting payment transactions by league");
  }
}

/**
 * Get payment transaction history for a roster
 */
export async function getByRosterId(
  rosterId: number
): Promise<PaymentTransaction[]> {
  try {
    const query = `
      SELECT * FROM payment_transactions
      WHERE roster_id = $1
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [rosterId]);
    return result.rows;
  } catch (error: any) {
    logger.error("Error getting payment transactions by roster:", { error });
    throw new Error("Error getting payment transactions by roster");
  }
}

/**
 * Create a new payment transaction
 */
export async function create(
  data: CreatePaymentTransactionInput
): Promise<PaymentTransaction> {
  const {
    roster_payment_id,
    roster_id,
    league_id,
    user_id,
    amount,
    payment_method = null,
    external_transaction_id = null,
    status = "pending",
    notes = null,
  } = data;

  try {
    const query = `
      INSERT INTO payment_transactions (
        roster_payment_id,
        roster_id,
        league_id,
        user_id,
        amount,
        payment_method,
        external_transaction_id,
        status,
        notes,
        processed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const processedAt = status === "completed" ? new Date() : null;

    const values = [
      roster_payment_id,
      roster_id,
      league_id,
      user_id,
      amount,
      payment_method,
      external_transaction_id,
      status,
      notes,
      processedAt,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error: any) {
    logger.error("Error creating payment transaction:", { error });
    throw new Error("Error creating payment transaction");
  }
}

/**
 * Update a payment transaction
 */
export async function update(
  id: number,
  updates: Partial<PaymentTransaction>
): Promise<PaymentTransaction | null> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic update query
    if (updates.amount !== undefined) {
      fields.push(`amount = $${paramCount}`);
      values.push(updates.amount);
      paramCount++;
    }

    if (updates.payment_method !== undefined) {
      fields.push(`payment_method = $${paramCount}`);
      values.push(updates.payment_method);
      paramCount++;
    }

    if (updates.external_transaction_id !== undefined) {
      fields.push(`external_transaction_id = $${paramCount}`);
      values.push(updates.external_transaction_id);
      paramCount++;
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramCount}`);
      values.push(updates.status);
      paramCount++;

      // Update processed_at if status changes to completed
      if (updates.status === "completed" && updates.processed_at === undefined) {
        fields.push(`processed_at = $${paramCount}`);
        values.push(new Date());
        paramCount++;
      }
    }

    if (updates.processed_at !== undefined) {
      fields.push(`processed_at = $${paramCount}`);
      values.push(updates.processed_at);
      paramCount++;
    }

    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramCount}`);
      values.push(updates.notes);
      paramCount++;
    }

    // If no fields to update, return current record
    if (fields.length === 0) {
      const query = "SELECT * FROM payment_transactions WHERE id = $1";
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    }

    values.push(id);

    const query = `
      UPDATE payment_transactions
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
    logger.error("Error updating payment transaction:", { error });
    throw new Error("Error updating payment transaction");
  }
}

/**
 * Record a payment (creates transaction AND updates roster_payment)
 * This is an atomic operation using BEGIN/COMMIT
 */
export async function recordPayment(
  rosterPaymentId: number,
  amount: number,
  method: string,
  externalId?: string,
  notes?: string
): Promise<{ transaction: PaymentTransaction; rosterPayment: any }> {
  const client: PoolClient = await pool.connect();

  try {
    // Start transaction
    await client.query("BEGIN");

    // Get roster payment details
    const rosterPaymentQuery = `
      SELECT * FROM roster_payments WHERE id = $1
    `;
    const rosterPaymentResult = await client.query(rosterPaymentQuery, [rosterPaymentId]);

    if (rosterPaymentResult.rows.length === 0) {
      throw new Error("Roster payment not found");
    }

    const rosterPayment = rosterPaymentResult.rows[0];

    // Create payment transaction record
    const transactionQuery = `
      INSERT INTO payment_transactions (
        roster_payment_id,
        roster_id,
        league_id,
        user_id,
        amount,
        payment_method,
        external_transaction_id,
        status,
        notes,
        processed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const transactionValues = [
      rosterPaymentId,
      rosterPayment.roster_id,
      rosterPayment.league_id,
      rosterPayment.user_id,
      amount,
      method,
      externalId || null,
      "completed",
      notes || null,
    ];

    const transactionResult = await client.query(transactionQuery, transactionValues);
    const transaction = transactionResult.rows[0];

    // Update roster_payment amounts and status
    const newAmountPaid = parseFloat(rosterPayment.amount_paid) + amount;
    const amountDue = parseFloat(rosterPayment.amount_due);

    // Determine new status
    let newStatus: "pending" | "partial" | "paid" | "overdue" | "refunded";
    if (newAmountPaid >= amountDue) {
      newStatus = "paid";
    } else if (newAmountPaid > 0) {
      newStatus = "partial";
    } else {
      newStatus = rosterPayment.status;
    }

    const updateRosterPaymentQuery = `
      UPDATE roster_payments
      SET amount_paid = $1,
          status = $2,
          paid_date = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;

    const paidDate = newStatus === "paid" ? new Date() : rosterPayment.paid_date;
    const updateValues = [newAmountPaid, newStatus, paidDate, rosterPaymentId];

    const updatedRosterPaymentResult = await client.query(
      updateRosterPaymentQuery,
      updateValues
    );
    const updatedRosterPayment = updatedRosterPaymentResult.rows[0];

    // Commit transaction
    await client.query("COMMIT");

    return {
      transaction,
      rosterPayment: updatedRosterPayment,
    };
  } catch (error: any) {
    // Rollback on error
    await client.query("ROLLBACK");
    logger.error("Error recording payment:", { error });
    throw new Error("Error recording payment");
  } finally {
    // Release client back to pool
    client.release();
  }
}
