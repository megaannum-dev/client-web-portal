"use client";

import { ChevronRight } from "@/lib/icons";

/** One question in the FAQ list; clicking it opens the answer view. */
export function FaqQuestionRow({ question, onOpen }: { question: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center justify-between gap-3 py-2 text-left cursor-pointer bg-transparent border-b border-outline-variant last:border-b-0 group"
    >
      <span className="text-[13px] leading-[18px] font-semibold text-secondary group-hover:text-primary transition-colors duration-150">
        {question}
      </span>
      <ChevronRight
        size={16}
        strokeWidth={2}
        className="shrink-0 text-secondary group-hover:text-primary group-hover:translate-x-0.5 transition-[color,transform] duration-150"
      />
    </button>
  );
}
