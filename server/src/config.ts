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
  if (!value || value === 'secret' || value.length < 16) {
    throw new Error('JWT_SECRET must be set to a strong random value (16+ chars) before starting the server');
  }
  return value;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
export const DATABASE_SSL = DATABASE_URL.includes('railway') || DATABASE_URL.includes('render')
  ? { rejectUnauthorized: false }
  : false;
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
