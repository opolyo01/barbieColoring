import pool from '../pool';
import { Competition, Enrollment, Portfolio } from '../../types';

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

export async function listCompetitions(): Promise<(Competition & { participant_count: number })[]> {
  const { rows } = await pool.query(
    `SELECT c.*,
            COUNT(e.id)::int AS participant_count
     FROM competitions c
     LEFT JOIN enrollments e ON e.competition_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
  );
  return rows;
}

export async function getCompetition(id: string): Promise<Competition | null> {
  const { rows } = await pool.query<Competition>('SELECT * FROM competitions WHERE id = $1', [id]);
  return rows[0] ?? null;
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

export async function updateCompetitionStatus(id: string, status: Competition['status']): Promise<void> {
  await pool.query('UPDATE competitions SET status = $1 WHERE id = $2', [status, id]);
}

export async function getPortfolio(userId: string, competitionId: string): Promise<Portfolio | null> {
  const { rows } = await pool.query<Portfolio>(
    'SELECT * FROM portfolios WHERE user_id = $1 AND competition_id = $2',
    [userId, competitionId],
  );
  return rows[0] ?? null;
}
