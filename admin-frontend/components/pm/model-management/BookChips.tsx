"use client";

import { Lock } from "@/lib/icons";
import type { BookCode } from "@/lib/pm/types";

/** Display order. Codes stay in state; only the full names are rendered. */
const BOOK_LABEL: Record<BookCode, string> = {
  dt: "Day Trade",
  pt: "Position Trade",
  inb: "Investment Book",
};

export const BOOK_CODES: BookCode[] = ["dt", "pt", "inb"];

export const LIVE_BOOKS_LOCK = "Books can't change once a model is live.";

export function canonicalBooks(value: readonly string[] | null | undefined): BookCode[] {
  const present = new Set(value ?? []);
  return BOOK_CODES.filter((code) => present.has(code));
}

function Chip({
  label,
  selected,
  interactive,
  onClick,
}: {
  label: string;
  selected: boolean;
  interactive: boolean;
  onClick?: () => void;
}) {
  const tone = selected
    ? "bg-primary text-white"
    : "border border-outline-variant bg-white text-secondary";
  if (!interactive) {
    return (
      <span className={`inline-flex items-center rounded-[6px] px-2 py-[3px] text-[12px] font-bold ${tone}`}>
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`cursor-pointer rounded-[6px] px-2.5 py-1.5 text-[12.5px] font-bold outline-none focus:ring-2 focus:ring-primary ${tone} ${
        selected ? "" : "hover:border-primary hover:text-primary"
      }`}
    >
      {label}
    </button>
  );
}

/** Selected books, full names only. Pass onChange to toggle; omit it to show the selection. */
export function BookChips({
  value,
  onChange,
  locked = false,
}: {
  value: readonly string[];
  onChange?: (next: BookCode[]) => void;
  locked?: boolean;
}) {
  const selected = canonicalBooks(value);
  const interactive = onChange !== undefined && !locked;
  const shown = interactive || locked ? BOOK_CODES : selected;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      title={locked ? LIVE_BOOKS_LOCK : undefined}
    >
      {shown.map((code) => (
        <Chip
          key={labelKey(code)}
          label={BOOK_LABEL[code]}
          selected={selected.includes(code)}
          interactive={interactive}
          onClick={
            interactive
              ? () => {
                  const next = selected.includes(code)
                    ? selected.filter((item) => item !== code)
                    : canonicalBooks([...selected, code]);
                  onChange(next);
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function labelKey(code: BookCode): string {
  return BOOK_LABEL[code];
}

export function RequiredBooksField({
  value,
  onChange,
  locked = false,
}: {
  value: readonly string[];
  onChange: (next: BookCode[]) => void;
  locked?: boolean;
}) {
  const empty = canonicalBooks(value).length === 0;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
        Required books
        {locked && (
          <span title={LIVE_BOOKS_LOCK} className="inline-flex text-secondary">
            <Lock size={13} strokeWidth={2} aria-label={LIVE_BOOKS_LOCK} />
          </span>
        )}
      </span>
      <BookChips value={value} onChange={onChange} locked={locked} />
      <p className="text-[11.5px] font-semibold text-secondary">
        Each client subscribed to this model needs one account per selected book.
      </p>
      {empty && !locked && (
        <p className="text-[11.5px] font-semibold text-primary">Select at least one book.</p>
      )}
    </div>
  );
}
