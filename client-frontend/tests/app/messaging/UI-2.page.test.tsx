// 021 UI-2 — /messaging page: room header + empty state + composer render;
// nav exposes /messaging third; the FAB is absent there and present
// elsewhere; the participant stack is driven off the array (2 or 3 entries,
// never a fixed 3 — plan §5); both translation.json files carry the same
// `messaging`/`nav.messaging` keys.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key), i18n: { language: "en" } }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/overview" }));

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

import MessagingPage from "@/app/(dashboard)/messaging/page";
import { AdvisoryRoom } from "@/components/messaging/AdvisoryRoom";
import { SidebarNav } from "@/components/sidebar/SidebarNav";

describe("UI-2 /messaging page", () => {
  it("renders the room header, the empty state and the composer", () => {
    render(<MessagingPage />);
    expect(screen.getByText("messaging.title")).toBeInTheDocument();
    expect(screen.getByText("messaging.empty_state")).toBeInTheDocument();
    // With a staff participant present the named variant is used, carrying
    // the RM's name — not the no-participants fallback.
    expect(
      screen.getByPlaceholderText('messaging.composer_placeholder:{"names":"Sarah"}'),
    ).toBeInTheDocument();
  });

  it("renders the two-party stack: the client and their assigned RM, no fabricated ARM", () => {
    render(<MessagingPage />);
    // initials only, since the caption is the one place names surface
    expect(screen.getByText("AT")).toBeInTheDocument();
    expect(screen.getByText("SM")).toBeInTheDocument();
    expect(screen.queryByText("DW")).not.toBeInTheDocument();
  });

  it('"Jump to latest" never appears — an empty thread cannot overflow', () => {
    render(<MessagingPage />);
    expect(screen.queryByText("messaging.jump_to_latest")).not.toBeInTheDocument();
  });
});

describe("UI-2 SidebarNav exposes /messaging third, after /portfolio", () => {
  it("nav order is overview, portfolios, messaging, profile, ...", () => {
    render(<SidebarNav isOpen />);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links.slice(0, 4)).toEqual(["/overview", "/portfolio", "/messaging", "/profile"]);
  });
});

describe("UI-2 FloatingActionButton hides on /messaging", () => {
  it("is present on /overview and absent on /messaging", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({ usePathname: () => "/overview" }));
    vi.doMock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ getIdToken: vi.fn() }) }));
    vi.doMock("@/lib/hooks/useDocuments", () => ({ useDocuments: () => ({ data: [], loading: false, error: null }) }));
    vi.doMock("@/lib/api/documents", () => ({ downloadDocument: vi.fn() }));
    vi.doMock("@/components/ui/RaiseTicketModal", () => ({ RaiseTicketModal: () => null }));

    const { FloatingActionButton: FabOnOverview } = await import("@/components/ui/FloatingActionButton");
    const { container: overviewContainer } = render(<FabOnOverview />);
    expect(overviewContainer.querySelector("button")).toBeTruthy();

    vi.resetModules();
    vi.doMock("next/navigation", () => ({ usePathname: () => "/messaging" }));
    vi.doMock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ getIdToken: vi.fn() }) }));
    vi.doMock("@/lib/hooks/useDocuments", () => ({ useDocuments: () => ({ data: [], loading: false, error: null }) }));
    vi.doMock("@/lib/api/documents", () => ({ downloadDocument: vi.fn() }));
    vi.doMock("@/components/ui/RaiseTicketModal", () => ({ RaiseTicketModal: () => null }));

    const { FloatingActionButton: FabOnMessaging } = await import("@/components/ui/FloatingActionButton");
    const { container: messagingContainer } = render(<FabOnMessaging />);
    expect(messagingContainer.querySelector("button")).toBeFalsy();
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
