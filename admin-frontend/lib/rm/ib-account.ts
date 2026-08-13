// Shared IBKR account-id validation for the onboarding and subscription
// forms. Format: the letter U followed by 7 letters or digits (e.g.
// U1234567) — mirrors app/libs/client_ib_accounts.py's `check()` on the
// backend, which is the real gate; this is just the client-side echo so the
// RM sees the problem before submitting.
export const IB_ACCOUNT_RE = /^U[A-Z0-9]{7}$/;
export const IB_ACCOUNT_HINT = "Format: U followed by 7 letters or digits, e.g. U1234567";

export const normalizeIbAccount = (s: string) => s.trim().toUpperCase();
export const isValidIbAccount = (s: string) => IB_ACCOUNT_RE.test(normalizeIbAccount(s));
