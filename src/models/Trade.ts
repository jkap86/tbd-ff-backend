import pool from "../config/database";

export interface Trade {
  id: number;
  league_id: number;
  proposer_roster_id: number;
  receiver_roster_id: number;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  proposer_message?: string;
  rejection_reason?: string;
  proposed_at: Date;
  responded_at?: Date;
  processed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface TradeWithDetails extends Trade {
  proposer_name?: string;
  receiver_name?: string;
  proposer_team_name?: string;
  receiver_team_name?: string;
  items?: TradeItem[];
}

export interface TradeItem {
  id: number;
  trade_id: number;
  from_roster_id: number;
  to_roster_id: number;
  player_id: number;
  player_name?: string;
  created_at: Date;
}

/**
 * Get trade by ID
 */
export async function getTrade(tradeId: number): Promise<Trade | null> {
  const query = "SELECT * FROM trades WHERE id = $1";
  const result = await pool.query(query, [tradeId]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Get trade with all details (items, roster names)
 */
export async function getTradeWithDetails(
  tradeId: number
): Promise<TradeWithDetails | null> {
  const query = `
    SELECT
      t.*,
      COALESCE(pr.settings->>'team_name', pu.username, 'Team ' || pr.roster_id) as proposer_team_name,
      COALESCE(rr.settings->>'team_name', ru.username, 'Team ' || rr.roster_id) as receiver_team_name,
      pu.username as proposer_name,
      ru.username as receiver_name
    FROM trades t
    LEFT JOIN rosters pr ON t.proposer_roster_id = pr.id
    LEFT JOIN rosters rr ON t.receiver_roster_id = rr.id
    LEFT JOIN users pu ON pr.user_id = pu.id
    LEFT JOIN users ru ON rr.user_id = ru.id
    WHERE t.id = $1
  `;

  const result = await pool.query(query, [tradeId]);

  if (result.rows.length === 0) {
    return null;
  }

  const trade = result.rows[0];

  // Get trade items
  const items = await getTradeItems(tradeId);
  trade.items = items;

  return trade;
}

/**
 * Get all trades for a league
 */
export async function getLeagueTrades(
  leagueId: number,
  status?: string
): Promise<TradeWithDetails[]> {
  let query = `
    SELECT
      t.*,
      COALESCE(pr.settings->>'team_name', pu.username, 'Team ' || pr.roster_id) as proposer_team_name,
      COALESCE(rr.settings->>'team_name', ru.username, 'Team ' || rr.roster_id) as receiver_team_name,
      pu.username as proposer_name,
      ru.username as receiver_name
    FROM trades t
    LEFT JOIN rosters pr ON t.proposer_roster_id = pr.id
    LEFT JOIN rosters rr ON t.receiver_roster_id = rr.id
    LEFT JOIN users pu ON pr.user_id = pu.id
    LEFT JOIN users ru ON rr.user_id = ru.id
    WHERE t.league_id = $1
  `;

  const params: any[] = [leagueId];

  if (status) {
    query += ` AND t.status = $2`;
    params.push(status);
  }

  query += ` ORDER BY t.proposed_at DESC`;

  const result = await pool.query(query, params);

  // Get items for each trade
  const trades = await Promise.all(
    result.rows.map(async (trade) => {
      const items = await getTradeItems(trade.id);
      return { ...trade, items };
    })
  );

  return trades;
}

/**
 * Get all trades involving a specific roster
 */
export async function getRosterTrades(
  rosterId: number
): Promise<TradeWithDetails[]> {
  const query = `
    SELECT
      t.*,
      COALESCE(pr.settings->>'team_name', pu.username, 'Team ' || pr.roster_id) as proposer_team_name,
      COALESCE(rr.settings->>'team_name', ru.username, 'Team ' || rr.roster_id) as receiver_team_name,
      pu.username as proposer_name,
      ru.username as receiver_name
    FROM trades t
    LEFT JOIN rosters pr ON t.proposer_roster_id = pr.id
    LEFT JOIN rosters rr ON t.receiver_roster_id = rr.id
    LEFT JOIN users pu ON pr.user_id = pu.id
    LEFT JOIN users ru ON rr.user_id = ru.id
    WHERE t.proposer_roster_id = $1 OR t.receiver_roster_id = $1
    ORDER BY t.proposed_at DESC
  `;

  const result = await pool.query(query, [rosterId]);

  // Get items for each trade
  const trades = await Promise.all(
    result.rows.map(async (trade) => {
      const items = await getTradeItems(trade.id);
      return { ...trade, items };
    })
  );

  return trades;
}

/**
 * Create a new trade
 */
export async function createTrade(params: {
  league_id: number;
  proposer_roster_id: number;
  receiver_roster_id: number;
  proposer_message?: string;
}): Promise<Trade> {
  const query = `
    INSERT INTO trades (league_id, proposer_roster_id, receiver_roster_id, proposer_message)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  const result = await pool.query(query, [
    params.league_id,
    params.proposer_roster_id,
    params.receiver_roster_id,
    params.proposer_message || null,
  ]);

  return result.rows[0];
}

/**
 * Update trade status
 */
export async function updateTradeStatus(
  tradeId: number,
  status: "pending" | "accepted" | "rejected" | "cancelled",
  extras?: {
    rejection_reason?: string;
    responded_at?: Date;
    processed_at?: Date;
  }
): Promise<Trade> {
  let query = `UPDATE trades SET status = $1, updated_at = CURRENT_TIMESTAMP`;
  const params: any[] = [status];
  let paramCount = 1;

  if (extras?.rejection_reason) {
    paramCount++;
    query += `, rejection_reason = $${paramCount}`;
    params.push(extras.rejection_reason);
  }

  if (extras?.responded_at) {
    paramCount++;
    query += `, responded_at = $${paramCount}`;
    params.push(extras.responded_at);
  }

  if (extras?.processed_at) {
    paramCount++;
    query += `, processed_at = $${paramCount}`;
    params.push(extras.processed_at);
  }

  query += ` WHERE id = $${paramCount + 1} RETURNING *`;
  params.push(tradeId);

  const result = await pool.query(query, params);
  return result.rows[0];
}

/**
 * Get all items in a trade
 */
export async function getTradeItems(tradeId: number): Promise<TradeItem[]> {
  const query = `
    SELECT
      ti.*,
      p.full_name as player_name
    FROM trade_items ti
    LEFT JOIN players p ON ti.player_id = p.id
    WHERE ti.trade_id = $1
  `;

  const result = await pool.query(query, [tradeId]);
  return result.rows;
}

/**
 * Add item to trade
 */
export async function addTradeItem(params: {
  trade_id: number;
  from_roster_id: number;
  to_roster_id: number;
  player_id: number;
  player_name?: string;
}): Promise<TradeItem> {
  const query = `
    INSERT INTO trade_items (trade_id, from_roster_id, to_roster_id, player_id, player_name)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  const result = await pool.query(query, [
    params.trade_id,
    params.from_roster_id,
    params.to_roster_id,
    params.player_id,
    params.player_name || null,
  ]);

  return result.rows[0];
}

/**
 * Delete all items for a trade
 */
export async function deleteTradeItems(tradeId: number): Promise<void> {
  await pool.query("DELETE FROM trade_items WHERE trade_id = $1", [tradeId]);
}
