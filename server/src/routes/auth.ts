import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';
import { User } from '../types';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  const { email, displayName, password } = req.body as {
    email?: string;
    displayName?: string;
    password?: string;
  };

  if (!email || !displayName || !password) {
    res.status(400).json({ error: 'email, displayName, and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const { rows } = await pool.query<User>(
      `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, display_name, created_at`,
      [email.toLowerCase().trim(), displayName.trim(), passwordHash],
    );
    const user = rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET ?? 'secret', { expiresIn: '7d' });
    res.status(201).json({ user, token });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    throw err;
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const { rows } = await pool.query<User & { password_hash: string }>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase().trim()],
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET ?? 'secret', { expiresIn: '7d' });
  res.json({
    user: { id: user.id, email: user.email, display_name: user.display_name, created_at: user.created_at },
    token,
  });
});

export default router;
