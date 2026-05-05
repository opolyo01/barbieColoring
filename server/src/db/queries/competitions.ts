import pool from '../pool';
import { Competition, Enrollment, Portfolio } from '../../types';

interface AdminParticipantRow {
  user_id: string;
  email: string;
  display_name: string;
  joined_at: Date;
  cash_balance: string;
  pending_orders: number;
  symbol: string | null;
  qty: string | null;
}

export interface CompetitionAdminParticipant {
  user_id: string;
  email: string;
  display_name: string;
  joined_at: Date;
  cash_balance: number;
  pending_orders: number;
  holdings: Array<{ symbol: string; qty: number }>;
}

export async function createCompetition(
  name: string,
  description: string | null,
  startDate: Date,
  endDate: Date,
  startingBalance: number,
  createdBy: string,
): Promise<Competition> {
  const { rows } = await pool.query<Competition>(
    `INSERT INTO competitions (name, description, start_date, end_date, starting_balance, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, description, startDate, endDate, startingBalance, createdBy],
  );
  return rows[0];
}

const STATUS_EXPR = `CASE WHEN NOW() < c.start_date THEN 'pending' WHEN NOW() > c.end_date THEN 'closed' ELSE 'active' END`;

export async function listCompetitions(userId: string): Promise<(Competition & { participant_count: number; enrolled: boolean })[]> {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.description, c.start_date, c.end_date, c.starting_balance, c.invite_code, c.created_by, c.created_at,
            ${STATUS_EXPR} AS status,
            COUNT(e.id)::int AS participant_count,
            EXISTS(
              SELECT 1
              FROM enrollments me
              WHERE me.competition_id = c.id AND me.user_id = $1
            ) AS enrolled
     FROM competitions c
     LEFT JOIN enrollments e ON e.competition_id = c.id
     WHERE c.created_by = $1
        OR EXISTS (
          SELECT 1
          FROM enrollments me
          WHERE me.competition_id = c.id AND me.user_id = $1
        )
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function getCompetition(id: string): Promise<Competition | null> {
  const { rows } = await pool.query<Competition>(
    `SELECT c.id, c.name, c.description, c.start_date, c.end_date, c.starting_balance, c.invite_code, c.created_by, c.created_at,
            ${STATUS_EXPR} AS status
     FROM competitions c WHERE c.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getCompetitionByInviteCode(inviteCode: string): Promise<Competition | null> {
  const { rows } = await pool.query<Competition>(
    `SELECT c.id, c.name, c.description, c.start_date, c.end_date, c.starting_balance, c.invite_code, c.created_by, c.created_at,
            ${STATUS_EXPR} AS status
     FROM competitions c
     WHERE c.invite_code = $1`,
    [inviteCode],
  );
  return rows[0] ?? null;
}

export async function getCompetitionAdminParticipants(competitionId: string): Promise<CompetitionAdminParticipant[]> {
  const { rows } = await pool.query<AdminParticipantRow>(
    `SELECT u.id AS user_id,
            u.email,
            u.display_name,
            e.joined_at,
            p.cash_balance,
            (
              SELECT COUNT(*)::int
              FROM orders o
              WHERE o.user_id = e.user_id
                AND o.competition_id = e.competition_id
                AND o.status = 'pending'
            ) AS pending_orders,
            h.symbol,
            h.qty
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN portfolios p ON p.user_id = e.user_id AND p.competition_id = e.competition_id
     LEFT JOIN holdings h ON h.portfolio_id = p.id AND h.qty != 0
     WHERE e.competition_id = $1
     ORDER BY e.joined_at ASC, u.display_name ASC`,
    [competitionId],
  );

  const byUser = new Map<string, CompetitionAdminParticipant>();

  for (const row of rows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        user_id: row.user_id,
        email: row.email,
        display_name: row.display_name,
        joined_at: row.joined_at,
        cash_balance: Number(row.cash_balance),
        pending_orders: Number(row.pending_orders),
        holdings: [],
      });
    }

    if (row.symbol && row.qty) {
      byUser.get(row.user_id)!.holdings.push({
        symbol: row.symbol,
        qty: Number(row.qty),
      });
    }
  }

  return Array.from(byUser.values());
}

export async function enrollUser(userId: string, competitionId: string): Promise<void> {
  const comp = await getCompetition(competitionId);
  if (!comp) throw new Error('Competition not found');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO enrollments (user_id, competition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, competitionId],
    );

    await client.query(
      `INSERT INTO portfolios (user_id, competition_id, cash_balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, competition_id) DO NOTHING`,
      [userId, competitionId, comp.starting_balance],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getEnrollment(userId: string, competitionId: string): Promise<Enrollment | null> {
  const { rows } = await pool.query<Enrollment>(
    'SELECT * FROM enrollments WHERE user_id = $1 AND competition_id = $2',
    [userId, competitionId],
  );
  return rows[0] ?? null;
}

export async function unenrollUser(userId: string, competitionId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE orders
       SET status = 'cancelled'
       WHERE user_id = $1 AND competition_id = $2 AND status = 'pending'`,
      [userId, competitionId],
    );

    await client.query(
      `DELETE FROM portfolios
       WHERE user_id = $1 AND competition_id = $2`,
      [userId, competitionId],
    );

    const result = await client.query(
      `DELETE FROM enrollments
       WHERE user_id = $1 AND competition_id = $2`,
      [userId, competitionId],
    );

    await client.query('COMMIT');
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteCompetition(id: string, createdBy: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM competitions WHERE id = $1 AND created_by = $2',
    [id, createdBy],
  );
  return (result.rowCount ?? 0) > 0;
}
