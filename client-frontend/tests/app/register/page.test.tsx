import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseAuth = vi.fn();
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

import RegisterPage from "@/app/register/page";

function baseAuth(overrides: Record<string, unknown> = {}) {
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

async function submitRegisterForm() {
  fireEvent.change(screen.getByLabelText("auth.register.email_label"), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByLabelText("auth.register.password_label"), {
    target: { value: "password123" },
  });
  fireEvent.submit(screen.getByLabelText("auth.register.email_label").closest("form")!);
}

describe("register page FE-3", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("renders AuthProvider's backendSyncError verbatim (dev-register-unavailable case) in the error banner", () => {
    mockUseAuth.mockReturnValue(
      baseAuth({
        user: { uid: "u1" },
        backendSyncError: "Self-registration is not available. Contact your RM to be onboarded.",
      })
    );
    render(<RegisterPage />);
    expect(
      screen.getByText("Self-registration is not available. Contact your RM to be onboarded.")
    ).toBeInTheDocument();
  });

  it("still maps a Firebase SDK signup error via firebase-auth-errors, unaffected by backendSyncError", async () => {
    const signUpWithEmailPassword = vi.fn().mockRejectedValue({ code: "auth/email-already-in-use" });
    mockUseAuth.mockReturnValue(baseAuth({ signUpWithEmailPassword }));
    render(<RegisterPage />);

    await submitRegisterForm();

    await waitFor(() =>
      expect(
        screen.getByText(
          "This email is already registered in Firebase. Use Sign in with this email, or choose a different email."
        )
      ).toBeInTheDocument()
    );
    expect(screen.queryByText("auth/email-already-in-use")).not.toBeInTheDocument();
  });

  it("never renders both the Firebase form error and the backend error at once", async () => {
    const signUpWithEmailPassword = vi.fn().mockRejectedValue({ code: "auth/email-already-in-use" });
    mockUseAuth.mockReturnValue(
      baseAuth({
        user: { uid: "u1" },
        backendSyncError: "Self-registration is not available. Contact your RM to be onboarded.",
        signUpWithEmailPassword,
      })
    );
    render(<RegisterPage />);

    await submitRegisterForm();

    await waitFor(() =>
      expect(
        screen.getByText(
          "This email is already registered in Firebase. Use Sign in with this email, or choose a different email."
        )
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText("Self-registration is not available. Contact your RM to be onboarded.")
    ).not.toBeInTheDocument();
  });
});
