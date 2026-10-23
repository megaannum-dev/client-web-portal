"use client";

import { ChevronRight } from "@/lib/icons";
import { FAQ_SECTIONS } from "@/components/faq/faqContent";
import { useFaqText } from "@/components/faq/useFaqText";
import { questionsFor, type Choice, type Session } from "./assistantFlow";

// One choice row inside the assistant's bubble.
function Option({ label, muted, onClick }: { label: string; muted?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg border-none cursor-pointer",
        "bg-surface-low hover:bg-primary/10 text-[13px] font-semibold transition-colors duration-150",
        muted ? "text-secondary" : "text-primary",
      ].join(" ")}
    >
      <span>{label}</span>
      <ChevronRight size={14} strokeWidth={2} className="shrink-0 opacity-60 group-hover:translate-x-0.5 transition-transform duration-150" />
    </button>
  );
}

/** The replies offered for the current round, listed inside the prompt's bubble. */
export function AssistantOptions({ session, onPick }: { session: Session; onPick: (choice: Choice) => void }) {
  const faq = useFaqText();

  let options: { key: string; label: string; muted?: boolean; choice: Choice }[] = [];
  if (session.stage === "topic") {
    options = FAQ_SECTIONS.map((s) => ({ key: s.key, label: faq.section(s.key), choice: { type: "topic", topic: s.key } }));
  } else if (session.stage === "question") {
    options = [
      ...questionsFor(session.topic).map((item) => ({ key: item, label: faq.question(item), choice: { type: "question", item } as Choice })),
      { key: "not_listed", label: faq.script("not_listed"), muted: true, choice: { type: "not_listed" } },
    ];
  } else if (session.stage === "resolved") {
    options = [
      { key: "solved", label: faq.script("solved"), choice: { type: "solved" } },
      { key: "contact_rm", label: faq.script("contact_rm"), choice: { type: "contact_rm" } },
    ];
  }

  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o) => (
        <Option key={o.key} label={o.label} muted={o.muted} onClick={() => onPick(o.choice)} />
      ))}
    </div>
  );
}
