/** Map Firebase Auth error codes to short, actionable copy (Firestore is not used for login). */

export function getFirebaseAuthErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

export function formatFirebaseAuthError(error: unknown): string {
  const code = getFirebaseAuthErrorCode(error);
  switch (code) {
    case "auth/email-already-in-use":
      return "This email is already registered in Firebase. Use Sign in with this email, or choose a different email.";
    case "auth/invalid-email":
      return "That email address is not valid.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Wrong email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a bit and try again.";
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed before finishing.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    default:
      if (error instanceof Error) return error.message;
      return "Something went wrong. Please try again.";
  }
}
