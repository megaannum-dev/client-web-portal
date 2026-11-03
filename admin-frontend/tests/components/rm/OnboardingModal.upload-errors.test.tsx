import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/auth/AuthProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/auth/AuthProvider")>()),
  useAuth: () => ({ portalUser: { grants: { "rm.onboarding-renewal": "EDIT" } } }),
}));
vi.mock("@/hooks/api/useModels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/api/useModels")>()),
  useModels: () => ({
    data: [{ id: "m-1", name: "Balanced", status: "live", mgmt: 1, incentive: 10 }],
    loading: false, error: null, refetch: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { toast } from "sonner";
import { OnboardingModal } from "@/components/rm/OnboardingModal";
import type { UseOnboardingBoardResult } from "@/hooks/api/useOnboardingBoard";
import { KYC_ACCEPT } from "@/lib/onboarding/types";

const SPECS = [{ doc_type: "passport", label: "Passport" }];

async function renderAtDocumentsStep(uploadDocument: UseOnboardingBoardResult["uploadDocument"]) {
  const onClose = vi.fn();
  render(
    <OnboardingModal
      onClose={onClose}
      startOnboarding={vi.fn().mockResolvedValue({ success: true, id: "ob-new" })}
      uploadDocument={uploadDocument}
      fetchRmOptions={vi.fn().mockResolvedValue({ success: true, data: [] })}
      fetchDocSpecs={vi.fn().mockResolvedValue({ success: true, data: SPECS })}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText("e.g. Greystone Partners"), { target: { value: "Acme" } });
  fireEvent.change(screen.getByPlaceholderText("+1 (312) 555-0199"), { target: { value: "+1 555" } });
  fireEvent.change(screen.getByPlaceholderText("name@company.com"), { target: { value: "a@b.com" } });
  fireEvent.change(screen.getByPlaceholderText("Registered address"), { target: { value: "1 Main St" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. A1234567"), { target: { value: "A1" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. Hong Kong SAR"), { target: { value: "HK" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByPlaceholderText("e.g. U1234567"), { target: { value: "U1234567" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. SW-4420"), { target: { value: "SW-1" } });
  fireEvent.change(screen.getByDisplayValue("Select a model…"), { target: { value: "m-1" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. 2"), { target: { value: "2" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. 250000"), { target: { value: "100000" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Passport");
  return onClose;
}

function stageAndSubmit() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File(["x"], "scan.exe")] } });
  fireEvent.click(screen.getByRole("button", { name: /onboard client/i }));
}

describe("OnboardingModal document upload failures", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="content-overlay-root"></div>';
    vi.mocked(toast.error).mockClear();
  });

  it("limits the file picker to the KYC types", async () => {
    await renderAtDocumentsStep(vi.fn().mockResolvedValue({ success: true }));
    expect(document.querySelector('input[type="file"]')?.getAttribute("accept")).toBe(KYC_ACCEPT);
  });

  it("shows the backend's reason next to the document, then closes", async () => {
    const reason = "Unsupported file type '.exe' -- expected one of .jpeg/.jpg/.pdf/.png";
    const onClose = await renderAtDocumentsStep(vi.fn().mockResolvedValue({ success: false, error: reason }));
    stageAndSubmit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Client created"),
      expect.objectContaining({ description: expect.stringContaining(`Passport: ${reason}`) }),
    );
  });

  it("treats a thrown upload as that document failing, not as a failed onboarding", async () => {
    const onClose = await renderAtDocumentsStep(vi.fn().mockRejectedValue(new Error("Body exceeded 51mb limit")));
    stageAndSubmit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Client created"),
      expect.objectContaining({ description: expect.stringContaining("Passport: Body exceeded 51mb limit") }),
    );
    expect(screen.queryByText("Body exceeded 51mb limit")).not.toBeInTheDocument();
  });
});
