/**
 * Mirrors the Firebase ID token into a non-httpOnly SameSite=Strict cookie
 * so the server-only `apiClient` can attach it as a Bearer token.
 */
export function writeIdTokenCookie(token: string): void {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `id_token=${token}; path=/; SameSite=Strict`;
  } else {
    // Clear on sign-out.
    document.cookie =
      "id_token=; path=/; SameSite=Strict; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }
}
