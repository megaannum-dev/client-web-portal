// Tests for FE-6 (docs/implementations/004-auth-flow-rework-fe.md §8.3 FE-6).
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn();

vi.mock("next/navigation", async (importOriginal) => ({
    ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({ get: () => null }),
}));

const useAuthMock = vi.fn();
vi.mock("@/components/auth/AuthProvider", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/auth/AuthProvider")>()),
  useAuth: () => useAuthMock(),
}));

import LoginPage from "@/app/(auth)/login/page";

function baseAuth(overrides: Partial<ReturnType<typeof useAuthMock>> = {}) {
  return {
    user: null,
    portalUser: null,
    loading: false,
    backendSyncing: false,
    backendSyncError: null,
    firebaseReady: true,
    signInWithGoogle: vi.fn(),
    signInWithEmailPassword: vi.fn(),
    ...overrides,
  };
}

describe("admin-frontend login page FE-6", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    replaceMock.mockReset();
  });

  it("renders AuthProvider's backend auth-error string verbatim", () => {
    useAuthMock.mockReturnValue(
      baseAuth({ user: { uid: "u1" }, backendSyncError: "No internal account found for this login, or your account is suspended." })
    );
    render(<LoginPage />);
    expect(
      screen.getByText("No internal account found for this login, or your account is suspended.")
    ).toBeInTheDocument();
  });

  it("renders the backend error banner after Firebase has been signed out", () => {
    useAuthMock.mockReturnValue(
      baseAuth({
        user: null,
        backendSyncError: "No internal account found for this login, or your account is disabled. Contact your RM.",
      })
    );
    render(<LoginPage />);
    expect(
      screen.getByText("No internal account found for this login, or your account is disabled. Contact your RM.")
    ).toBeInTheDocument();
  });
});
