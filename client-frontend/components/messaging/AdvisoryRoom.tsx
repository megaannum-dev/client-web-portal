// 021 UI-2 — the Advisory Room: header chrome, thread, docs aside, composer.
// Presentation only (plan §0/§5): messages/participants are unbound props
// with no-op defaults, onSend/onAttach are unwired seams. No data fetch, no
// WebSocket, no lib/api import — the wiring branch changes call sites only.
"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MessagesSquare,
  SendHorizontal,
  CalendarSearch,
  Paperclip,
  ArrowDown,
  X,
} from "@/lib/icons";
import { MessageBubble } from "./MessageBubble";
import { AttachmentRow } from "./AttachmentRow";
import { DayJumpCalendar } from "./DayJumpCalendar";
import type { ChatDay, Participant } from "./types";

// ponytail: design literals with no token equivalent (plan §2/§123) — same
// avatar fills as MessageBubble, duplicated rather than shared (no
// cross-component primitive is worth extracting for a 3-line map, and the
// two apps already duplicate this per plan §10).
const AVATAR_CLASS: Record<Participant["role"], string> = {
  client: "text-[#5a3a17]",
  rm: "bg-primary text-primary-foreground",
  assistant: "bg-[#5c6d63] text-white",
};
const AVATAR_STYLE: Partial<Record<Participant["role"], React.CSSProperties>> = {
  client: { background: "linear-gradient(135deg,#ffd9b0,#f6b878)" },
};

