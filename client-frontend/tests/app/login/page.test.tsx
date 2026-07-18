import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseAuth = vi.fn();
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

import LoginPage from "@/app/login/page";

function baseAuth(overrides: Record<string, unknown> = {}) {
  return {
    user: null,
    portalUser: null,
    loading: false,
    backendSyncing: false,
    backendSyncError: null,
    firebaseReady: true,
    signInWithEmailPassword: vi.fn(),
    signInWithGoogle: vi.fn(),
    ...overrides,
  };
}

async function submitLoginForm() {
  fireEvent.change(screen.getByLabelText("auth.login.email_label"), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByLabelText("auth.login.password_label"), {
    target: { value: "password123" },
  });
  fireEvent.submit(screen.getByLabelText("auth.login.email_label").closest("form")!);
}

describe("login page FE-3", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("renders AuthProvider's backendSyncError verbatim in the error banner", () => {
    mockUseAuth.mockReturnValue(
      baseAuth({
        user: { uid: "u1" },
        backendSyncError: "No account found for this login, or your account is disabled. Contact your RM.",
      })
    );
    render(<LoginPage />);
    expect(
      screen.getByText("No account found for this login, or your account is disabled. Contact your RM.")
    ).toBeInTheDocument();
  });

  it("still maps a Firebase SDK error code via firebase-auth-errors, unaffected by backendSyncError", async () => {
    const signInWithEmailPassword = vi.fn().mockRejectedValue({ code: "auth/wrong-password" });
    mockUseAuth.mockReturnValue(baseAuth({ signInWithEmailPassword }));
    render(<LoginPage />);

    await submitLoginForm();

    await waitFor(() => expect(screen.getByText("Wrong email or password.")).toBeInTheDocument());
    expect(screen.queryByText("auth/wrong-password")).not.toBeInTheDocument();
  });

  it("never renders both the Firebase form error and the backend error at once", async () => {
    const signInWithEmailPassword = vi.fn().mockRejectedValue({ code: "auth/wrong-password" });
    mockUseAuth.mockReturnValue(
      baseAuth({
        user: { uid: "u1" },
        backendSyncError: "No account found for this login, or your account is disabled. Contact your RM.",
        signInWithEmailPassword,
      })
    );
    render(<LoginPage />);

    await submitLoginForm();

    await waitFor(() => expect(screen.getByText("Wrong email or password.")).toBeInTheDocument());
    expect(
      screen.queryByText("No account found for this login, or your account is disabled. Contact your RM.")
    ).not.toBeInTheDocument();
  });
});
