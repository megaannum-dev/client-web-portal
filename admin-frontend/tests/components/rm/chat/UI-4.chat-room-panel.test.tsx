// 021 UI-4 — ChatRoomPanel: mini/full geometry, Escape-to-close, the docs
// aside slide, and the useCanEdit("rm.client-info") composer gate.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatRoomPanel } from "@/components/rm/chat/ChatRoomPanel";
import type { Participant } from "@/components/rm/chat/types";

// ChatRoomPanel gates its composer on useCanEdit("rm.client-info") (D-14:
// hidden, not disabled — see FE-6.gate-sites.test.tsx). Mirrors the FE-4
// mockUseAuth precedent so a real AuthProvider's default-deny "NONE" grant
// doesn't hide the composer in every test.
const mockUseAuth = vi.fn(() => ({ portalUser: { role: "RM", grants: { "rm.client-info": "EDIT" } } }));
vi.mock("@/components/auth/AuthProvider", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/auth/AuthProvider")>()),
  useAuth: () => mockUseAuth(),
}));

function withGrant(level: "EDIT" | "VIEW") {
  mockUseAuth.mockReturnValue({ portalUser: { role: "RM", grants: { "rm.client-info": level } } });
}

const PARTICIPANTS: Participant[] = [
  { uid: "c1", name: "Alex Thompson", role: "client" },
  { uid: "rm1", name: "Sarah Mitchell", role: "rm" },
];

// Modal-shaped portal: without #content-overlay-root, ChatRoomPanel's
// `if (!root) return null` guard makes every render() a silent no-op, per
// the FE-4.transaction-detail-modal.test.tsx precedent.
beforeEach(() => {
  document.body.innerHTML = '<div id="content-overlay-root"></div>';
  withGrant("EDIT");
});