function initials(name: string | null): string {
  return (
    (name ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Not ported from the design's mock labels ("Today", "Fri, 18 Jul 2026") —
// those are baked into its fixtures. Derived here instead (plan §5), local
// to this folder since neither app has a shared date util (plan §10).
function dayLabel(iso: string, locale: string, todayLabel: string, yesterdayLabel: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDate(date, today)) return todayLabel;
  if (isSameDate(date, yesterday)) return yesterdayLabel;
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(date);
}

const ROLE_SHORT_KEY: Partial<Record<Participant["role"], string>> = {
  rm: "messaging.role_short.rm",
  assistant: "messaging.role_short.assistant",
};

export function AdvisoryRoom({
  messages = [],
  participants = [],
  onSend = () => {},
  onAttach = () => {},
}: {
  messages?: ChatDay[];
  participants?: Participant[];
  onSend?: (body: string) => void;
  onAttach?: (files: File[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState("");
  const [docsOpen, setDocsOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [jumpedTo, setJumpedTo] = useState<string | null>(null);
  const [atLatest, setAtLatest] = useState(true);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const recordedIsos = new Set(messages.map((d) => d.iso));
  const allDocs = messages
    .flatMap((d) =>
      d.msgs.flatMap((m) =>
        m.attachments.map((a) => ({
          attachment: a,
          iso: d.iso,
          senderName: m.own ? t("messaging.you") : (m.senderName ?? "?"),
          time: m.time,
        })),
      ),
    )
    .reverse(); // newest first

  const caption = participants
    .map((p) =>
      p.role === "client"
        ? t("messaging.you")
        : `${p.name ?? "?"} (${t(ROLE_SHORT_KEY[p.role] ?? "")})`,
    )
    .join(" · ");

  const staffNames = participants.filter((p) => p.role !== "client").map((p) => (p.name ?? "?").split(" ")[0]);
  const composerPlaceholder =
    staffNames.length > 0
      ? t("messaging.composer_placeholder", {
          names: new Intl.ListFormat(i18n.language, { style: "long", type: "conjunction" }).format(staffNames),
        })
      : t("messaging.composer_placeholder_empty");

  function scrollThreadTo(el: HTMLElement | null) {
    const thread = threadRef.current;
    if (thread && el) thread.scrollTop = Math.max(0, el.offsetTop - thread.offsetTop - 12);
  }

  function jumpTo(iso: string) {
    const anchor = threadRef.current?.querySelector<HTMLElement>(`[data-day="${iso}"]`);
    scrollThreadTo(anchor ?? null);
    setJumpedTo(iso);
    setCalOpen(false);
  }

  function jumpToLatest() {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
    setJumpedTo(null);
    setAtLatest(true);
  }

  function onThreadScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setAtLatest(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  }

  function send() {
    const body = draft.trim();
    if (!body) return;
    onSend(body);
    setDraft("");
    requestAnimationFrame(() => {
      const thread = threadRef.current;
      if (thread) thread.scrollTop = thread.scrollHeight;
    });
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onAttach(files);
    e.target.value = "";
  }

  return (
    <div className="h-full flex flex-col bg-surface-lowest">
      {/* Room header */}
      <div className="flex items-center gap-3 py-3.5 px-6 border-b border-outline-variant shrink-0 relative">
        <div className="flex">
          {participants.map((p, i) => (
            <span
              key={p.uid}
              className={[
                "size-[34px] rounded-full inline-flex items-center justify-center text-[13px] font-bold shadow-[0_0_0_2px_rgb(var(--color-surface-lowest))]",
                i > 0 ? "-ml-2.5" : "",
                AVATAR_CLASS[p.role],
              ].join(" ")}
              style={AVATAR_STYLE[p.role]}
            >
              {initials(p.name)}
            </span>
          ))}
        </div>

        <div className="min-w-0">
          <h2 className="m-0 text-base leading-tight font-bold text-on-surface">{t("messaging.title")}</h2>
          <p className="mt-[3px] mb-0 text-xs text-secondary">{caption}</p>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCalOpen((v) => !v)}
            aria-label={t("messaging.jump_to_date")}
            className={[
              "inline-flex items-center justify-center size-8 rounded-full border-none cursor-pointer transition-all duration-150",
              calOpen ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
            ].join(" ")}
          >
            <CalendarSearch size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setDocsOpen((v) => !v)}
            aria-label={t("messaging.documents_shared")}
            className={[
              "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full border-none cursor-pointer text-[12.5px] font-bold transition-all duration-150",
              docsOpen ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
            ].join(" ")}
          >
            <Paperclip size={16} strokeWidth={1.75} />
            <span>{allDocs.length}</span>
          </button>
        </div>

        {calOpen && (
          <DayJumpCalendar recordedIsos={recordedIsos} selectedIso={jumpedTo} onPick={jumpTo} />
        )}
      </div>

      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* Thread + composer column */}
        <div className="flex-1 min-w-0 flex flex-col relative">
          <div
            ref={threadRef}
            onScroll={onThreadScroll}
            className="flex-1 overflow-auto py-[18px] px-6 bg-surface-low"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-secondary">
                <MessagesSquare size={32} strokeWidth={1.5} className="opacity-40" />
                <p className="text-body-sm">{t("messaging.empty_state")}</p>
              </div>
            ) : (
              messages.map((day) => (
                <div key={day.iso} data-day={day.iso} className="flex flex-col gap-4 pb-4">
                  <div className="flex items-center gap-3 py-0.5">
                    <span className={["flex-1 h-px bg-outline-variant", jumpedTo === day.iso ? "opacity-90" : "opacity-55"].join(" ")} />
                    <span
                      className={[
                        "text-[10.5px] font-bold uppercase tracking-[0.06em]",
                        jumpedTo === day.iso ? "text-primary opacity-100" : "text-secondary opacity-70",
                      ].join(" ")}
                    >
                      {dayLabel(day.iso, i18n.language, t("messaging.today"), t("messaging.yesterday"))}
                    </span>
                    <span className={["flex-1 h-px bg-outline-variant", jumpedTo === day.iso ? "opacity-90" : "opacity-55"].join(" ")} />
                  </div>
                  {day.msgs.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                </div>
              ))
            )}
          </div>

          {!atLatest && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute left-1/2 -translate-x-1/2 bottom-[76px] z-[3] inline-flex items-center gap-[7px] h-8 px-3.5 rounded-full border border-outline-variant bg-surface-lowest text-primary cursor-pointer text-[12.5px] font-bold shadow-overlay"
            >
              <ArrowDown size={15} strokeWidth={1.75} />
              <span>{t("messaging.jump_to_latest")}</span>
            </button>
          )}

          <div className="flex items-start gap-2.5 pt-3 px-5 pb-3.5 shrink-0 border-t border-outline-variant">
            <button
              type="button"
              aria-label={t("messaging.attach_document")}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center size-[34px] rounded-full border-none bg-surface-container text-secondary cursor-pointer flex-none"
            >
              <Paperclip size={16} strokeWidth={1.75} />
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFilesPicked} />
            <textarea
              rows={2}
              placeholder={composerPlaceholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onComposerKeyDown}
              className="flex-1 resize-none box-border min-h-[52px] max-h-[140px] py-3 px-4 rounded-lg border border-outline outline-none text-[13.5px] leading-[18px] text-on-surface bg-surface-lowest"
            />
            <button
              type="button"
              onClick={send}
              aria-label={t("messaging.send")}
              className={[
                "inline-flex items-center justify-center size-[34px] rounded-full border-none flex-none",
                draft.trim() ? "bg-primary text-primary-foreground cursor-pointer" : "bg-surface-container text-secondary cursor-not-allowed",
              ].join(" ")}
            >
              <SendHorizontal size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Shared documents aside */}
        <aside
          className={[
            "flex-none overflow-hidden flex flex-col min-h-0 bg-surface-lowest transition-[width] duration-[250ms] ease-in-out",
            docsOpen ? "w-[300px] border-l border-outline-variant" : "w-0",
          ].join(" ")}
        >
          <div className="w-[300px] flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-2 pt-3 pr-2 pb-2.5 pl-3.5 border-b border-outline-variant">
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
                {t("messaging.shared_documents", { count: allDocs.length })}
              </span>
              <button
                type="button"
                onClick={() => setDocsOpen(false)}
                className="inline-flex items-center gap-1.5 h-[26px] px-[9px] rounded-full border-none bg-surface-container text-secondary cursor-pointer text-[11.5px] font-semibold"
              >
                <X size={13} strokeWidth={1.75} />
                <span>{t("messaging.hide")}</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2.5 flex flex-col gap-2.5">
              {allDocs.map((d) => (
                <div key={d.attachment.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => jumpTo(d.iso)}
                    className="self-start text-[10px] font-bold tracking-[0.05em] uppercase text-secondary bg-transparent border-none p-0 cursor-pointer"
                  >
                    {dayLabel(d.iso, i18n.language, t("messaging.today"), t("messaging.yesterday"))}
                  </button>
                  <AttachmentRow
                    attachment={d.attachment}
                    meta={t("messaging.shared_by", { name: d.senderName, size: d.attachment.size })}
                    fullWidth
                  />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
