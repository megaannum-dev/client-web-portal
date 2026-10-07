"use client";

import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDown, ArrowUp, Download, File, FileArchive, FileImage, FilePenLine, FileSpreadsheet, FileText,
  FolderSearch, MessagesSquare,
} from "@/lib/icons";
import { AsyncIconButton } from "@/components/ui/AsyncIconButton";
import { formatBytes } from "@/lib/chat/adapter";
import type { ChatDocumentDTO } from "@/lib/api/chat";
import { CcCheck } from "./CcCheck";
import { fmtShared } from "./toQuery";

const ROLE_LABEL = { client: "Client", rm: "Relationship Manager", assistant: "Assistant RM" } as const;

// Prototype CC_TYPE / CC_AV_TONES (exact hex).
type Tile = { label: string; icon: LucideIcon; cls: string };
const TILES: Record<string, Tile> = {
  pdf: { label: "PDF", icon: FileText, cls: "bg-[#fdecea] text-[#b3261e]" },
  doc: { label: "Word", icon: FilePenLine, cls: "bg-[#e8eefb] text-[#2f5bb7]" },
  xls: { label: "Excel", icon: FileSpreadsheet, cls: "bg-[#e3f1e7] text-[#2f7a47]" },
  img: { label: "Image", icon: FileImage, cls: "bg-[#f3ebfa] text-[#7a3fb0]" },
  zip: { label: "Archive", icon: FileArchive, cls: "bg-[#eef2f7] text-[#585f6c]" },
};
const AV_TONE = {
  client: "bg-[linear-gradient(135deg,#ffd9b0,#f6b878)]",
  rm: "bg-primary",
  assistant: "bg-[#5c6d63]",
} as const;

/** content_type, falling back to the extension, -> one of the prototype's tiles (or null = generic). */
export function tileFor(contentType: string | null, filename: string): Tile | null {
  const mime = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
  if (mime === "application/pdf" || ext === "pdf") return TILES.pdf;
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return TILES.img;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv" || ["xls", "xlsx", "csv", "ods"].includes(ext)) return TILES.xls;
  if (mime.includes("word") || mime.includes("opendocument.text") || ["doc", "docx", "odt", "rtf", "txt"].includes(ext)) return TILES.doc;
  if (mime.includes("zip") || mime.includes("compressed") || ["zip", "rar", "7z", "tar", "gz"].includes(ext)) return TILES.zip;
  return null;
}

function initialsOf(name: string | null): string {
  return (name ?? "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const TH = "whitespace-nowrap bg-surface-low px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";
const TD = "border-t border-outline-variant px-4 py-3 align-middle";

export function CorrespondentsTable({
  docs, selected, onToggle, onToggleAll, sort, onSort, meUid, onDownload, onShow,
}: {
  docs: ChatDocumentDTO[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  sort: "asc" | "desc";
  onSort: () => void;
  meUid: string | null;
  onDownload: (d: ChatDocumentDTO) => Promise<unknown>;
  onShow: (d: ChatDocumentDTO) => void;
}) {
  const allOn = docs.length > 0 && docs.every((d) => selected.has(d.id));
  const anySel = selected.size > 0;
  const SortIcon = sort === "desc" ? ArrowDown : ArrowUp;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr>
            <th className={clsx(TH, "w-5")}><CcCheck on={allOn} onChange={onToggleAll} label="Select all" /></th>
            <th className={clsx(TH, "w-7")}><File size={15} strokeWidth={2} aria-label="Type" /></th>
            <th className={TH}>Name</th>
            <th className={TH}>
              <button type="button" onClick={onSort} className="inline-flex items-center gap-1 font-bold uppercase tracking-[0.05em] text-on-surface">
                Date shared <SortIcon size={13} strokeWidth={2.5} />
              </button>
            </th>
            <th className={TH}>Shared by</th>
            <th className={TH}>Group Chat</th>
            <th className={clsx(TH, "w-24")} />
          </tr>
        </thead>
        <tbody>
          {docs.length === 0 && (
            <tr>
              <td colSpan={7} className={clsx(TD, "px-4 py-12 text-center text-secondary")}>
                <FolderSearch size={28} strokeWidth={1.75} className="mx-auto mb-2" />
                No documents match these filters.
              </td>
            </tr>
          )}
          {docs.map((d) => {
            const tile = tileFor(d.content_type, d.filename);
            const TileIcon = tile?.icon ?? File;
            const on = selected.has(d.id);
            const me = d.sender_uid === meUid;
            const avatars: [string | null, keyof typeof AV_TONE][] = [[d.client_name, "client"], [d.rm_name, "rm"]];
            if (d.arm_name) avatars.push([d.arm_name, "assistant"]);
            return (
              <tr key={d.id} className={clsx("group cursor-pointer transition-colors", on ? "bg-primary/5" : "hover:bg-surface-low")}>
                <td className={TD}>
                  <CcCheck on={on} onChange={() => onToggle(d.id)} label={`Select ${d.filename}`}
                    className={anySel || on ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"} />
                </td>
                <td className={TD}>
                  <span title={tile?.label ?? "File"}
                    className={clsx("flex h-8 w-8 items-center justify-center rounded", tile?.cls ?? "bg-surface-container text-secondary")}>
                    <TileIcon size={16} strokeWidth={2} />
                  </span>
                </td>
                <td className={clsx(TD, "max-w-[380px]")}>
                  <div className="truncate font-semibold text-on-surface">{d.filename}</div>
                  <div className="mt-px text-xs text-secondary">{formatBytes(d.size_bytes)}</div>
                </td>
                <td className={clsx(TD, "whitespace-nowrap tabular-nums text-secondary")}>{fmtShared(d.created_at)}</td>
                <td className={TD}>
                  <div className="flex items-center gap-2.5">
                    <span className={clsx(
                      "flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold",
                      me ? "bg-primary-fixed text-primary" : "bg-surface-container text-secondary",
                    )}>
                      {initialsOf(d.sender_name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-on-surface">{me ? "You" : d.sender_name ?? d.sender_uid}</div>
                      <div className="text-xs text-secondary">{ROLE_LABEL[d.sender_role]}</div>
                    </div>
                  </div>
                </td>
                <td className={clsx(TD, "max-w-[260px]")}>
                  <div className="flex items-center gap-2.5">
                    <span className="flex flex-none">
                      {avatars.map(([name, tone], i) => (
                        <span
                          key={tone}
                          title={name ?? undefined}
                          style={{ zIndex: 3 - i }}
                          className={clsx(
                            "relative inline-flex h-[26px] w-[26px] items-center justify-center rounded-full text-[10.5px] font-bold text-white shadow-[0_0_0_2px_#fff]",
                            AV_TONE[tone], i > 0 && "-ml-2",
                          )}
                        >
                          {initialsOf(name)}
                        </span>
                      ))}
                    </span>
                    <span className="min-w-0 truncate font-semibold text-on-surface">{d.client_name} · Client Room</span>
                  </div>
                </td>
                <td className={TD}>
                  <div className="inline-flex gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <AsyncIconButton round icon={Download} title="Download" onClick={() => onDownload(d)} />
                    <AsyncIconButton round icon={MessagesSquare} title="Show in group chat" onClick={() => onShow(d)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
