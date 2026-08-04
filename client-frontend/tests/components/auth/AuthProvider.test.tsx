import { act, render, screen, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { BackendAuthError } from "@/lib/auth-api";

type AuthStateCallback = (user: User | null) => void | Promise<void>;

let authStateCallback: AuthStateCallback | null = null;
const mockSignOut = vi.fn().mockResolvedValue(undefined);
const mockCreateUserWithEmailAndPassword = vi.fn();

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: vi.fn(),
  createUserWithEmailAndPassword: (...args: unknown[]) => mockCreateUserWithEmailAndPassword(...args),
  onAuthStateChanged: vi.fn((_auth: unknown, cb: AuthStateCallback) => {
    authStateCallback = cb;
    return () => {};
  }),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: vi.fn(() => ({})),
  isFirebaseConfigured: vi.fn(() => true),
}));

const mockPostBackendLogin = vi.fn();

vi.mock("@/lib/auth-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-api")>();
  return {
    ...actual,
    postBackendLogin: (...args: unknown[]) => mockPostBackendLogin(...args),
    postBackendLogout: vi.fn(),
  };
});

function fakeFirebaseUser(uid: string): User {
  return { uid, getIdToken: vi.fn().mockResolvedValue(`token-${uid}`) } as unknown as User;
}

function TestConsumer() {
  const { backendSyncError, portalUser } = useAuth();
  return (
    <div>
      <span data-testid="error">{backendSyncError ?? ""}</span>
      <span data-testid="portal-user">{portalUser?.firebase_uid ?? ""}</span>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

describe("AuthProvider FE-2", () => {
  beforeEach(() => {
    authStateCallback = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("signs Firebase out and sets a distinct message on a 403 from postBackendLogin", async () => {
    renderProvider();
    await waitFor(() => expect(authStateCallback).not.toBeNull());

    mockPostBackendLogin.mockRejectedValue(new BackendAuthError("no account", 403));

    await act(async () => {
      await authStateCallback?.(fakeFirebaseUser("existing-uid"));
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("error").textContent).toBe(
      "No account found for this login, or your account is disabled. Contact your RM."
    );
  });
});
