import { describe, expect, it } from "vitest";
import { formatFirebaseAuthError, getFirebaseAuthErrorCode } from "@/lib/firebase-auth-errors";

describe("getFirebaseAuthErrorCode", () => {
  it("extracts the code from a Firebase-shaped error", () => {
    expect(getFirebaseAuthErrorCode({ code: "auth/invalid-email" })).toBe("auth/invalid-email");
  });

  it("returns null for non-Firebase errors", () => {
    expect(getFirebaseAuthErrorCode(new Error("boom"))).toBeNull();
  });
});

describe("formatFirebaseAuthError", () => {
  it("maps a known code to actionable copy", () => {
    expect(formatFirebaseAuthError({ code: "auth/weak-password" })).toMatch(/too weak/i);
  });

  it("falls back to the error message for unknown Error instances", () => {
    expect(formatFirebaseAuthError(new Error("boom"))).toBe("boom");
  });
});
