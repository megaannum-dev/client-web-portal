"use client";

// IC Meeting Notes — compliance-owned library of Investment Committee minutes,
// shared read-only across roles; upload is gated on the compliance.ic-notes
// EDIT grant (see docs/proposals for the ic-notes-frontend units).

import { useEffect, useMemo, useState } from "react";
import IcNotesSkeleton from "./Skeleton";
import { LayoutGrid, List, Upload } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateControl } from "@/components/ui/DateControl";
import { NoteCard } from "@/components/compliance/ic-notes/NoteCard";
import { NoteTable } from "@/components/compliance/ic-notes/NoteTable";
import { UploadDialog } from "@/components/compliance/ic-notes/UploadDialog";
import { ROLE_LABELS } from "@/components/compliance/ic-notes/Uploader";
import { hkDayKey } from "@/components/compliance/ic-notes/format";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCanEdit } from "@/hooks/usePageAccess";
import { useIcNotes } from "@/hooks/api/useIcNotes";
import { uploadIcNoteAction, downloadIcNoteAction } from "./actions";
import { extOf, type IcNoteFormat } from "@/lib/ic-notes/types";
import { saveBase64File } from "@/lib/download";

type ViewMode = "cards" | "table";
const VIEW_KEY = "ic-notes-view";

function loadView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}
function saveView(v: ViewMode) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* ponytail: best-effort persistence, view just resets to cards next load */
  }
}

type DateFilter = { from: string; to: string } | null;

function dateLabel(filter: DateFilter): string {
  if (!filter) return "All dates";
  const fmt = (k: string) => new Date(`${k}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return filter.from === filter.to ? fmt(filter.from) : `${fmt(filter.from)} – ${fmt(filter.to)}`;
}

export default function IcMeetingNotesPage() {
  const { portalUser } = useAuth();
  const canEdit = useCanEdit("compliance.ic-notes");
  const { notes, loading, error, refetch } = useIcNotes();

  const [view, setView] = useState<ViewMode>("cards");
  useEffect(() => setView(loadView()), []);
  const changeView = (v: ViewMode) => { setView(v); saveView(v); };

  const [search, setSearch] = useState("");
  const [format, setFormat] = useState<"all" | IcNoteFormat>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const markedDates = useMemo(() => new Set((notes ?? []).map((n) => hkDayKey(n.meeting_at))), [notes]);

  const filtered = useMemo(() => {
    const all = notes ?? [];
    const q = search.trim().toLowerCase();
    return all
      .filter((n) => {
        if (format !== "all" && extOf(n.filename) !== format) return false;
        if (dateFilter) {
          const k = hkDayKey(n.meeting_at);
          if (k < dateFilter.from || k > dateFilter.to) return false;
        }
        if (q) {
          const roleLabel = (ROLE_LABELS[n.uploaded_by_role] ?? n.uploaded_by_role).toLowerCase();
          const hay = `${n.title} ${n.uploaded_by_name} ${roleLabel}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.meeting_at.localeCompare(a.meeting_at));
  }, [notes, search, format, dateFilter]);

  const doDownload = (id: string) => {
    void downloadIcNoteAction(id).then((r) => {
      if (!r.success) return alert(`Download failed: ${r.error}`);
      const note = (notes ?? []).find((n) => n.id === id);
      saveBase64File(note?.filename ?? "note", r.data.contentType, r.data.base64);
    });
  };

  const doUpload = async (formData: FormData) => {
    const r = await uploadIcNoteAction(formData);
    if (r.success) refetch();
    return r.success ? { success: true } : { success: false, error: r.error };
  };

  if (loading) return <IcNotesSkeleton />;

  return (
    <div className="mx-auto">
      <PageHeader
        title="IC Meeting Notes"
        subtitle="Investment Committee minutes and notes, shared across roles."
        actions={canEdit && <Button icon={Upload} onClick={() => setUploadOpen(true)}>Upload Notes</Button>}
      />

      {error ? (
        <div className="mt-6 rounded-md border border-outline-variant bg-surface-lowest px-4 py-3 text-[13.5px] text-error">
          {error}
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex w-[260px] items-center gap-[7px] rounded-full border border-outline-variant bg-surface-lowest px-3 py-[7px]">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or uploader…"
                className="w-full min-w-0 bg-transparent text-[13px] outline-none"
              />
            </div>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "all" | IcNoteFormat)}
              className="rounded border border-outline-variant bg-surface-lowest px-3 py-2 text-[13px] text-on-surface"
            >
              <option value="all">All formats</option>
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="md">MD</option>
            </select>
            <DateControl
              dateLabel={dateLabel(dateFilter)}
              markedDates={markedDates}
              markedLabel="Has notes"
              disableWeekends={false}
              onPickDate={(d) => setDateFilter({ from: d, to: d })}
              onPickRange={(from, to) => setDateFilter({ from, to })}
              onClear={() => setDateFilter(null)}
            />
            <span className="text-[13px] text-secondary">{filtered.length} of {(notes ?? []).length}</span>
            <span className="ml-auto inline-flex gap-0.5 rounded-full border border-outline-variant p-[3px]">
              <button
                type="button"
                onClick={() => changeView("cards")}
                aria-label="Card view"
                className={`flex h-7 w-7 items-center justify-center rounded-full ${view === "cards" ? "bg-primary-fixed text-primary" : "text-secondary"}`}
              >
                <LayoutGrid size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => changeView("table")}
                aria-label="Table view"
                className={`flex h-7 w-7 items-center justify-center rounded-full ${view === "table" ? "bg-primary-fixed text-primary" : "text-secondary"}`}
              >
                <List size={14} strokeWidth={2} />
              </button>
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="mt-6 rounded-md border border-outline-variant px-4 py-8 text-center text-[13.5px] text-secondary">
              No meeting notes match your filters.
            </div>
          ) : view === "cards" ? (
            <div className="mt-5 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {filtered.map((note) => (
                <NoteCard key={note.id} note={note} onDownload={doDownload} />
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <NoteTable notes={filtered} onDownload={doDownload} />
            </div>
          )}
        </>
      )}

      {canEdit && uploadOpen && portalUser && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onSubmit={doUpload}
          uploaderName={portalUser.name ?? portalUser.email ?? "Unknown"}
          uploaderRole={portalUser.role}
        />
      )}
    </div>
  );
}