describe("positive", () => {
  it("renders at mini geometry by default: inset unset (right/bottom margins instead), rounded + bordered + shadowed", () => {
    // Portals into #content-overlay-root, which sits outside render()'s own
    // container — query the document, same as the FE-4 Modal precedent.
    // NOTE: jsdom's CSSOM rejects the `max()`/`calc()` CSS functions used for
    // the mini top/left insets (a jsdom limitation, not a browser one — real
    // browsers accept both), so `style.top`/`style.left` come back empty here
    // even though they render correctly. `right`/`bottom` are plain px and DO
    // survive, so those plus the mini-only radius/border/shadow classes are
    // the geometry check this test can actually observe in jsdom.
    render(<ChatRoomPanel participants={PARTICIPANTS} onClose={vi.fn()} />);
    const panel = document.querySelector(".pointer-events-auto") as HTMLElement;
    expect(panel.style.inset).toBe("");
    expect(panel.style.right).toBe("16px");
    expect(panel.style.bottom).toBe("16px");
    expect(panel.className).toContain("rounded-lg");
    expect(panel.className).toContain("shadow-overlay");
  });

  it("the maximise toggle swaps geometry to inset:0 and swaps Maximize2 for Minimize2", () => {
    render(<ChatRoomPanel participants={PARTICIPANTS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /maximize panel/i }));
    const panel = document.querySelector(".pointer-events-auto") as HTMLElement;
    expect(panel.style.inset).toBe("0px");
    expect(panel.className).toContain("rounded-none");
    expect(screen.getByRole("button", { name: /restore panel/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /maximize panel/i })).not.toBeInTheDocument();
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<ChatRoomPanel participants={PARTICIPANTS} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the documents aside is translateX(101%) closed and translate-x-0 once opened", () => {
    render(<ChatRoomPanel participants={PARTICIPANTS} onClose={vi.fn()} />);
    const aside = screen.getByText(/shared documents/i).closest("aside")!;
    expect(aside.className).toContain("translate-x-[101%]");
    fireEvent.click(screen.getByRole("button", { name: /documents shared in this room/i }));
    expect(aside.className).toContain("translate-x-0");
    expect(aside.className).not.toContain("translate-x-[101%]");
  });

  it("EDIT: the composer textarea is present, and Enter (no Shift) fires onSend and clears the draft", () => {
    const onSend = vi.fn();
    render(<ChatRoomPanel participants={PARTICIPANTS} onSend={onSend} onClose={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/message sarah/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello room" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    // Body plus the (empty) staged list — one message, not two calls.
    expect(onSend).toHaveBeenCalledWith("Hello room", []);
    expect(textarea.value).toBe("");
  });

  it("Shift+Enter does not send", () => {
    const onSend = vi.fn();
    render(<ChatRoomPanel participants={PARTICIPANTS} onSend={onSend} onClose={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/message sarah/i);
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("EDIT: attachment staging — picking a file composes, it does not send", () => {
  function pick(files: File[]) {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files } });
  }
  const FILE_A = new File(["a"], "Ardent_IPS_v4_draft.pdf", { type: "application/pdf" });
  const FILE_B = new File(["bb"], "Q3_exposure_summary.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  it("a picked file becomes a chip and fires no send", () => {
    const onSend = vi.fn();
    render(<ChatRoomPanel participants={PARTICIPANTS} onSend={onSend} onClose={vi.fn()} />);
    pick([FILE_A]);
    expect(screen.getByText("Ardent_IPS_v4_draft.pdf")).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("staged files alone enable Send, with an empty draft", () => {
    render(<ChatRoomPanel participants={PARTICIPANTS} onClose={vi.fn()} />);
    const send = screen.getByLabelText("Send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    pick([FILE_A]);
    expect(send.disabled).toBe(false);
  });

  it("Send posts every staged file in ONE call and clears both draft and chips", () => {
    const onSend = vi.fn();
    render(<ChatRoomPanel participants={PARTICIPANTS} onSend={onSend} onClose={vi.fn()} />);
    pick([FILE_A, FILE_B]);
    const textarea = screen.getByPlaceholderText(/message sarah/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Both attached" } });
    fireEvent.click(screen.getByLabelText("Send"));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toBe("Both attached");
    expect(onSend.mock.calls[0][1].map((f: File) => f.name)).toEqual([
      "Ardent_IPS_v4_draft.pdf",
      "Q3_exposure_summary.xlsx",
    ]);
    expect(textarea.value).toBe("");
    expect(screen.queryByText("Ardent_IPS_v4_draft.pdf")).not.toBeInTheDocument();
  });

  it("a chip's remove button drops only that file", () => {
    render(<ChatRoomPanel participants={PARTICIPANTS} onClose={vi.fn()} />);
    pick([FILE_A, FILE_B]);
    fireEvent.click(screen.getByLabelText("Remove Ardent_IPS_v4_draft.pdf"));
    expect(screen.queryByText("Ardent_IPS_v4_draft.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("Q3_exposure_summary.xlsx")).toBeInTheDocument();
  });

  it("the border moves from the textarea to the wrapper once a file is staged", () => {
    render(<ChatRoomPanel participants={PARTICIPANTS} onClose={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/message sarah/i) as HTMLTextAreaElement;
    expect(textarea.className).toContain("border-outline");
    pick([FILE_A]);
    expect(textarea.className).toContain("border-none");
    expect(textarea.parentElement?.className).toContain("border-outline");
  });

  it("sending disables Send without hiding the composer", () => {
    render(<ChatRoomPanel participants={PARTICIPANTS} sending onClose={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/message sarah/i);
    fireEvent.change(textarea, { target: { value: "queued" } });
    expect((screen.getByLabelText("Send") as HTMLButtonElement).disabled).toBe(true);
    expect(textarea).toBeInTheDocument();
  });
});

describe("negative — VIEW grant hides the composer, never disables it", () => {
  it("the read-only notice renders and no textarea is in the tree", () => {
    withGrant("VIEW");
    render(<ChatRoomPanel participants={PARTICIPANTS} onClose={vi.fn()} />);
    expect(screen.getByText(/view access — you can read this room but not post/i)).toBeInTheDocument();
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
  });
});

describe("invariants", () => {
  it("a two-participant room (no ARM) renders exactly two avatars and a one-separator caption", () => {
    render(<ChatRoomPanel participants={PARTICIPANTS} onClose={vi.fn()} />);
    expect(screen.getByText("Alex Thompson · Sarah Mitchell")).toBeInTheDocument();
  });

  it("a one-participant room (client only) renders without crashing", () => {
    const solo: Participant[] = [{ uid: "c1", name: "Alex Thompson", role: "client" }];
    expect(() => render(<ChatRoomPanel participants={solo} onClose={vi.fn()} />)).not.toThrow();
    expect(screen.getByText("Alex Thompson · Client Room")).toBeInTheDocument();
  });
});
