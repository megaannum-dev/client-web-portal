"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Bot, RotateCcw } from "@/lib/icons";
import { PanelHeader, PANEL_ICON_BUTTON } from "@/components/ui/PanelHeader";
import { AssistantBubble } from "./AssistantBubble";
import { AssistantOptions } from "./AssistantOptions";
import type { Choice, Session } from "./assistantFlow";

// Gap between the client's bubble and each assistant reply in the same batch.
const REPLY_DELAY_MS = 400;

/** The help assistant's chat: transcript above, the current round's replies below. */
export function AssistantRoom({
  session,
  onPick,
  onStartOver,
  onClose,
  maximized,
  onToggleMaximize,
}: {
  session: Session;
  onPick: (choice: Choice) => void;
  onStartOver: () => void;
  onClose: () => void;
  maximized: boolean;
  onToggleMaximize: () => void;
}) {
  const { t } = useTranslation();
  const threadRef = useRef<HTMLDivElement | null>(null);
  const log = session.log;

  // Which entries pop in: only those added after the room opened, so a
  // restored transcript appears still. Start over shrinks the log, which
  // lowers the baseline so the fresh conversation animates too.
  const baseline = useRef(log.length);
  const delays = useRef<Record<number, number>>({});
  if (log.length < baseline.current) {
    baseline.current = log.length;
    delays.current = {}; // indices restart, so drop the old conversation's delays
  }
  // Each pick appends a batch (client bubble, then the assistant's replies);
  // later entries in a batch wait their turn. Delays are fixed on first sight
  // so a re-render mid-animation can't shift them.
  const prevLength = useRef(log.length);
  for (let i = prevLength.current; i < log.length; i++) {
    delays.current[i] ??= (i - prevLength.current) * REPLY_DELAY_MS;
  }
  useEffect(() => {
    prevLength.current = log.length;
  }, [log.length]);

  // Keep the newest exchange in view as the transcript grows.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [session.log.length]);

  return (
    <div className="h-full flex flex-col bg-surface-lowest">
      <PanelHeader
        avatar={
          <span className="size-[34px] rounded-full inline-flex items-center justify-center bg-primary/10 text-primary shrink-0">
            <Bot size={18} strokeWidth={1.75} />
          </span>
        }
        title={t("messaging.assistant.name")}
        subtitle={t("messaging.assistant.subtitle")}
        actions={
          <button type="button" onClick={onStartOver} aria-label={t("messaging.assistant.start_over")} className={PANEL_ICON_BUTTON}>
            <RotateCcw size={15} strokeWidth={1.75} />
          </button>
        }
        maximized={maximized}
        onToggleMaximize={onToggleMaximize}
        onClose={onClose}
        closeLabel={t("messaging.close")}
      />

      <div ref={threadRef} className="flex-1 min-h-0 overflow-auto py-[18px] px-6 bg-surface-low flex flex-col gap-3">
        {/* The current round's choices live inside the assistant's latest
            bubble, so the prompt and its options read as one message. */}
        {log.map((entry, i) => (
          <AssistantBubble key={i} entry={entry} animate={i >= baseline.current} delayMs={delays.current[i] ?? 0}>
            {i === log.length - 1 && entry.from === "bot" ? (
              <AssistantOptions session={session} onPick={onPick} />
            ) : undefined}
          </AssistantBubble>
        ))}
      </div>
    </div>
  );
}
