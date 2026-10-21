// 021 UI-2 — the Advisory Room popup: once the client has been handed to
// their RM (help-assistant session "connected"), room header + empty state +
// composer render; there is no /messaging page and the sidebar does not list it — the
// room opens only from the FAB, which stays put while it is open so the other
// quick actions remain reachable; the participant stack is driven off the array (2 or 3 entries,
// never a fixed 3 — plan §5); both translation.json files carry the same
// `messaging`/`nav.messaging` keys.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key), i18n: { language: "en" } }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/overview", useRouter: () => ({ push: vi.fn() }) }));

// The page derives its participant stack from the same two hooks the header
// already uses on every page (plan §5): the signed-in client plus their
// assigned RM. Mocked to the two-party case — ClientProfileDTO has no
// assistant-RM field, so two is the most the client portal can name today.
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { displayName: "Alex Thompson" }, getIdToken: async () => "t" }),
}));
vi.mock("@/lib/hooks/useProfile", () => ({
  useProfile: () => ({
    data: { name: "Alex Thompson", assigned_rm: { name: "Sarah Mitchell", email: null, phone: null } },
    loading: false,
    error: null,
    save: async () => ({ ok: true as const }),
  }),
}));

import { ChatPopup } from "@/components/messaging/ChatPopup";
import { AdvisoryRoom } from "@/components/messaging/AdvisoryRoom";
import { SidebarNav } from "@/components/sidebar/SidebarNav";

// The mocked user has no uid, so the session lives under the anonymous key.
function seedConnected() {
  localStorage.setItem("help-assistant:anonymous", JSON.stringify({ log: [], stage: "connected", topic: null }));
}

beforeEach(() => localStorage.clear());

describe("UI-2 ChatPopup", () => {
  it("renders the room header, the empty state and the composer", () => {
    seedConnected();
    render(<ChatPopup onClose={() => {}} />);
    expect(screen.getByText("messaging.title")).toBeInTheDocument();
    expect(screen.getByText("messaging.empty_state")).toBeInTheDocument();
    // With a staff participant present the named variant is used, carrying
    // the RM's name — not the no-participants fallback.
    expect(
      screen.getByPlaceholderText('messaging.composer_placeholder:{"names":"Sarah"}'),
    ).toBeInTheDocument();
  });

  it("renders the two-party stack: the client and their assigned RM, no fabricated ARM", () => {
    seedConnected();
    render(<ChatPopup onClose={() => {}} />);
    // initials only, since the caption is the one place names surface
    expect(screen.getByText("AT")).toBeInTheDocument();
    expect(screen.getByText("SM")).toBeInTheDocument();
    expect(screen.queryByText("DW")).not.toBeInTheDocument();
  });

  it('"Jump to latest" never appears — an empty thread cannot overflow', () => {
    seedConnected();
    render(<ChatPopup onClose={() => {}} />);
    expect(screen.queryByText("messaging.jump_to_latest")).not.toBeInTheDocument();
  });

  it("the close button calls onClose", () => {
    const onClose = vi.fn();
    render(<ChatPopup onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "messaging.close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("maximize fills the area beside the sidebar; restore brings the window back", () => {
    render(<ChatPopup sidebarWidth={256} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.top).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "messaging.maximize" }));
    expect(dialog.style.left).toBe("280px");
    expect(dialog.style.top).toBe("24px");

    fireEvent.click(screen.getByRole("button", { name: "messaging.restore" }));
    expect(dialog.style.top).toBe("");
    expect(dialog.style.left).toBe("");
  });

  it("dragging an edge while maximized drops back to a window that can only shrink", () => {
    render(<ChatPopup sidebarWidth={256} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "messaging.maximize" }));

    // Handles stay available while maximized.
    const handles = dialog.querySelectorAll(":scope > [aria-hidden]");
    expect(handles.length).toBe(3);

    // jsdom has no layout, so give the maximized box a measured size:
    // 1024x768 viewport - (256 sidebar + 24 + 32) = 712 wide, 768 - 148 = 620 tall.
    dialog.getBoundingClientRect = () => ({ width: 712, height: 620 }) as DOMRect;
    fireEvent.pointerDown(handles[1], { clientX: 400, clientY: 300 }); // left edge
    expect(screen.getByRole("button", { name: "messaging.maximize" })).toBeInTheDocument();

    // Dragging outward past the boundary is clamped to the maximized size.
    fireEvent.pointerMove(document, { clientX: 100, clientY: 300 });
    expect(dialog.style.width).toBe("712px");
    // Dragging inward shrinks it.
    fireEvent.pointerMove(document, { clientX: 500, clientY: 300 });
    expect(dialog.style.width).toBe("612px");
    fireEvent.pointerUp(document);
  });
});

