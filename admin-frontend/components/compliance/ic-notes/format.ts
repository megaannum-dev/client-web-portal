// Small formatters shared by NoteCard/NoteTable/UploadDialog — no lib elsewhere
// already does date/time-split + human file size, so kept local (ponytail: three
// one-liners, not worth a shared lib module).

/** "22 Sep 2026" */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** "09:00" (local) */
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "1.2 MB" / "48 KB" */
export function fmtSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}
