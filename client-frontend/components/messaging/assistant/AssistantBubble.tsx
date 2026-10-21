"use client";

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Bot } from "@/lib/icons";
import { bubbleInClass } from "../bubbleAnimation";
import type { Entry } from "./assistantFlow";

/** The display text for one transcript entry, in the current language. */
export function entryText(entry: Entry, t: TFunction): string {
  switch (entry.kind) {
    case "ask_topic":    return t("messaging.assistant.ask_topic");
    case "ask_question": return t("messaging.assistant.ask_question", { topic: t(`faq.sections.${entry.topic}`) });
    case "answer":       return t(`faq.items.${entry.item}.a`);
    case "ask_resolved": return t("messaging.assistant.ask_resolved");
    case "glad":         return t("messaging.assistant.glad");
    case "handoff":      return t("messaging.assistant.handoff");
    case "topic":        return t(`faq.sections.${entry.topic}`);
    case "question":     return t(`faq.items.${entry.item}.q`);
    case "not_listed":   return t("messaging.assistant.not_listed");
    case "solved":       return t("messaging.assistant.solved");
    case "contact_rm":   return t("messaging.assistant.contact_rm");
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
  const { t } = useTranslation();
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
        <span>{entryText(entry, t)}</span>
        {children}
      </div>
    </div>
  );
}
