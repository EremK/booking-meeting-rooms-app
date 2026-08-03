/** Emails are compared/stored case- and whitespace-insensitively (AUTH-4). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
