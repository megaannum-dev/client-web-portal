/** Client-side password for a new staff enrollment — generated here (not the
 *  backend) so the admin can preview/regenerate it before "Create account",
 *  and submitted as-is: the backend uses this exact value instead of
 *  generating its own (StaffEnrollIn.password). The new user can still take
 *  the account over later via the emailed set-password link. */
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";

export function generatePassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join("");
}
