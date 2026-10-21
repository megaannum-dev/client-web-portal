// FAQ popup: the content structure resolves in both languages, the search
// filter narrows questions (and drops emptied sections), one answer opens at a
// time, and "Still need help?" hands off to the chat.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

import { FAQ_SECTIONS, filterFaq } from "@/components/faq/faqContent";
import { FaqPopup } from "@/components/faq/FaqPopup";

function loadLocale(lang: string) {
  const p = path.resolve(__dirname, `../../../public/locales/${lang}/translation.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

describe("FAQ content", () => {
  it.each(["en", "zh-TW"])("every section and question in FAQ_SECTIONS has %s text", (lang) => {
    const { faq } = loadLocale(lang);
    for (const section of FAQ_SECTIONS) {
      expect(faq.sections[section.key], section.key).toBeTruthy();
      for (const item of section.items) {
        expect(faq.items[item]?.q, `${item}.q`).toBeTruthy();
        expect(faq.items[item]?.a, `${item}.a`).toBeTruthy();
      }
    }
  });

  it("en and zh-TW carry the same faq key set", () => {
    const keys = (o: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v !== null && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
      );
    expect(keys(loadLocale("zh-TW").faq).sort()).toEqual(keys(loadLocale("en").faq).sort());
  });
});

describe("filterFaq", () => {
  const text: Record<string, string> = {
    "faq.items.a.q": "How do I invest?",
    "faq.items.a.a": "Raise an Allotment ticket.",
    "faq.items.b.q": "What is KYC?",
    "faq.items.b.a": "Identity verification.",
  };
  const t = (k: string) => text[k] ?? k;
  const sections = [
    { key: "requests", items: ["a"] },
    { key: "kyc", items: ["b"] },
  ];

  it("returns everything for a blank query", () => {
    expect(filterFaq(sections, "  ", t)).toEqual(sections);
  });

  it("matches question or answer text, case-insensitively, and drops empty sections", () => {
    expect(filterFaq(sections, "ALLOTMENT", t)).toEqual([{ key: "requests", items: ["a"] }]);
    expect(filterFaq(sections, "kyc", t)).toEqual([{ key: "kyc", items: ["b"] }]);
    expect(filterFaq(sections, "nothing here", t)).toEqual([]);
  });
});

describe("FaqPopup", () => {
  it("clicking a question slides to its answer page; back slides to the list, search kept", () => {
    render(<FaqPopup onClose={() => {}} onOpenChat={() => {}} />);
    const search = screen.getByPlaceholderText("faq.search_placeholder");
    fireEvent.change(search, { target: { value: "two_factor" } });
    const listPage = search.closest("[class*='absolute']")!;

    expect(screen.queryByText("faq.items.two_factor.a")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "faq.items.two_factor.q" }));

    const answer = screen.getByText("faq.items.two_factor.a");
    const answerPage = answer.closest("[class*='absolute']")!;
    expect(answerPage.className).toContain("translate-x-0");
    expect(listPage.className).toContain("-translate-x-full");
    expect(screen.getByRole("heading", { name: "faq.items.two_factor.q" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /faq.back/ }));
    expect(listPage.className).toContain("translate-x-0");
    expect(answerPage.className).toContain("translate-x-full");
    expect((search as HTMLInputElement).value).toBe("two_factor");
  });

  it("search narrows the list and shows the empty state when nothing matches", () => {
    render(<FaqPopup onClose={() => {}} onOpenChat={() => {}} />);
    const search = screen.getByPlaceholderText("faq.search_placeholder");

    // With the identity t(), each question's text is its own key.
    fireEvent.change(search, { target: { value: "redemption_time" } });
    expect(screen.getByRole("button", { name: "faq.items.redemption_time.q" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "faq.items.two_factor.q" })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("faq.no_results")).toBeInTheDocument();
  });

  it("close and the chat hand-off call their handlers", () => {
    const onClose = vi.fn();
    const onOpenChat = vi.fn();
    render(<FaqPopup onClose={onClose} onOpenChat={onOpenChat} />);
    fireEvent.click(screen.getByRole("button", { name: "faq.close" }));
    fireEvent.click(screen.getByRole("button", { name: /faq.message_team/ }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenChat).toHaveBeenCalledOnce();
  });
});

describe("FloatingActionButton FAQ action", () => {
  it("opens the FAQ panel, and its chat hand-off swaps it for the chat (one panel at a time)", async () => {
    vi.resetModules();
    vi.doMock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ getIdToken: vi.fn() }) }));
    vi.doMock("@/lib/hooks/useDocuments", () => ({ useDocuments: () => ({ data: [], loading: false, error: null }) }));
    vi.doMock("@/lib/api/documents", () => ({ downloadDocument: vi.fn() }));
    vi.doMock("@/components/ui/RaiseTicketModal", () => ({ RaiseTicketModal: () => null }));
    vi.doMock("@/components/messaging/ChatPopup", () => ({
      ChatPopup: () => <div role="dialog" aria-label="chat" />,
    }));
    vi.doMock("@/components/faq/FaqPopup", () => ({
      FaqPopup: ({ onOpenChat }: { onOpenChat: () => void }) => (
        <div role="dialog" aria-label="faq">
          <button type="button" onClick={onOpenChat}>to-chat</button>
        </div>
      ),
    }));

    const { FloatingActionButton } = await import("@/components/ui/FloatingActionButton");
    render(<FloatingActionButton />);

    fireEvent.click(screen.getByRole("button", { name: "fab.quick_actions" }));
    fireEvent.click(screen.getByRole("button", { name: "fab.common_query_faq" }));
    expect(screen.getByRole("dialog", { name: "faq" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("to-chat"));
    expect(screen.queryByRole("dialog", { name: "faq" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "chat" })).toBeInTheDocument();
  });
});
