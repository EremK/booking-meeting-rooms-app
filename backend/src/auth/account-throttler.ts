import { normalizeEmail } from '../common/normalize-email';

/**
 * Tracks auth attempts by account rather than IP wherever possible: this is an
 * office app where many legitimate users share one NAT IP, so an IP-keyed limit
 * would lock out a whole office over unrelated attempts. Falls back through:
 * authenticated user (set by JwtAuthGuard, which must run first) -> the email in
 * the request body -> the IP, so requests with neither still count against
 * something rather than going untracked.
 */
export function getAccountTracker(req: Record<string, unknown>): string {
  const userId = req.userId;
  if (typeof userId === 'string' && userId.length > 0) {
    return `user:${userId}`;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const email = body?.email;
  if (typeof email === 'string' && email.trim().length > 0) {
    return `email:${normalizeEmail(email)}`;
  }

  return `ip:${String(req.ip)}`;
}
