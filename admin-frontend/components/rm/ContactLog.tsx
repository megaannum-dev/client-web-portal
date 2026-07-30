"use client";

/* ============================================================
   RM — Contact Log card (Client Detail screen).
   Ported from the design handoff prototype (ClientDetail.jsx's
   ContactLogItem/ContactLogModal/ClLogBody, ~L71-280) -- inline-expand
   read view only (the prototype's floating-overlay detail modal is an
   unused dev-tweak variant and is intentionally not built here).
   Pure local state: entries are seeded from the mock contactLog prop,
   "New log" just prepends to local state -- no persistence, no API call.
   ============================================================ */

import { useState, type ChangeEvent } from "react";
import clsx from "clsx";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/rm/Shared";
import { useCanEdit } from "@/hooks/usePageAccess";
import {
  Plus, ChevronRight, Paperclip, FileText, Phone, Video, Users, Mail, MessageCircle, Check, X,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import type { ContactLogEntry } from "@/lib/mock/rm-data";

const CHANNELS: { value: string; icon: string }[] = [
  { value: "Phone call", icon: "phone" },
  { value: "Video call", icon: "video" },
  { value: "In-person meeting", icon: "users" },
  { value: "Email", icon: "mail" },
  { value: "Instant message", icon: "message-circle" },
];

const CHANNEL_ICON: Record<string, LucideIcon> = {
  phone: Phone, video: Video, users: Users, mail: Mail, "message-circle": MessageCircle,
};

function channelIcon(item: Pick<ContactLogEntry, "icon" | "channel">): LucideIcon {
  const key = item.icon || CHANNELS.find((c) => c.value === item.channel)?.icon || "phone";
  return CHANNEL_ICON[key] ?? Phone;
}

const fieldBase =
  "w-full rounded border border-outline-variant bg-white px-3 text-[14px] font-semibold text-on-surface outline-none placeholder:font-normal placeholder:text-secondary focus:border-primary";

function ContactLogRow({ item, last }: { item: ContactLogEntry; last: boolean }) {
  const [open, setOpen] = useState(!!item.accent);
  const Icon = channelIcon(item);
  return (
    <div className="relative" style={{ paddingBottom: last ? 2 : 16 }}>
      <span
        className="absolute -left-[21px] top-[4px] h-[11px] w-[11px] rounded-full border-2"
        style={{
          background: item.accent ? "rgb(var(--color-primary))" : "rgb(var(--color-surface-lowest))",
          borderColor: item.accent ? "rgb(var(--color-primary))" : "rgb(var(--color-outline))",
        }}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-start gap-2.5 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[14.5px] font-semibold leading-[1.35] text-on-surface">{item.topic}</span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-[3px] text-[11.5px] font-semibold text-secondary">
              <Icon size={12} strokeWidth={2} /> {item.channel}
            </span>
            <span className="text-[12px] text-secondary">{item.when}</span>
            {item.doc && <Paperclip size={13} strokeWidth={2} className="text-secondary" />}
          </span>
        </span>
        <ChevronRight
          size={14}
          strokeWidth={2}
          className="mt-1 shrink-0 text-secondary transition-transform duration-150"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        />
      </button>
      {open && (
        <div className="mt-2.5 flex flex-col gap-3 rounded-md bg-surface-low px-4 py-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">Description</span>
            <div className="flex flex-col gap-2 text-[13px] leading-[1.5] text-on-surface">
              {[item.desc, item.interest, item.complaint, item.followUp].filter(Boolean).map((p, i) => (
                <span key={i}>{p}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">Relevant document</span>
            {item.doc ? (
              <span className="mt-0.5 inline-flex w-fit items-center gap-2 rounded-md border border-outline-variant bg-surface-lowest px-2.5 py-1.5">
                <FileText size={15} strokeWidth={1.75} className="text-primary" />
                <span className="text-[13px] font-semibold text-on-surface">{item.doc.name}</span>
                <span className="text-[11.5px] text-secondary">{item.doc.size}</span>
              </span>
            ) : (
              <span className="text-[13px] text-secondary">None attached</span>
            )}
          </div>
          <span className="text-[11.5px] text-secondary">Logged by {item.by || "Dana Okafor"}</span>
        </div>
      )}
    </div>
  );
}

function NewContactLogModal({
  clientName, onClose, onSave,
}: {
  clientName: string;
  onClose: () => void;
  onSave: (entry: ContactLogEntry) => void;
}) {
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [channel, setChannel] = useState(CHANNELS[0].value);
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<{ name: string; size: string } | null>(null);
  const canEdit = useCanEdit("rm.client-info");

  const valid = !!(topic.trim() && date && desc.trim());

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile({ name: f.name, size: `${Math.max(1, Math.round(f.size / 1024))} KB` });
    e.target.value = "";
  };

  const save = () => {
    const dt = date ? new Date(`${date}T${time || "00:00"}`) : null;
    const when = dt
      ? `${dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}${time ? ` · ${time}` : ""}`
      : "—";
    const icon = CHANNELS.find((c) => c.value === channel)?.icon ?? "phone";
    onSave({ topic: topic.trim(), when, channel, icon, desc: desc.trim(), doc: file, accent: true });
  };

  return (
    <Modal
      title="New Contact Log"
      subtitle={clientName}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="mr-auto">Cancel</Button>
          {/* View/Edit Gate Function */}
          {canEdit && <Button icon={Check} disabled={!valid} onClick={() => valid && save()}>Save log</Button>}
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
            Topic<span className="text-primary"> *</span>
          </span>
          <input
            className={clsx(fieldBase, "h-10")}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Q2 portfolio review call"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
            Date<span className="text-primary"> *</span>
          </span>
          <input className={clsx(fieldBase, "h-10")} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
            Time<span className="text-primary"> *</span>
          </span>
          <input className={clsx(fieldBase, "h-10")} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
            Communication Channel<span className="text-primary"> *</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => {
              const Icon = CHANNEL_ICON[c.icon];
              const on = channel === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setChannel(c.value)}
                  className={clsx(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors duration-150",
                    on ? "border-primary bg-primary text-white" : "border-outline-variant bg-white text-secondary hover:bg-surface-container",
                  )}
                >
                  <Icon size={14} strokeWidth={2} /> {c.value}
                </button>
              );
            })}
          </div>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
            Description<span className="text-primary"> *</span>
          </span>
          <textarea
            className={clsx(fieldBase, "min-h-[108px] resize-y py-2.5")}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Summary of the conversation, investment interests expressed, follow-up requirements, complaints or special requests…"
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Relevant Document</span>
          {file ? (
            <div className="flex items-center gap-2.5 rounded-md border border-outline-variant bg-surface-low px-3 py-2.5">
              <FileText size={16} strokeWidth={1.75} className="shrink-0 text-primary" />
              <span className="flex-1 truncate text-[13px] font-semibold text-on-surface">{file.name}</span>
              <span className="text-[11.5px] text-secondary">{file.size}</span>
              {/* View/Edit Gate Function */}
              {canEdit && (
                <button type="button" onClick={() => setFile(null)} className="shrink-0 cursor-pointer p-0.5 text-secondary">
                  <X size={15} strokeWidth={2} />
                </button>
              )}
            </div>
          ) : (
            /* View/Edit Gate Function */
            canEdit && (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-outline bg-surface-low px-3 py-4 text-[13px] font-semibold text-secondary">
                <Paperclip size={15} strokeWidth={2} />
                Attach a document — meeting notes, statement, signed instruction
                <input type="file" className="hidden" onChange={onFile} />
              </label>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}

export function ContactLogCard({ clientName, entries }: { clientName: string; entries: ContactLogEntry[] }) {
  const [logs, setLogs] = useState<ContactLogEntry[]>(entries);
  const [modalOpen, setModalOpen] = useState(false);
  const canEdit = useCanEdit("rm.client-info");

  const addLog = (entry: ContactLogEntry) => {
    setLogs((prev) => [entry, ...prev.map((p) => ({ ...p, accent: false }))]);
    setModalOpen(false);
  };

  return (
    <Card
      title="Contact Log"
      action={
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-secondary">{logs.length} logs</span>
          {/* View/Edit Gate Function */}
          {canEdit && <Button icon={Plus} onClick={() => setModalOpen(true)}>New log</Button>}
        </div>
      }
    >
      {logs.length === 0 ? (
        <p className="py-1.5 text-[14px] text-secondary">No contact log entries yet.</p>
      ) : (
        <div className="relative h-[440px] overflow-y-auto pl-[22px] pr-1.5">
          <div className="absolute left-[5px] top-1 bottom-1 w-0.5 bg-outline-variant" />
          {logs.map((item, i) => (
            <ContactLogRow key={i} item={item} last={i === logs.length - 1} />
          ))}
        </div>
      )}
      {modalOpen && (
        <NewContactLogModal clientName={clientName} onClose={() => setModalOpen(false)} onSave={addLog} />
      )}
    </Card>
  );
}
