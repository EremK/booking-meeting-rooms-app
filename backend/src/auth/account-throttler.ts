import { normalizeEmail } from '../common/normalize-email';

export function getAccountTracker(req: Record<string, unknown>): string {
  const body = req.body as Record<string, unknown> | undefined;
  const email = body?.email;
  if (typeof email === 'string' && email.trim().length > 0) {
    return `email:${normalizeEmail(email)}`;
  }
  return `ip:${String(req.ip)}`;
}
