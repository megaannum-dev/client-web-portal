"use client";

import type { FaqText } from "@/components/faq/faqContent";
import { useFaqText } from "@/components/faq/useFaqText";
import { Bot } from "@/lib/icons";
import { bubbleInClass } from "../bubbleAnimation";
import type { Entry } from "./assistantFlow";

/** The display text for one transcript entry, in the current language — all of
 *  it from the FAQ content (faq.csv + assistant.csv), none from translation.json. */
export function entryText(entry: Entry, faq: FaqText): string {
  switch (entry.kind) {
    case "ask_question": return faq.script("ask_question", { topic: faq.section(entry.topic) });
    case "answer":       return faq.answer(entry.item);
    case "topic":        return faq.section(entry.topic);
    case "question":     return faq.question(entry.item);
    // The rest are fixed assistant lines (ask_topic, glad, solved, …).
    default:             return faq.script(entry.kind);
  }
}

/** One transcript bubble — same shapes as MessageBubble (bot left, client right).
 *  `children` (the current round's choices) render inside it, under the text. */
export function AssistantBubble({
  entry,
  children,
  animate = false,
  delayMs = 0,
}: {
  entry: Entry;
  children?: React.ReactNode;
  /** Pop in iMessage-style — for entries added while the room is open. */
  animate?: boolean;
  /** Hold the pop so the assistant "replies" after the client's bubble. */
  delayMs?: number;
}) {
  const faq = useFaqText();
  const mine = entry.from === "user";
  return (
    <div
      className={["flex gap-2.5 items-end", mine ? "flex-row-reverse" : "flex-row", bubbleInClass(animate, mine)].join(" ")}
      style={animate && delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {!mine && (
        <span className="size-[30px] rounded-full inline-flex items-center justify-center flex-none bg-primary/10 text-primary">
          <Bot size={16} strokeWidth={1.75} />
        </span>
      )}
      <div
        className={[
          "py-2.5 px-3.5 text-[13.5px] leading-[1.5]",
          children ? "max-w-[85%] flex flex-col gap-2.5" : "max-w-[80%]",
          mine
            ? "rounded-[14px_4px_14px_14px] bg-primary text-primary-foreground"
            : "rounded-[4px_14px_14px_14px] bg-surface-lowest text-on-surface border border-outline-variant",
        ].join(" ")}
      >
        <span className="whitespace-pre-line">{entryText(entry, faq)}</span>
        {children}
      </div>
    </div>
  );
}