describe("UI-2 SidebarNav no longer lists /messaging", () => {
  it("nav order is overview, portfolios, profile, ... with no /messaging link", () => {
    render(<SidebarNav isOpen />);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links.slice(0, 3)).toEqual(["/overview", "/portfolio", "/profile"]);
    expect(links).not.toContain("/messaging");
  });
});

describe("UI-2 FloatingActionButton opens the chat popup", () => {
  it("the messaging action opens the popup alongside the FAB, and close removes it", async () => {
    vi.resetModules();
    vi.doMock("@/lib/hooks/useDocuments", () => ({ useDocuments: () => ({ data: [], loading: false, error: null }) }));
    vi.doMock("@/lib/api/documents", () => ({ downloadDocument: vi.fn() }));
    vi.doMock("@/components/ui/RaiseTicketModal", () => ({ RaiseTicketModal: () => null }));
    vi.doMock("@/components/messaging/ChatPopup", () => ({
      ChatPopup: ({ onClose }: { onClose: () => void }) => (
        <div role="dialog">
          <button type="button" onClick={onClose}>close-chat</button>
        </div>
      ),
    }));

    const { FloatingActionButton } = await import("@/components/ui/FloatingActionButton");
    render(<FloatingActionButton />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "fab.quick_actions" }));
    fireEvent.click(screen.getByRole("button", { name: "fab.messaging" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The FAB stays, and its other actions still open while chatting.
    fireEvent.click(screen.getByRole("button", { name: "fab.quick_actions" }));
    expect(screen.getByRole("button", { name: "fab.raise_ticket" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "fab.close_quick_actions" }));

    fireEvent.click(screen.getByText("close-chat"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "fab.quick_actions" })).toBeInTheDocument();
  });
});

describe("UI-2 AdvisoryRoom participant stack is dynamic (2 or 3, never positional)", () => {
  it("a two-participant room (client + RM, no ARM) shows exactly two avatars, a one-separator caption, and a single-name placeholder", () => {
    const { container } = render(
      <AdvisoryRoom
        messages={[]}
        participants={[
          { uid: "c1", name: "Alex Thompson", role: "client" },
          { uid: "rm1", name: "Sarah Mitchell", role: "rm" },
        ]}
      />,
    );
    const avatars = container.querySelectorAll("span[class*='34px']");
    expect(avatars.length).toBe(2);
    expect(screen.getByText("messaging.you · Sarah Mitchell (messaging.role_short.rm)")).toBeInTheDocument();
    // one separator only
    const caption = screen.getByText(/Sarah Mitchell/);
    expect((caption.textContent!.match(/·/g) ?? []).length).toBe(1);
  });

  it("a three-participant room (client + RM + ARM) shows exactly three avatars and a two-separator caption", () => {
    render(
      <AdvisoryRoom
        messages={[]}
        participants={[
          { uid: "c1", name: "Alex Thompson", role: "client" },
          { uid: "rm1", name: "Sarah Mitchell", role: "rm" },
          { uid: "arm1", name: "Daniel Wu", role: "assistant" },
        ]}
      />,
    );
    const caption = screen.getByText(/Daniel Wu/);
    expect((caption.textContent!.match(/·/g) ?? []).length).toBe(2);
  });
});

describe("UI-2 both translation.json files carry identical messaging + nav.messaging keys", () => {
  function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
    return Object.entries(obj).flatMap(([k, v]) =>
      v !== null && typeof v === "object" ? collectKeys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  }

  it("en and zh-TW define the same messaging.* key set, and both have nav.messaging", () => {
    const enPath = path.resolve(__dirname, "../../../public/locales/en/translation.json");
    const zhPath = path.resolve(__dirname, "../../../public/locales/zh-TW/translation.json");
    const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
    const zh = JSON.parse(fs.readFileSync(zhPath, "utf8"));

    expect(en.nav.messaging).toBeTruthy();
    expect(zh.nav.messaging).toBeTruthy();

    const enKeys = collectKeys(en.messaging).sort();
    const zhKeys = collectKeys(zh.messaging).sort();
    expect(zhKeys).toEqual(enKeys);
  });
});
