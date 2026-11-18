"use client";

import type { BookCode } from "@/lib/pm/types";

/** Short labels for this page. Codes stay dt, pt, inb. INB is Investment Book. */
export const BOOK_CHIP: Record<BookCode, string> = {
  dt: "DT",
  pt: "PT",
  inb: "INB",
};

export const BOOK_ORDER: BookCode[] = ["dt", "pt", "inb"];

export function BookChip({ code }: { code: BookCode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-[6px] bg-primary px-1.5 py-[2px] text-[10px] font-bold tracking-[0.04em] text-white">
      {BOOK_CHIP[code]}
    </span>
  );
}

export function BookAccountStack({
  accounts,
}: {
  accounts: { book: BookCode; account: string }[];
}) {
  if (accounts.length === 0) return <span>—</span>;
  return (
    <span className="flex flex-col items-start gap-1">
      {accounts.map((row) => (
        <span key={row.book} className="inline-flex items-center gap-1.5">
          <BookChip code={row.book} />
          <span className="font-semibold tabular-nums">{row.account}</span>
        </span>
      ))}
    </span>
  );
}
