// FAQ content, generated from content/faq/faq.csv by `npm run faq`
// (runs automatically before dev/build). Edit the CSV, not the JSON —
// see content/faq/README.md.
//
// Topics and questions get positional ids (t1, t1q2) shared by every
// language; FaqText resolves them to text in the current one.

import generated from "./faq.generated.json";

export interface FaqSection {
  key: string;
  items: string[];
}

/** The help assistant's lines, from content/faq/assistant.csv. */
export type AssistantLine =
  | "ask_topic" | "ask_question" | "ask_resolved" | "solved" | "contact_rm" | "glad" | "not_listed" | "handoff";

export interface FaqText {
  section: (key: string) => string;
  question: (item: string) => string;
  answer: (item: string) => string;
  /** An assistant line, with {{name}} placeholders filled from `vars`. */
  script: (line: AssistantLine, vars?: Record<string, string>) => string;
}

interface LangText {
  sections: Record<string, string>;
  items: Record<string, { q: string; a: string }>;
}

const TEXT = generated.text as Record<string, LangText>;
const SCRIPT = generated.assistant as Record<string, Record<string, string>>;

/** Changes whenever the content does — see useAssistantSession. */
export const FAQ_VERSION: string = generated.version;

export const FAQ_SECTIONS: FaqSection[] = generated.sections;

/** Text lookups for `language` ("zh-TW", "en", …), falling back to English. */
export function faqText(language: string): FaqText {
  const code = TEXT[language] ? language : TEXT[language.split("-")[0]] ? language.split("-")[0] : "en";
  const lang = TEXT[code];
  const script = SCRIPT[code] ?? SCRIPT.en;
  return {
    section: (key) => lang.sections[key] ?? TEXT.en.sections[key] ?? "",
    question: (item) => lang.items[item]?.q ?? TEXT.en.items[item]?.q ?? "",
    answer: (item) => lang.items[item]?.a ?? TEXT.en.items[item]?.a ?? "",
    script: (line, vars = {}) =>
      (script[line] ?? SCRIPT.en[line] ?? "").replace(/\{\{(\w+)\}\}/g, (m, name: string) => vars[name] ?? m),
  };
}

/**
 * Sections narrowed to the items whose question or answer contains `query`
 * (case-insensitive, in the current language). Sections left empty drop out;
 * a blank query returns everything.
 */
export function filterFaq(sections: FaqSection[], query: string, text: FaqText): FaqSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter((item) => `${text.question(item)} ${text.answer(item)}`.toLowerCase().includes(q)),
    }))
    .filter((s) => s.items.length > 0);
}
