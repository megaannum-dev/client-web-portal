"use client";

// 021 UI-4 — the shrinkable Client Room panel: mini/full geometry, chrome,
// thread, shared-documents aside, gated composer, Escape-to-close.
//
// Portals into DashboardShell's #content-overlay-root — a viewport-pinned
// box that excludes the sidebar/header and animates with the sidebar,
// exactly as components/rm/Shared.tsx's Modal does (see its docstring).
// This replaces the design's `inset` prop + ResizeObserver-measured region
// entirely: the overlay root already *is* that region (plan §4/§9).

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  CalendarSearch, Eye, Maximize2, Minimize2, MessagesSquare, Paperclip, SendHorizontal, X, ArrowDown,
  FileText, FileSpreadsheet, FileCheck2,
} from "@/lib/icons";
import { useCanEdit } from "@/hooks/usePageAccess";
import { AttachmentRow } from "./AttachmentRow";
import { attachmentKind, formatBytes } from "@/lib/chat/adapter";
import { useAttachmentDownload } from "@/lib/chat/useAttachmentDownload";
import { DayJumpCalendar } from "./DayJumpCalendar";
import { MessageBubble, RoomAvatar } from "./MessageBubble";
import type { ChatDay, Participant, SenderRole } from "./types";

const M = 16;
const MINI_W = 428;
const MINI_H = 660;
const EASE = "cubic-bezier(.4,0,.2,1)";

// "Shared by X" label in the docs aside — distinct from MessageBubble's
// CR_ROLE (that one is "Relationship Manager"; this one is short, "RM").
const CR_BY: Record<SenderRole, string> = { client: "Client", rm: "RM", assistant: "Assistant RM" };

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function participantCaption(p: Participant, full: boolean): string {
  if (!full) return p.name ?? "Unassigned";
  const roleLabel = { client: "client", rm: "RM", assistant: "Assistant RM" }[p.role];
  return `${p.name ?? "Unassigned"} (${roleLabel})`;
}

export interface ChatRoomPanelProps {
  /** 2–3 entries: client first, then the assigned RM and (if any) ARM. Never a fixed three. */
  participants: Participant[];
  /** Supplied by ChatRoomProvider's thread hook. Still a prop, not a fetch:
   *  this component stays presentational so it can be rendered from a test
   *  with no network, no socket and no auth. */
  messages?: ChatDay[];
  /** Body plus whatever files are staged, as ONE message — the backend takes
   *  many attachments per POST. */
  onSend?: (body: string, files: File[]) => void;
  /** True while that POST is in flight; disables only the send button. */
  sending?: boolean;
  onClose: () => void;
}

const STAGED_ICON = {
  "file-text": FileText,
  sheet: FileSpreadsheet,
  "file-check": FileCheck2,
} as const;

