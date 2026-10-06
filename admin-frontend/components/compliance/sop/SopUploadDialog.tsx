"use client";

import { useRef, useState } from "react";
import { Upload } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/pc/Shared";
import { FormatBadgeBig } from "./FormatBadge";
import { SOP_ROLE_LABELS } from "./roles";
import { fmtSize } from "@/components/compliance/ic-notes/format";
import { SOP_ACCEPT, SOP_CATEGORIES, SOP_FORMATS, extOf, type SopCategory, type SopDocumentDTO } from "@/lib/sop/types";

const LABEL = "text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary";
const INPUT = "w-full rounded border border-outline-variant bg-surface-lowest px-3 text-[14px] text-on-surface outline-none";

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

/** New SOP when `target` is absent, else a new version of `target`. */
export function SopUploadDialog({
  target, defaultCategory, onClose, onSubmit, uploaderName, uploaderRole,
}: {
  target?: SopDocumentDTO;
  defaultCategory: SopCategory;
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
  uploaderName: string;
  uploaderRole: string;
}) {
  const isVersion = !!target;
  const nextV = target ? target.latest.version_no + 1 : 1;
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<SopCategory>(defaultCategory);
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File) => {
    if (!(extOf(f.name) in SOP_FORMATS)) {
      setError("Unsupported file type. Use PDF, Word, PowerPoint, Excel, TXT/MD or PNG/JPG.");
      return;
    }
    setError(null);
    setFile(f);
    if (!isVersion && !title.trim()) setTitle(titleFromFilename(f.name));
  };

  const handleSubmit = async () => {
    if (!file) return setError("Choose a file to upload.");
    if (!isVersion && !title.trim()) return setError("Enter a title.");
    if (isVersion && !note.trim()) return setError("Describe what changed in this version.");
    setError(null);
    setSubmitting(true);
    const fd = new FormData();
    fd.append("file", file);
    if (!isVersion) {
      fd.append("title", title.trim());
      fd.append("category", category);
    }
    fd.append("change_note", note.trim() || "Initial release.");
    // A rejected server action (e.g. body over the size limit) throws rather than
    // returning {success:false}; without the catch the dialog sticks on "Uploading…".
    const result = await onSubmit(fd).catch(() => ({ success: false, error: "Upload failed. Please try again." }));
    setSubmitting(false);
    if (!result.success) setError(result.error ?? "Upload failed.");
    else onClose();
  };

  return (
    <Modal
      title={isVersion ? "Upload New Version" : "Upload SOP"}
      subtitle={isVersion ? `${target.title} · will become v${nextV}` : undefined}
      onClose={onClose}
      width={520}
      centered
      footer={
        <div className="flex w-full justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Upload} onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Uploading…" : isVersion ? `Upload v${nextV}` : "Upload"}
          </Button>
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
          className={`flex cursor-pointer gap-3 rounded-lg border border-dashed text-center transition-all duration-150 ${dragging ? "border-primary bg-[#fff3e8]" : "border-outline bg-surface-low"} ${file ? "flex-row items-center justify-start p-4" : "flex-col items-center justify-center px-4 py-7"}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={SOP_ACCEPT}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickFile(f);
              e.target.value = "";
            }}
          />
          {file ? (
            <>
              <FormatBadgeBig filename={file.name} />
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-[14px] font-semibold text-on-surface">{file.name}</div>
                <div className="text-[13px] text-secondary">{fmtSize(file.size)} · Click to replace</div>
              </div>
            </>
          ) : (
            <>
              <Upload size={22} strokeWidth={2} className="text-primary" />
              <div className="text-[14px] text-on-surface"><strong>Click to choose</strong> or drag a file here</div>
              <div className="text-[13px] text-secondary">PDF, DOCX, PPTX, XLSX, TXT, MD, PNG or JPG</div>
            </>
          )}
        </div>

        {!isVersion && (
          <>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={LABEL}>Title</span>
              <input type="text" value={title} placeholder="SOP title" onChange={(e) => setTitle(e.target.value)} className={`${INPUT} h-10`} />
            </label>
            <div className="flex flex-col gap-2">
              <span className={LABEL}>Class</span>
              <div className="flex flex-wrap gap-2">
                {SOP_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={category === c.key}
                    onClick={() => setCategory(c.key)}
                    className={`h-[34px] cursor-pointer rounded-full px-4 text-[13px] font-semibold transition-all duration-150 ${category === c.key ? "bg-primary text-white" : "bg-surface-container text-on-surface"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={LABEL}>{isVersion ? "Change note" : "Note (optional)"}</span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isVersion ? "What changed in this version…" : "Initial release."}
            className={`${INPUT} resize-y py-2.5`}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Uploaded by</span>
          <div className="text-[14px] text-on-surface">
            <strong>{uploaderName}</strong> <span className="text-secondary">· {SOP_ROLE_LABELS[uploaderRole] ?? uploaderRole}</span>
          </div>
        </div>

        {error && <div className="text-[13px] text-error">{error}</div>}
      </div>
    </Modal>
  );
}
