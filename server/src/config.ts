import './loadEnv';

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set before starting the server`);
  }
  return value;
}

function requireJwtSecret(): string {
  const value = requireValue('JWT_SECRET');
  if (!value || value === 'secret' || value.length < 32) {
    throw new Error('JWT_SECRET must be set to a strong random value (32+ chars) before starting the server');
  }
  return value;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function parseLockId(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function assertNonLocalUrl(name: string, value: string, isProduction: boolean): string {
  if (!isProduction) return value;
  if (/localhost|127\.0\.0\.1/i.test(value)) {
    throw new Error(`${name} must point at a real public URL in production`);
  }
  return value;
}

export const NODE_ENV = process.env.NODE_ENV?.trim() || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const JWT_SECRET = requireJwtSecret();
export const DATABASE_URL = requireValue('DATABASE_URL');
export const DATABASE_SSL = parseBoolean(process.env.DATABASE_SSL) ?? IS_PRODUCTION;
export const PORT = parsePositiveInt(process.env.PORT, 4000);
export const SERVER_URL = assertNonLocalUrl(
  'SERVER_URL',
  process.env.SERVER_URL?.trim() || `http://localhost:${PORT}`,
  IS_PRODUCTION,
);
export const CLIENT_ORIGIN = assertNonLocalUrl(
  'CLIENT_ORIGIN',
  process.env.CLIENT_ORIGIN?.trim() || 'http://localhost:3000',
  IS_PRODUCTION,
);
export const TICK_INTERVAL_MS = parsePositiveInt(process.env.TICK_INTERVAL_MS, 1000);
export const SINGLE_INSTANCE_LOCK_ID = parseLockId(process.env.SINGLE_INSTANCE_LOCK_ID, 42424201);
export const MAX_ORDER_QTY = parsePositiveInt(process.env.MAX_ORDER_QTY, 1_000_000);
export const AUTH_RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
export const AUTH_RATE_LIMIT_MAX = parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 120);
export const ORDER_RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.ORDER_RATE_LIMIT_WINDOW_MS, 60 * 1000);
export const ORDER_RATE_LIMIT_MAX = parsePositiveInt(process.env.ORDER_RATE_LIMIT_MAX, 300);