export function ChatRoomPanel({
  participants, messages = [], onSend = () => {}, sending = false, onClose,
}: ChatRoomPanelProps) {
  const [root, setRoot] = useState<Element | null>(null);
  useEffect(() => setRoot(document.getElementById("content-overlay-root")), []);

  const [full, setFull] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [jumpedTo, setJumpedTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Files wait here until Send; picking one is not a send (design ChatRoom.jsx `pending`).
  const [staged, setStaged] = useState<File[]>([]);
  const [atLatest, setAtLatest] = useState(true);

  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = useCanEdit("rm.client-info");
  const download = useAttachmentDownload();

  const client = participants.find((p) => p.role === "client") ?? participants[0];
  const staff = participants.filter((p) => p.uid !== client?.uid);

  // Escape closes the panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function scrollToEnd() {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  // Auto-scroll to the live end on mount.
  useEffect(() => {
    requestAnimationFrame(scrollToEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleThreadScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setAtLatest(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  }

  function jumpLatest() {
    scrollToEnd();
    setJumpedTo(null);
    setAtLatest(true);
  }

  function jumpToDate(iso: string) {
    const el = threadRef.current;
    const anchor = el?.querySelector<HTMLElement>(`[data-day="${iso}"]`);
    if (el && anchor) el.scrollTop = Math.max(0, anchor.offsetTop - el.offsetTop - 12);
    setJumpedTo(iso);
    setCalOpen(false);
  }

  function toggleFull() {
    setFull((f) => !f);
    setCalOpen(false);
    if (atLatest) setTimeout(scrollToEnd, 320);
  }

  function toggleDocs() {
    setDocsOpen((d) => !d);
    setCalOpen(false);
    if (atLatest) setTimeout(scrollToEnd, 320);
  }

  function handleSend() {
    const body = draft.trim();
    if (!body && !staged.length) return;
    onSend(body, staged);
    setDraft("");
    setStaged([]);
    if (atLatest) requestAnimationFrame(scrollToEnd);
  }

  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "76px";
      el.style.height = `${Math.max(76, Math.min(160, el.scrollHeight))}px`;
    }
  }

  function handleFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length) setStaged((prev) => [...prev, ...Array.from(files)]);
    // Reset so re-picking the same file still fires a change event.
    e.target.value = "";
  }

  const messageDates = useMemo(() => new Set(messages.map((d) => d.iso)), [messages]);

  const allDocs = useMemo(() => {
    const docs: { key: string; iso: string; dayLabel: string; by: SenderRole; name: string; size: string; kind: "file-text" | "sheet" | "file-check" }[] = [];
    for (const day of messages) {
      for (const m of day.messages) {
        for (const a of m.attachments) {
          docs.push({ key: a.id, iso: day.iso, dayLabel: day.label, by: m.role, name: a.name, size: a.size, kind: a.kind });
        }
      }
    }
    return docs.reverse();
  }, [messages]);

  const staffNames = staff.map((p) => p.name).filter((n): n is string => !!n);
  const composerPlaceholder = staffNames.length ? `Message ${joinNames(staffNames)}…` : "Message the client room…";

  if (!root) return null;

  const geometryStyle: React.CSSProperties = full
    ? { inset: 0, transition: `inset .3s ${EASE}, border-radius .3s ${EASE}` }
    : {
        top: `max(${M}px, calc(100% - ${MINI_H + M}px))`,
        right: `${M}px`,
        bottom: `${M}px`,
        left: `max(${M}px, calc(100% - ${MINI_W + M}px))`,
        transition: `inset .3s ${EASE}, border-radius .3s ${EASE}`,
      };

  return createPortal(
    <div
      style={geometryStyle}
      className={clsx(
        "pointer-events-auto absolute z-40 flex flex-col overflow-hidden bg-surface-lowest",
        full ? "rounded-none border-0 shadow-none" : "rounded-lg border border-outline-variant shadow-overlay",
      )}
    >
      {/* Header */}
      <div
        className={clsx(
          "relative flex flex-shrink-0 items-center gap-3 border-b border-outline-variant",
          full ? "pt-4 px-5 pb-[14px]" : "pt-[13px] px-[14px] pb-3",
        )}
      >
        <div className="flex">
          {participants.map((p, i) => (
            <RoomAvatar
              key={p.uid}
              name={p.name}
              role={p.role}
              size={full ? 34 : 30}
              ring
              className={i > 0 ? "-ml-2.5" : undefined}
            />
          ))}
        </div>
        <div className="min-w-0">
          <h2 className={clsx("truncate font-bold leading-[1.2] text-on-surface", full ? "text-[16px]" : "text-[14.5px]")}>
            {client?.name ?? "Client"} · Client Room
          </h2>
          <p className="mt-[3px] truncate text-[11.5px] text-secondary">
            {participants.map((p) => participantCaption(p, full)).join(" · ")}
          </p>
        </div>

        <div className="ml-auto flex flex-shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={full ? "Restore panel" : "Maximize panel"}
              onClick={toggleFull}
              className="flex rounded-[6px] p-1 text-secondary"
            >
              {full ? <Minimize2 size={16} strokeWidth={2} /> : <Maximize2 size={16} strokeWidth={2} />}
            </button>
            <button type="button" aria-label="Close" onClick={onClose} className="flex rounded-[6px] p-1 text-secondary">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Jump to a date in this conversation"
              onClick={() => setCalOpen((o) => !o)}
              className={clsx(
                "flex h-[30px] w-[30px] items-center justify-center rounded-full transition-all duration-150",
                calOpen ? "bg-primary text-white" : "bg-primary/10 text-primary",
              )}
            >
              <CalendarSearch size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="Documents shared in this room"
              onClick={toggleDocs}
              className={clsx(
                "flex h-[30px] items-center gap-1.5 rounded-full px-[11px] text-[12.5px] font-bold transition-all duration-150",
                docsOpen ? "bg-primary text-white" : "bg-primary/10 text-primary",
              )}
            >
              <Paperclip size={16} strokeWidth={2} />
              <span>{allDocs.length}</span>
            </button>
          </div>
        </div>

        {calOpen && (
          <DayJumpCalendar
            messageDates={messageDates}
            selectedIso={jumpedTo}
            onPick={jumpToDate}
            onClose={() => setCalOpen(false)}
          />
        )}
      </div>

      {/* Body: thread + docs aside */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className={clsx(
            "relative flex min-w-0 flex-1 flex-col",
            full && docsOpen && "lg:transition-[padding-right] lg:duration-300 lg:ease-[cubic-bezier(.4,0,.2,1)] lg:pr-80",
          )}
        >
          <div
            ref={threadRef}
            onScroll={handleThreadScroll}
            className={clsx("flex-1 overflow-auto bg-surface-low", full ? "py-[18px] px-6" : "py-3.5 px-3")}
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center opacity-60">
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-surface-container text-secondary">
                  <MessagesSquare size={20} strokeWidth={1.75} />
                </span>
                <p className="text-body-sm text-secondary">No messages yet in this room.</p>
              </div>
            ) : (
              <div className={clsx("mx-auto flex flex-col", full && "max-w-[1100px]")}>
                {messages.map((day) => (
                  <div key={day.iso} data-day={day.iso} className="flex flex-col gap-4 pb-4">
                    <div className="flex items-center gap-3 py-0.5">
                      <span
                        className={clsx(
                          "h-px flex-1 bg-outline-variant",
                          jumpedTo === day.iso ? "opacity-90" : "opacity-55",
                        )}
                      />
                      <span
                        className={clsx(
                          "text-[10.5px] font-bold uppercase tracking-[0.06em]",
                          jumpedTo === day.iso ? "text-primary opacity-100" : "text-secondary opacity-70",
                        )}
                      >
                        {day.label}
                      </span>
                      <span
                        className={clsx(
                          "h-px flex-1 bg-outline-variant",
                          jumpedTo === day.iso ? "opacity-90" : "opacity-55",
                        )}
                      />
                    </div>
                    <div className="flex flex-col gap-4">
                      {day.messages.map((m) => (
                        <MessageBubble key={m.id} message={m} mode={full ? "full" : "mini"} onDownload={download} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!atLatest && messages.length > 0 && (
            <button
              type="button"
              onClick={jumpLatest}
              className="absolute bottom-[116px] left-1/2 z-[3] inline-flex -translate-x-1/2 items-center gap-[7px] rounded-full border border-outline-variant bg-surface-lowest px-3.5 text-[12.5px] font-bold text-primary shadow-overlay"
              style={{ height: 32 }}
            >
              <ArrowDown size={15} strokeWidth={2} />
              <span>Jump to latest</span>
            </button>
          )}

          {/* Composer */}
          {canEdit ? (
            <div
              className={clsx(
                "flex flex-shrink-0 items-start gap-2.5 border-t border-outline-variant",
                full ? "pt-3 px-6 pb-3.5" : "pt-2.5 px-3 pb-3",
              )}
            >
              <button
                type="button"
                aria-label="Attach a document"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border-none bg-surface-container text-secondary"
              >
                <Paperclip size={16} strokeWidth={2} />
              </button>
              <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesPicked} />
              {/* With files staged the border moves from the textarea out to
                  this wrapper, so the chips and the text read as one input
                  rather than a bar stuck above one (design ChatRoom.jsx). */}
              <div
                className={clsx(
                  "flex min-w-0 flex-1 flex-col gap-2 bg-surface-lowest",
                  staged.length && "rounded-[14px] border border-outline p-2",
                )}
              >
                {staged.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {staged.map((file, i) => {
                      const Icon = STAGED_ICON[attachmentKind(file.type || null, file.name)];
                      return (
                        <li
                          key={`${file.name}:${file.lastModified}:${i}`}
                          className="inline-flex max-w-full items-center gap-[7px] rounded border border-outline-variant bg-surface-low py-[5px] pl-[9px] pr-1.5"
                        >
                          <Icon size={14} strokeWidth={1.9} className="flex-none text-primary" />
                          <span className="truncate text-[11.5px] font-semibold text-on-surface">{file.name}</span>
                          <span className="flex-none text-[10.5px] text-secondary">{formatBytes(file.size)}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${file.name}`}
                            onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
                            className="inline-flex flex-none rounded-[4px] border-none bg-transparent p-px text-secondary"
                          >
                            <X size={13} strokeWidth={2} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <textarea
                  ref={textareaRef}
                  rows={3}
                  value={draft}
                  placeholder={composerPlaceholder}
                  onChange={handleDraftChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  className={clsx(
                    "min-h-[76px] max-h-[160px] w-full resize-none bg-transparent text-[13.5px] leading-[18px] text-on-surface outline-none",
                    staged.length
                      ? "border-none px-1.5 py-0.5"
                      : "rounded-[14px] border border-outline px-3.5 py-[9px]",
                  )}
                />
              </div>
              <button
                type="button"
                aria-label="Send"
                disabled={(!draft.trim() && !staged.length) || sending}
                onClick={handleSend}
                className={clsx(
                  "flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border-none",
                  (draft.trim() || staged.length) && !sending
                    ? "cursor-pointer bg-primary text-white"
                    : "cursor-not-allowed bg-surface-container text-secondary",
                )}
              >
                <SendHorizontal size={16} strokeWidth={2} />
              </button>
            </div>
          ) : (
            /* View/Edit Gate Function */
            <div className="flex flex-shrink-0 items-center gap-2 border-t border-outline-variant px-5 py-3.5 text-[12.5px] text-secondary">
              <Eye size={14} strokeWidth={1.75} />
              <span>View access — you can read this room but not post.</span>
            </div>
          )}
        </div>

        {/* Shared documents aside */}
        <aside
          className={clsx(
            "absolute inset-y-0 right-0 z-[2] flex max-w-full flex-col border-l border-outline-variant bg-surface-lowest transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]",
            docsOpen ? "translate-x-0" : "translate-x-[101%]",
            full ? "w-full lg:w-80" : "w-full",
            docsOpen && !full && "shadow-[-18px_0_40px_-28px_rgba(15,15,15,0.45)]",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant py-[10px] pl-3.5 pr-2 pt-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
              Shared documents · {allDocs.length}
            </span>
            <button
              type="button"
              onClick={() => setDocsOpen(false)}
              className="flex h-[26px] items-center gap-1 rounded-full border-none bg-surface-container px-[9px] text-[11.5px] font-semibold text-secondary"
            >
              <X size={13} strokeWidth={2} />
              <span>Hide</span>
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 overflow-auto p-2.5">
            {allDocs.length === 0 ? (
              <p className="px-1 py-4 text-center text-[12px] text-secondary">No documents shared yet.</p>
            ) : (
              allDocs.map((d) => (
                <div key={d.key} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => jumpToDate(d.iso)}
                    className="self-start border-none bg-transparent p-0 text-[10px] font-bold uppercase tracking-[0.05em] text-secondary"
                  >
                    {d.dayLabel}
                  </button>
                  <AttachmentRow
                    attachment={{ id: d.key, name: d.name, kind: d.kind, size: d.size }}
                    meta={`${d.size} · shared by ${CR_BY[d.by]}`}
                    onClick={() => download({ id: d.key, name: d.name })}
                  />
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>,
    root,
  );
}
