/** Emails are compared/stored case- and whitespace-insensitively. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
