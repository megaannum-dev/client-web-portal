"use client";

import { useTranslation } from "react-i18next";
import { ChevronLeft } from "@/lib/icons";

/** The answer page FaqPopup slides to: back link, topic, question, answer. */
export function FaqAnswerView({
  section,
  question,
  answer,
  onBack,
}: {
  section: string;
  question: string;
  answer: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1 -ml-1 p-1 rounded text-[12.5px] font-bold text-primary bg-transparent border-none cursor-pointer hover:opacity-80 transition-opacity"
      >
        <ChevronLeft size={15} strokeWidth={2.25} />
        {t("faq.back")}
      </button>
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-on-surface">{section}</span>
        <h3 className="m-0 text-base leading-snug font-bold text-secondary">{question}</h3>
      </div>
      {/* pre-line: keeps line breaks typed inside the answer's spreadsheet cell */}
      <p className="m-0 text-body-sm text-on-surface leading-relaxed whitespace-pre-line">{answer}</p>
    </div>
  );
}
