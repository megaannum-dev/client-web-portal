// FAQ structure only — the wording lives in translation.json under
// `faq.sections.<section>` and `faq.items.<item>.q|a`, so both languages
// share one ordering and adding a question is: a key here + two strings.

export interface FaqSection {
  key: string;
  items: string[];
}

export const FAQ_SECTIONS: FaqSection[] = [
  { key: "account",   items: ["change_contact", "two_factor", "preferences", "suspicious_activity"] },
  { key: "portfolio", items: ["balance_terms", "hidden_balances", "models", "data_updates"] },
  { key: "requests",  items: ["invest", "withdraw", "redemption_time", "minimum", "statuses", "track", "cancel"] },
  { key: "documents", items: ["monthly", "legal"] },
  { key: "kyc",       items: ["what_kyc", "upload_kyc", "kyc_time"] },
  { key: "support",   items: ["contact_rm", "send_files", "events_page", "notification_settings"] },
];

/**
 * Sections narrowed to the items whose question or answer contains `query`
 * (case-insensitive, in the current language). Sections left empty drop out;
 * a blank query returns everything.
 */
export function filterFaq(
  sections: FaqSection[],
  query: string,
  t: (key: string) => string,
): FaqSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter((item) =>
        `${t(`faq.items.${item}.q`)} ${t(`faq.items.${item}.a`)}`.toLowerCase().includes(q),
      ),
    }))
    .filter((s) => s.items.length > 0);
}
