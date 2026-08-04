import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import type { PortalUser } from "@/types/portal";

type FakeFirebaseUser = { getIdToken: () => Promise<string> };
type AuthStateCallback = (user: FakeFirebaseUser | null) => void | Promise<void>;

const authStateCallbacks: AuthStateCallback[] = [];
const signOutMock = vi.fn().mockResolvedValue(undefined);
const createUserWithEmailAndPasswordMock = vi.fn();

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: vi.fn(),
  createUserWithEmailAndPassword: (...args: unknown[]) => createUserWithEmailAndPasswordMock(...args),
  onAuthStateChanged: vi.fn((_auth: unknown, cb: AuthStateCallback) => {
    authStateCallbacks.push(cb);
    return () => {};
  }),
  onIdTokenChanged: vi.fn(() => () => {}),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: vi.fn(() => ({})),
  isFirebaseConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/id-token", () => ({
  writeIdTokenCookie: vi.fn(),
}));

const postBackendLoginMock = vi.fn();
const postBackendLogoutMock = vi.fn();
const postBackendRegisterMock = vi.fn();

vi.mock("@/lib/auth-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-api")>("@/lib/auth-api");
  return {
    ...actual,
    postBackendLogin: (...args: unknown[]) => postBackendLoginMock(...args),
    postBackendLogout: (...args: unknown[]) => postBackendLogoutMock(...args),
    postBackendRegister: (...args: unknown[]) => postBackendRegisterMock(...args),
  };
});

// Imported after the mock so it resolves to the real (non-mocked) class.
const { BackendAuthError } = await import("@/lib/auth-api");

let ctx: ReturnType<typeof useAuth> | null = null;

function Consumer() {
  ctx = useAuth();
  return (
    <div>
      <span data-testid="sync-error">{ctx.backendSyncError ?? ""}</span>
      <span data-testid="portal-role">{ctx.portalUser?.role ?? ""}</span>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

const fakeUser: FakeFirebaseUser = { getIdToken: vi.fn().mockResolvedValue("tok-abc") };

describe("admin-frontend AuthProvider FE-5", () => {
  beforeEach(() => {
    authStateCallbacks.length = 0;
    ctx = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("signs Firebase out and sets a distinct message on a 403 from postBackendLogin", async () => {
    postBackendLoginMock.mockRejectedValue(new BackendAuthError("no account", 403));
    renderProvider();
    await waitFor(() => expect(authStateCallbacks.length).toBe(1));

    await act(async () => {
      await authStateCallbacks[0](fakeUser);
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(ctx?.backendSyncError).toBe(
      "No internal account found for this login, or your account is suspended."
    );
    expect(ctx?.portalUser).toBeNull();
  });

  it("does not sign out and sets a generic message for a non-403 error", async () => {
    postBackendLoginMock.mockRejectedValue(new Error("network blip"));
    renderProvider();
    await waitFor(() => expect(authStateCallbacks.length).toBe(1));

    await act(async () => {
      await authStateCallbacks[0](fakeUser);
    });

    expect(signOutMock).not.toHaveBeenCalled();
    expect(ctx?.backendSyncError).toBe("network blip");
  });

  it("existing isRegistering guard still suppresses the login-bind during an in-flight registration", async () => {
    let resolveRegister!: (u: PortalUser) => void;
    const registerPromise = new Promise<PortalUser>((resolve) => {
      resolveRegister = resolve;
    });
    postBackendRegisterMock.mockReturnValue(registerPromise);
    createUserWithEmailAndPasswordMock.mockResolvedValue({
      user: { getIdToken: vi.fn().mockResolvedValue("reg-tok") },
    });

    renderProvider();
    await waitFor(() => expect(authStateCallbacks.length).toBe(1));

    let signUpPromise!: Promise<void>;
    act(() => {
      signUpPromise = ctx!.signUpWithEmailPassword("a@b.com", "pw123456", "ADMIN");
    });

    // While registration is in flight, onAuthStateChanged fires (as it would in
    // the real Firebase SDK right after createUserWithEmailAndPassword resolves
    // internally) — the guard must suppress the competing login-bind.
    await act(async () => {
      await authStateCallbacks[0](fakeUser);
    });
    expect(postBackendLoginMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveRegister({ firebase_uid: "uid-9", email: "a@b.com", name: null, role: "ADMIN" });
      await signUpPromise;
    });

    expect(postBackendLoginMock).not.toHaveBeenCalled();
    expect(ctx?.portalUser?.role).toBe("ADMIN");
  });

  it("the onIdTokenChanged cookie-mirroring registration is unaffected by the login-bind outcome", async () => {
    const { onIdTokenChanged } = await import("firebase/auth");
    postBackendLoginMock.mockRejectedValue(new BackendAuthError("no account", 403));
    renderProvider();
    await waitFor(() => expect(authStateCallbacks.length).toBe(1));

    expect(onIdTokenChanged).toHaveBeenCalledTimes(1);
  });
});
