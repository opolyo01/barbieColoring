import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  ORDER_RATE_LIMIT_MAX,
  ORDER_RATE_LIMIT_WINDOW_MS,
} from './config';

function jsonRateLimit(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ error: message });
  };
}

export const authRateLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimit('Too many auth requests. Please try again later.'),
});

export const orderWriteRateLimiter = rateLimit({
  windowMs: ORDER_RATE_LIMIT_WINDOW_MS,
  max: ORDER_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimit('Too many order requests. Please slow down and try again.'),
});
