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
const mockPostBackendRegister = vi.fn();

vi.mock("@/lib/auth-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-api")>();
  return {
    ...actual,
    postBackendLogin: (...args: unknown[]) => mockPostBackendLogin(...args),
    postBackendRegister: (...args: unknown[]) => mockPostBackendRegister(...args),
    postBackendLogout: vi.fn(),
  };
});

function fakeFirebaseUser(uid: string): User {
  return { uid, getIdToken: vi.fn().mockResolvedValue(`token-${uid}`) } as unknown as User;
}

function TestConsumer() {
  const { backendSyncError, portalUser, signUpWithEmailPassword } = useAuth();
  return (
    <div>
      <span data-testid="error">{backendSyncError ?? ""}</span>
      <span data-testid="portal-user">{portalUser?.firebase_uid ?? ""}</span>
      <button
        onClick={() => {
          signUpWithEmailPassword("new@example.com", "password123").catch(() => {
            /* surfaced via backendSyncError in the assertions below */
          });
        }}
      >
        signup
      </button>
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

  it("suppresses onAuthStateChanged's login-bind while signUpWithEmailPassword is in flight", async () => {
    renderProvider();
    await waitFor(() => expect(authStateCallback).not.toBeNull());

    const newUser = fakeFirebaseUser("new-uid");
    // Mirrors real Firebase: creating the credential fires onAuthStateChanged
    // before postBackendRegister has resolved.
    mockCreateUserWithEmailAndPassword.mockImplementation(async () => {
      await authStateCallback?.(newUser);
      return { user: newUser };
    });
    mockPostBackendRegister.mockResolvedValue({
      firebase_uid: "new-uid",
      email: "new@example.com",
      role: "client",
    });

    await act(async () => {
      screen.getByText("signup").click();
    });

    expect(mockPostBackendLogin).not.toHaveBeenCalled();
    expect(mockPostBackendRegister).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("portal-user").textContent).toBe("new-uid"));
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

  it("always clears the registering guard, even when postBackendRegister throws (404 case)", async () => {
    renderProvider();
    await waitFor(() => expect(authStateCallback).not.toBeNull());

    const newUser = fakeFirebaseUser("dev-off-uid");
    mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: newUser });
    mockPostBackendRegister.mockRejectedValue(new BackendAuthError("not mounted", 404));

    await act(async () => {
      screen.getByText("signup").click();
    });

    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toBe(
        "Self-registration is not available. Contact your RM to be onboarded."
      )
    );
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    // Guard must be clear now — a subsequent login-bind should run normally.
    mockPostBackendLogin.mockResolvedValue({
      firebase_uid: "existing-uid-2",
      email: "e@x.com",
      role: "client",
    });
    await act(async () => {
      await authStateCallback?.(fakeFirebaseUser("existing-uid-2"));
    });

    expect(mockPostBackendLogin).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("portal-user").textContent).toBe("existing-uid-2"));
  });
});
