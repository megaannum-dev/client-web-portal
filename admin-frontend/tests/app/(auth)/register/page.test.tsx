// Tests for FE-6 (docs/implementations/004-auth-flow-rework-fe.md §8.3 FE-6).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn();

vi.mock("next/navigation", async (importOriginal) => ({
    ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(),
}));

const useAuthMock = vi.fn();
vi.mock("@/components/auth/AuthProvider", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/auth/AuthProvider")>()),
  useAuth: () => useAuthMock(),
}));

import RegisterPage from "@/app/(auth)/register/page";

function baseAuth(overrides: Partial<ReturnType<typeof useAuthMock>> = {}) {
  return {
    user: null,
    portalUser: null,
    loading: false,
    backendSyncing: false,
    backendSyncError: null,
    firebaseReady: true,
    signUpWithEmailPassword: vi.fn(),
    ...overrides,
  };
}

describe("admin-frontend register page FE-6", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    replaceMock.mockReset();
  });

  it("renders AuthProvider's backend auth-error string verbatim (e.g. dev-register-unavailable)", () => {
    useAuthMock.mockReturnValue(
      baseAuth({ user: { uid: "u1" }, backendSyncError: "Self-registration is not available in this environment." })
    );
    render(<RegisterPage />);
    expect(
      screen.getByText("Self-registration is not available in this environment.")
    ).toBeInTheDocument();
  });

  it("still maps a Firebase SDK error code through the existing table, unaffected by this unit", async () => {
    const signUpWithEmailPassword = vi.fn().mockRejectedValue({ code: "auth/email-already-in-use" });
    useAuthMock.mockReturnValue(baseAuth({ signUpWithEmailPassword }));
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/This email is already registered in Firebase/)
      ).toBeInTheDocument()
    );
    // Firebase-mapped copy, not the raw error code.
    expect(screen.queryByText("auth/email-already-in-use")).not.toBeInTheDocument();
  });

  it("never renders both the backend error and a form error banner at once", () => {
    useAuthMock.mockReturnValue(
      baseAuth({ user: { uid: "u1" }, backendSyncError: "backend says no" })
    );
    render(<RegisterPage />);
    // Only one error paragraph is rendered (formError ?? backendSyncError).
    expect(screen.getAllByText("backend says no")).toHaveLength(1);
  });
});
