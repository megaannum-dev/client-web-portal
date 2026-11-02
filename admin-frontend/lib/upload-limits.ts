// Must stay in sync with the backend's *_MAX_UPLOAD_BYTES defaults (sop, ic_notes and
// onboarding services). Checked here so an oversized file never leaves the browser;
// the backend still enforces the same limits.
const MiB = 1024 * 1024;
export const SOP_MAX_BYTES = 50 * MiB;
export const IC_NOTES_MAX_BYTES = 25 * MiB;
export const KYC_MAX_BYTES = 10 * MiB;
export const CONTACT_LOG_MAX_BYTES = 25 * MiB;

/** The error to show when `file` is over `maxBytes`, else null. */
export function fileTooLargeError(file: File, maxBytes: number): string | null {
  return file.size > maxBytes ? `File is too large. The limit is ${maxBytes / MiB} MB.` : null;
}
