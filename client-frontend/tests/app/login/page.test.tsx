import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const replaceMock = vi.fn();
let nextParam: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({ get: () => nextParam }),
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
    replaceMock.mockReset();
    nextParam = null;
  });

  it("renders AuthProvider's backendSyncError verbatim in the error banner", () => {
    mockUseAuth.mockReturnValue(
      baseAuth({
        user: { uid: "u1" },
        backendSyncError: "Wrong credentials or disabled account, contact your RM",
      })
    );
    render(<LoginPage />);
    expect(
      screen.getByText("Wrong credentials or disabled account, contact your RM")
    ).toBeInTheDocument();
  });

  it("renders AuthProvider's backendSyncError after Firebase has been signed out", () => {
    mockUseAuth.mockReturnValue(
      baseAuth({
        user: null,
        backendSyncError: "Wrong credentials or disabled account, contact your RM",
      })
    );
    render(<LoginPage />);
    expect(
      screen.getByText("Wrong credentials or disabled account, contact your RM")
    ).toBeInTheDocument();
  });

  it("still maps a Firebase SDK error code via firebase-auth-errors, unaffected by backendSyncError", async () => {
    const signInWithEmailPassword = vi.fn().mockRejectedValue({ code: "auth/wrong-password" });
    mockUseAuth.mockReturnValue(baseAuth({ signInWithEmailPassword }));
    render(<LoginPage />);

    await submitLoginForm();

    await waitFor(() => expect(screen.getByText("Wrong credentials or disabled account, contact your RM")).toBeInTheDocument());
    expect(screen.queryByText("auth/wrong-password")).not.toBeInTheDocument();
  });

  it("never renders both the Firebase form error and the backend error at once", async () => {
    const signInWithEmailPassword = vi.fn().mockRejectedValue({ code: "auth/wrong-password" });
    mockUseAuth.mockReturnValue(
      baseAuth({
        user: { uid: "u1" },
        backendSyncError: "Could not sync with API",
        signInWithEmailPassword,
      })
    );
    render(<LoginPage />);

    await submitLoginForm();

    await waitFor(() => expect(screen.getByText("Wrong credentials or disabled account, contact your RM")).toBeInTheDocument());
    expect(
      screen.queryByText("Could not sync with API")
    ).not.toBeInTheDocument();
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "/\t/evil.com"])(
    "ignores the external ?next=%j and redirects to the default",
    (bad) => {
      nextParam = bad;
      mockUseAuth.mockReturnValue(baseAuth({ user: { uid: "u1" }, portalUser: { id: "p1" } }));
      render(<LoginPage />);
      expect(replaceMock).toHaveBeenCalledWith("/overview");
    }
  );

  it("keeps an internal ?next= path", () => {
    nextParam = "/some/path";
    mockUseAuth.mockReturnValue(baseAuth({ user: { uid: "u1" }, portalUser: { id: "p1" } }));
    render(<LoginPage />);
    expect(replaceMock).toHaveBeenCalledWith("/some/path");
  });
});
