// FAQ: the CSV → JSON pipeline (CSV parsing, sheet validation with row
// numbers, generated file up to date), the search filter, and the popup's list →
// answer navigation and chat hand-off.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

import { FAQ_SECTIONS, FAQ_VERSION, faqText, filterFaq } from "@/components/faq/faqContent";
import { FaqPopup } from "@/components/faq/FaqPopup";
import { parseCsv, parseFaqCsv } from "@/scripts/faq/parseFaqCsv.mjs";

const root = path.resolve(__dirname, "../../..");
const en = faqText("en");

// Testing Library collapses whitespace in the page's text but not in the
// string searched for, so multi-paragraph answers are matched collapsed too.
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

const HEADER = "topic_en,topic_zh,question_en,question_zh,answer_en,answer_zh";

describe("parseCsv", () => {
  it("handles quoted cells with commas, doubled quotes and line breaks, CRLF, and a BOM", () => {
    const csv = '\uFEFFa,b\r\n"x, y","say ""hi""\nline 2"\r\n';
    expect(parseCsv(csv)).toEqual([["a", "b"], ["x, y", 'say "hi"\nline 2']]);
  });
});

describe("parseFaqCsv", () => {
  it("groups rows by topic in sheet order, keeps both languages, and skips blank rows", () => {
    const csv = [
      HEADER,
      "Account,帳戶,How do I log out?,如何登出？,\"Click your avatar.\nThen Log out.\",點擊頭像。",
      ",,,,,",
      "KYC,KYC,What is KYC?,甚麼是 KYC？,Identity checks.,身分核實。",
      "Account,帳戶,Change email?,更改電郵？,Use Settings.,使用設定。",
    ].join("\n");
    const { sections, text } = parseFaqCsv(csv);
    expect(sections).toEqual([
      { key: "t1", items: ["t1q1", "t1q2"] },
      { key: "t2", items: ["t2q1"] },
    ]);
    expect(text.en.sections).toEqual({ t1: "Account", t2: "KYC" });
    expect(text["zh-TW"].items.t1q2).toEqual({ q: "更改電郵？", a: "使用設定。" });
    expect(text.en.items.t1q1.a).toBe("Click your avatar.\nThen Log out.");
  });

  it("accepts the columns in any order", () => {
    const csv = "answer_zh,answer_en,question_zh,question_en,topic_zh,topic_en\n答,A,問,Q?,主題,Topic";
    expect(parseFaqCsv(csv).text.en.items.t1q1).toEqual({ q: "Q?", a: "A" });
  });

  it.each([
    ["a missing column", "topic_en,topic_zh,question_en,question_zh,answer_en\nT,主,Q,問,A", /row 1: missing column\(s\): answer_zh/],
    ["an empty cell", `${HEADER}\nT,主,Q,問,A,\nT,主,Q2,問2,A2,答2`, /row 2: empty cell\(s\): answer_zh/],
    ["a topic spelled differently in Chinese", `${HEADER}\nT,主題,Q,問,A,答\nT,主题,Q2,問2,A2,答2`, /row 3: topic "T" has topic_zh "主题" here but "主題" in row 2/],
    ["garbled (non-UTF-8) text", `${HEADER}\nT,\uFFFD,Q,問,A,答`, /CSV UTF-8/],
    ["no questions at all", `${HEADER}\n`, /no questions found/],
  ])("rejects %s with the row number", (_, csv, message) => {
    expect(() => parseFaqCsv(csv, "faq.csv")).toThrow(message);
  });
});

describe("FAQ content files", () => {
  it("components/faq/faq.generated.json is up to date with content/faq/faq.csv (run `npm run faq`)", () => {
    const fromCsv = parseFaqCsv(fs.readFileSync(path.join(root, "content/faq/faq.csv"), "utf8"), "faq.csv");
    const generated = JSON.parse(fs.readFileSync(path.join(root, "components/faq/faq.generated.json"), "utf8"));
    expect({ sections: generated.sections, text: generated.text }).toEqual(fromCsv);
    expect(FAQ_VERSION).toBe(generated.version);
  });

  it("every question has text in both languages", () => {
    for (const lang of ["en", "zh-TW"]) {
      const text = faqText(lang);
      for (const s of FAQ_SECTIONS) {
        expect(text.section(s.key)).toBeTruthy();
        for (const item of s.items) {
          expect(text.question(item)).toBeTruthy();
          expect(text.answer(item)).toBeTruthy();
        }
      }
    }
  });

  it("falls back to English for an unknown language", () => {
    const first = FAQ_SECTIONS[0].items[0];
    expect(faqText("fr").question(first)).toBe(en.question(first));
  });
});

describe("filterFaq", () => {
  it("returns everything for a blank query", () => {
    expect(filterFaq(FAQ_SECTIONS, "  ", en)).toEqual(FAQ_SECTIONS);
  });

  it("matches question or answer text, case-insensitively, and drops empty sections", () => {
    const item = FAQ_SECTIONS[1].items[0];
    const hits = filterFaq(FAQ_SECTIONS, en.question(item).toUpperCase(), en);
    expect(hits.flatMap((s) => s.items)).toContain(item);
    expect(filterFaq(FAQ_SECTIONS, "zzz-nothing-matches", en)).toEqual([]);
  });
});

describe("FaqPopup", () => {
  const [section] = FAQ_SECTIONS;
  const item = section.items[1];
  const otherItem = FAQ_SECTIONS[1].items[0];

  it("clicking a question slides to its answer page; back slides to the list, search kept", () => {
    render(<FaqPopup onClose={() => {}} onOpenChat={() => {}} />);
    const search = screen.getByPlaceholderText("faq.search_placeholder");
    fireEvent.change(search, { target: { value: en.question(item) } });
    const listPage = search.closest("[class*='absolute']")!;

    expect(screen.queryByText(flat(en.answer(item)))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.question(item) }));

    const answer = screen.getByText(flat(en.answer(item)));
    const answerPage = answer.closest("[class*='absolute']")!;
    expect(answerPage.className).toContain("translate-x-0");
    expect(listPage.className).toContain("-translate-x-full");
    expect(screen.getByRole("heading", { name: en.question(item) })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /faq.back/ }));
    expect(listPage.className).toContain("translate-x-0");
    expect(answerPage.className).toContain("translate-x-full");
    expect((search as HTMLInputElement).value).toBe(en.question(item));
  });

  it("search narrows the list and shows the empty state when nothing matches", () => {
    render(<FaqPopup onClose={() => {}} onOpenChat={() => {}} />);
    const search = screen.getByPlaceholderText("faq.search_placeholder");

    fireEvent.change(search, { target: { value: en.question(item) } });
    expect(screen.getByRole("button", { name: en.question(item) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.question(otherItem) })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzz-nothing-matches" } });
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
