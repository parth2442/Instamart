import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const ADMIN_PASSWORD = process.env.WEB_PANEL_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('FATAL: WEB_PANEL_PASSWORD environment variable is required');
  process.exit(1);
}

const adminTokens = new Set<string>();
const API_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= API_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!adminTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export function loginHandler(req: Request, res: Response) {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex');
    adminTokens.add(token);
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid password' });
}
