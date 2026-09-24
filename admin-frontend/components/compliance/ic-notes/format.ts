// Small formatters shared by NoteCard/NoteTable/UploadDialog — no lib elsewhere
// already does date/time-split + human file size, so kept local (ponytail: three
// one-liners, not worth a shared lib module).

// Meeting times are HK time regardless of the browser's timezone.
// ponytail: HK has no DST, so a fixed +08:00 offset is exact.
const TZ = "Asia/Hong_Kong";
export const HK_OFFSET = "+08:00";

/** "22 Sep 2026" (HK) */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
}

/** "09:00" (HK) */
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

/** HK calendar day as YYYY-MM-DD (DateControl's day-key convention). */
export function hkDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }); // en-CA = YYYY-MM-DD
}

/** "1.2 MB" / "48 KB" */
export function fmtSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}
