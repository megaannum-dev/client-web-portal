"use client";

import { useRef, useState } from "react";
import { Upload } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/pc/Shared";
import { FormatBadgeBig } from "./FormatBadge";
import { fmtSize, fmtTime, hkDayKey, HK_OFFSET } from "./format";
import { ROLE_LABELS } from "./Uploader";
import type { IcNoteRole } from "@/lib/ic-notes/types";

const ACCEPT_EXT = [".pdf", ".docx", ".md"];

function isAccepted(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPT_EXT.some((ext) => lower.endsWith(ext));
}

function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return base.replace(/[_-]+/g, " ").trim();
}

function nowDateTime(): { date: string; time: string } {
  const now = new Date().toISOString();
  return { date: hkDayKey(now), time: fmtTime(now) };
}

export function UploadDialog({
  onClose, onSubmit, uploaderName, uploaderRole,
}: {
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
  uploaderName: string;
  uploaderRole: IcNoteRole;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [{ date, time }, setDateTime] = useState(nowDateTime);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File) => {
    if (!isAccepted(f.name)) {
      setError("Only .pdf, .docx and .md files are supported.");
      return;
    }
    setError(null);
    setFile(f);
    if (!title.trim()) setTitle(titleFromFilename(f.name));
  };

  const handleSubmit = async () => {
    if (!file) return setError("Choose a file to upload.");
    if (!title.trim()) return setError("Enter a title.");
    setError(null);
    setSubmitting(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title.trim());
    fd.append("meeting_at", `${date}T${time}:00${HK_OFFSET}`);
    const result = await onSubmit(fd);
    setSubmitting(false);
    if (!result.success) setError(result.error ?? "Upload failed.");
    else onClose();
  };

  return (
    <Modal
      title="Upload Meeting Notes"
      onClose={onClose}
      width={520}
      centered
      footer={
        <div className="flex w-full justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Upload} onClick={handleSubmit} disabled={submitting}>Upload</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) pickFile(f);
          }}
          className="cursor-pointer rounded-md border-2 border-dashed px-5 py-8 text-center transition-colors"
          style={{
            borderColor: dragging ? "var(--primary)" : "var(--outline-variant)",
            background: dragging ? "#fff3e8" : "transparent",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.md"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickFile(f);
              e.target.value = "";
            }}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FormatBadgeBig filename={file.name} />
              <div className="min-w-0 text-left">
                <div className="truncate text-[14px] font-semibold text-on-surface">{file.name}</div>
                <div className="text-[12.5px] text-secondary">{fmtSize(file.size)} · Click to replace</div>
              </div>
            </div>
          ) : (
            <>
              <Upload size={22} strokeWidth={1.75} className="mx-auto text-secondary" />
              <div className="mt-2.5 text-[13.5px] text-on-surface">
                <b>Click to choose</b> or drag a file here
              </div>
              <div className="mt-1 text-[12.5px] text-secondary">PDF, DOCX or MD</div>
            </>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[12.5px] font-semibold text-secondary">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-outline-variant px-3 py-2 text-[14px] text-on-surface"
          />
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className="mb-1.5 block text-[12.5px] font-semibold text-secondary">Meeting date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDateTime((s) => ({ ...s, date: e.target.value }))}
              className="w-full rounded border border-outline-variant px-3 py-2 text-[14px] text-on-surface"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12.5px] font-semibold text-secondary">Meeting time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setDateTime((s) => ({ ...s, time: e.target.value }))}
              className="w-full rounded border border-outline-variant px-3 py-2 text-[14px] text-on-surface"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[12.5px] font-semibold text-secondary">Uploaded by</label>
          <div className="rounded border border-outline-variant bg-surface-container px-3 py-2 text-[14px] text-on-surface">
            <b>{uploaderName}</b> · {ROLE_LABELS[uploaderRole] ?? uploaderRole}
          </div>
        </div>

        {error && <div className="text-[13px] text-error">{error}</div>}
      </div>
    </Modal>
  );
}
