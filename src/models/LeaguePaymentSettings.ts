import pool from "../config/database";

export interface PayoutStructure {
  place: number;
  amount?: number;
  percentage?: number;
}

export interface LeaguePaymentSettings {
  id: number;
  league_id: number;
  entry_fee: number;
  currency: string;
  payout_structure: PayoutStructure[] | null;
  payment_deadline_days: number;
  reminder_days_before: number;
  auto_charge_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Get payment settings for a league
 */
export async function getByLeagueId(
  leagueId: number
): Promise<LeaguePaymentSettings | null> {
  try {
    const query = `SELECT * FROM league_payment_settings WHERE league_id = $1`;
    const result = await pool.query(query, [leagueId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting league payment settings:", error);
    throw error;
  }
}

/**
 * Create payment settings for a league
 */
export async function create(
  leagueId: number,
  settings: Partial<
    Omit<LeaguePaymentSettings, "id" | "league_id" | "created_at" | "updated_at">
  >
): Promise<LeaguePaymentSettings> {
  try {
    const query = `
      INSERT INTO league_payment_settings (
        league_id,
        entry_fee,
        currency,
        payout_structure,
        payment_deadline_days,
        reminder_days_before,
        auto_charge_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      leagueId,
      settings.entry_fee ?? 0.00,
      settings.currency ?? 'USD',
      settings.payout_structure ? JSON.stringify(settings.payout_structure) : null,
      settings.payment_deadline_days ?? 7,
      settings.reminder_days_before ?? 3,
      settings.auto_charge_enabled ?? false,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error("Error creating league payment settings:", error);
    throw error;
  }
}

/**
 * Update payment settings for a league
 */
export async function update(
  leagueId: number,
  settings: Partial<
    Omit<LeaguePaymentSettings, "id" | "league_id" | "created_at" | "updated_at">
  >
): Promise<LeaguePaymentSettings | null> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic UPDATE query
    if (settings.entry_fee !== undefined) {
      fields.push(`entry_fee = $${paramCount++}`);
      values.push(settings.entry_fee);
    }

    if (settings.currency !== undefined) {
      fields.push(`currency = $${paramCount++}`);
      values.push(settings.currency);
    }

    if (settings.payout_structure !== undefined) {
      fields.push(`payout_structure = $${paramCount++}`);
      values.push(settings.payout_structure ? JSON.stringify(settings.payout_structure) : null);
    }

    if (settings.payment_deadline_days !== undefined) {
      fields.push(`payment_deadline_days = $${paramCount++}`);
      values.push(settings.payment_deadline_days);
    }

    if (settings.reminder_days_before !== undefined) {
      fields.push(`reminder_days_before = $${paramCount++}`);
      values.push(settings.reminder_days_before);
    }

    if (settings.auto_charge_enabled !== undefined) {
      fields.push(`auto_charge_enabled = $${paramCount++}`);
      values.push(settings.auto_charge_enabled);
    }

    if (fields.length === 0) {
      // No updates, return current settings
      return getByLeagueId(leagueId);
    }

    // Add updated_at
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    // Add league_id for WHERE clause
    values.push(leagueId);

    const query = `
      UPDATE league_payment_settings
      SET ${fields.join(", ")}
      WHERE league_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error updating league payment settings:", error);
    throw error;
  }
}
