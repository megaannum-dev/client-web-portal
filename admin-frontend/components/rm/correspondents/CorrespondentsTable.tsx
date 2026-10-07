"use client";

import clsx from "clsx";
import { ArrowDown, ChevronUp, Download, File, MessageSquare, SearchX } from "@/lib/icons";
import { Checkbox, Td, Th } from "@/components/admin/Shared";
import { AsyncIconButton } from "@/components/ui/AsyncIconButton";
import { RoomAvatar } from "@/components/rm/chat/MessageBubble";
import { formatBytes } from "@/lib/chat/adapter";
import type { ChatDocumentDTO } from "@/lib/api/chat";
import { fmtShared } from "./toQuery";

const ROLE_LABEL = { client: "Client", rm: "Relationship Manager", assistant: "Assistant RM" } as const;

type Tile = { label: string; cls: string };
const TILES: Record<string, Tile> = {
  pdf: { label: "PDF", cls: "bg-[#fdecea] text-[#c5221f]" },
  doc: { label: "DOC", cls: "bg-[#e8f0fe] text-[#1a56c4]" },
  xls: { label: "XLS", cls: "bg-[#e6f4ea] text-[#1e7a3c]" },
  img: { label: "IMG", cls: "bg-[#f3e8fd] text-[#8430ce]" },
  zip: { label: "ZIP", cls: "bg-[#fef3e0] text-[#b06000]" },
};

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

export function CorrespondentsTable({
  docs, selected, onToggle, onToggleAll, sort, onSort, meUid, onDownload, onShow, filtered,
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
  filtered: boolean;
}) {
  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <SearchX size={28} strokeWidth={1.75} className="text-secondary" />
        <div className="text-[15px] font-semibold text-on-surface">No documents found</div>
        <div className="text-[13px] text-secondary">
          {filtered ? "Try adjusting your filters or search." : "Documents shared in your client chats will appear here."}
        </div>
      </div>
    );
  }
  const allOn = docs.every((d) => selected.has(d.id));
  const SortIcon = sort === "desc" ? ArrowDown : ChevronUp;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="bg-surface-low">
          <tr>
            <Th className="w-10"><Checkbox on={allOn} onChange={onToggleAll}>{null}</Checkbox></Th>
            <Th>Name</Th>
            <Th>
              <button type="button" onClick={onSort} className="inline-flex items-center gap-1 font-bold uppercase tracking-[0.05em]">
                Date shared <SortIcon size={12} strokeWidth={2.5} />
              </button>
            </Th>
            <Th>Shared by</Th>
            <Th>Group Chat</Th>
            <Th className="w-24">{null}</Th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const tile = tileFor(d.content_type, d.filename);
            const on = selected.has(d.id);
            return (
              <tr key={d.id} className={clsx("group transition-colors hover:bg-surface-low", on && "bg-primary/5")}>
                <Td className="w-10"><Checkbox on={on} onChange={() => onToggle(d.id)}>{null}</Checkbox></Td>
                <Td>
                  <div className="flex items-center gap-3">
                    <span className={clsx("flex h-[38px] w-[38px] flex-none items-center justify-center rounded-md text-[10px] font-bold", tile?.cls ?? "bg-surface-container text-secondary")}>
                      {tile ? tile.label : <File size={18} strokeWidth={2} />}
                    </span>
                    <div className="min-w-0">
                      <div className="max-w-[320px] truncate font-semibold">{d.filename}</div>
                      <div className="text-[12px] text-secondary">{formatBytes(d.size_bytes)}</div>
                    </div>
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-secondary">{fmtShared(d.created_at)}</Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <RoomAvatar name={d.sender_name} role={d.sender_role} size={30} />
                    <div>
                      <div className="font-medium">{d.sender_uid === meUid ? "You" : d.sender_name}</div>
                      <div className="text-[12px] text-secondary">{ROLE_LABEL[d.sender_role]}</div>
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <span className="flex">
                      <RoomAvatar name={d.client_name} role="client" size={26} ring />
                      <RoomAvatar name={d.rm_name} role="rm" size={26} ring className="-ml-2" />
                      {d.arm_name && <RoomAvatar name={d.arm_name} role="assistant" size={26} ring className="-ml-2" />}
                    </span>
                    <span className="text-[13px]">{d.client_name} · Client Room</span>
                  </div>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <AsyncIconButton icon={Download} title="Download" onClick={() => onDownload(d)} />
                    <AsyncIconButton icon={MessageSquare} title="Show in group chat" onClick={() => onShow(d)} />
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
