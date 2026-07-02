"use client";

import { useRef, useState } from "react";
import { Upload, Check, File, FileText, Download } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/pc/Shared";
import type { Material, Model } from "@/lib/pc/types";

export function fmtBytes(b: number): string {
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${Math.round(b / 1e3)} KB`;
  return `${b} B`;
}

/* MaterialsTab — three states:
   - draft + no stored materials + no staged file → "No materials yet" empty zone
   - any state with a staged file → staged card with Confirm / Cancel
   - otherwise → "Upload new version" drop zone + stored files list

   Picking a file ONLY stages it locally. The POST /materials request is
   sent on explicit Confirm — no auto-upload, no side-effect on /publish
   or PATCH /models. */
export function MaterialsTab({
  m,
  materials,
  onUpload,
  onDownload,
}: {
  m: Model;
  materials: Material[];
  onUpload: (file: File) => Promise<boolean>;
  onDownload: (material: Material) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [staged, setStaged] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickFile = () => fileInputRef.current?.click();
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (f) setStaged(f);
  };
  const confirmUpload = async () => {
    if (!staged) return;
    setUploading(true);
    const ok = await onUpload(staged);
    setUploading(false);
    if (ok) setStaged(null);
  };

  const nextVer = materials.length + 1;

  // Staged file → confirmation card (matches design #3).
  const stagedCard = staged ? (
    <div className="rounded-md border border-outline-variant bg-surface-low p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-primary-fixed text-primary">
          <File size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-bold">{staged.name}</div>
          <div className="mt-0.5 text-[12px] text-secondary">
            {fmtBytes(staged.size)} · staged · saves as <b className="text-primary">v{nextVer}</b>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => setStaged(null)}
          disabled={uploading}
          className="flex-none px-3 py-[7px]"
        >
          Cancel
        </Button>
        <Button icon={Check} onClick={confirmUpload} disabled={uploading} className="flex-none">
          {uploading ? "Uploading…" : "Confirm"}
        </Button>
      </div>
    </div>
  ) : null;

  // Empty draft state (no stored materials and nothing staged).
  if (!staged && !materials.length && m.status === "draft") {
    return (
      <div className="flex flex-col items-center gap-2.5 rounded-md border-[1.5px] border-dashed border-outline px-[18px] py-7 text-center">
        <input ref={fileInputRef} type="file" className="hidden" onChange={onPick} />
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-fixed text-primary">
          <Upload size={22} strokeWidth={1.75} />
        </span>
        <div className="text-[15px] font-bold">No materials yet</div>
        <div className="max-w-[280px] text-[13px] text-secondary">
          Click to browse for a fact sheet or deck — it saves as <b>v1</b>.
        </div>
        <Button icon={Upload} className="mt-1" onClick={pickFile}>Upload v1</Button>
      </div>
    );
  }

  return (
    <>
      <input ref={fileInputRef} type="file" className="hidden" onChange={onPick} />
      {stagedCard ?? (
        <div
          onClick={pickFile}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-[1.5px] border-dashed border-outline px-4 py-5 text-center"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-primary-fixed text-primary">
            <Upload size={20} strokeWidth={1.75} />
          </span>
          <div className="text-[14px] font-bold">Upload new version</div>
          <div className="text-[12.5px] text-secondary">
            New file saves as <b>v{nextVer}</b> and logs a change.
          </div>
        </div>
      )}
      {materials.length > 0 && (
        <>
          <Eyebrow className="mb-2 mt-[18px]">Stored files</Eyebrow>
          <div>
            {materials.map((f, i) => (
              <div
                key={f.id ?? `${f.file}-${f.ver}`}
                className={`flex items-center gap-3 px-0.5 py-3 ${i ? "border-t border-outline-variant" : ""}`}
              >
                <span
                  className={`flex h-8 w-8 flex-none items-center justify-center rounded ${
                    i === 0 ? "bg-primary-fixed text-primary" : "bg-surface-container text-secondary"
                  }`}
                >
                  <FileText size={16} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[7px] text-[13.5px] font-bold">
                    {f.file}
                    {i === 0 && (
                      <span className="rounded-[6px] bg-primary-fixed px-[7px] py-0.5 text-[11px] font-bold text-primary">latest</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12px] text-secondary">{f.ver} · {f.date} · {f.size}</div>
                </div>
                <Button
                  variant="secondary"
                  icon={Download}
                  className="flex-none px-3 py-[7px]"
                  onClick={() => onDownload(f)}
                >
                  Download
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
