"use client";

import { useTranslation } from "react-i18next";
import { Search } from "@/lib/icons";
import { FaqQuestionRow } from "./FaqQuestionRow";
import type { FaqSection } from "./faqContent";
import { useFaqText } from "./useFaqText";

/** The FAQ list page: search box, then the (already filtered) questions by topic. */
export function FaqList({
  query,
  onQueryChange,
  sections,
  onOpen,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  sections: FaqSection[];
  onOpen: (section: string, item: string) => void;
}) {
  const { t } = useTranslation();
  const faq = useFaqText();
  return (
    <>
      <div className="px-6 pt-4 pb-2">
        <label className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-lowest px-3 py-2 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-shadow">
          <Search size={14} strokeWidth={2} className="shrink-0 text-secondary" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("faq.search_placeholder")}
            className="flex-1 min-w-0 bg-transparent outline-none text-body-sm text-on-surface placeholder:text-secondary/60"
          />
        </label>
      </div>

      <div className="px-6 pb-4">
        {sections.length === 0 ? (
          <p className="py-8 text-center text-body-sm text-secondary">{t("faq.no_results")}</p>
        ) : (
          sections.map((section) => (
            <section key={section.key} className="pt-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.05em] text-on-surface">
                {faq.section(section.key)}
              </h3>
              {section.items.map((item) => (
                <FaqQuestionRow
                  key={item}
                  question={faq.question(item)}
                  onOpen={() => onOpen(section.key, item)}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </>
  );
}
