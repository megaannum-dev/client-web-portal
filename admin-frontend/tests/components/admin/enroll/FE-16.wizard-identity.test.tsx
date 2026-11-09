import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/AdminStoreContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/AdminStoreContext")>()),
  useAdminStore: () => ({ eff: vi.fn(() => "NONE"), totalPages: 16, grantedFor: vi.fn(() => 0) }),
}));

async function renderIdentity(mode: "new" | "edit", patchDraft = vi.fn()) {
  const { Wizard } = await import("@/components/admin/enroll/Wizard");
  const draft = {
    mode, orig: "uid", origRole: "RM", first: "Sofia", last: "Petrova", email: "s@megaannum.ai",
    phone: "", start: "27 Jul 2026", addr: "", dept: "", role: "RM", ovr: {}, ovrExpiry: "90 days", notify: false, password: "",
  };
  render(
    <Wizard draft={draft as never} step={0} setStep={vi.fn()} patchDraft={patchDraft} openGroups={[]}
      onToggleGroup={vi.fn()} onLeave={vi.fn()} onSubmit={vi.fn()} />,
  );
  return patchDraft;
}

describe("Wizard Identity step", () => {
  it("edit mode: work email is read-only", async () => {
    await renderIdentity("edit");
    expect(screen.getByDisplayValue("s@megaannum.ai")).toHaveAttribute("readonly");
  });

  it("new mode: work email is editable", async () => {
    await renderIdentity("new");
    expect(screen.getByDisplayValue("s@megaannum.ai")).not.toHaveAttribute("readonly");
  });

  it("typing a Department patches the draft", async () => {
    const patch = await renderIdentity("edit");
    fireEvent.change(screen.getByPlaceholderText("Operations"), { target: { value: "Ops" } });
    expect(patch).toHaveBeenCalledWith({ dept: "Ops" });
  });
});
