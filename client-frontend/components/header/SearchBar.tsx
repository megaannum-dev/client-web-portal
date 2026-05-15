"use client";

import { Search } from "@/lib/icons";

export function SearchBar() {
  return (
    <label className="flex items-center gap-2 bg-transparent border border-outline rounded-full px-4 py-[5px] w-[30vw] max-w-[500px] focus-within:ring-1 focus-within:ring-primary/30 transition-shadow">
      <Search size={15} strokeWidth={1.75} className="shrink-0 text-primary/70" />
      <input
        type="search"
        placeholder="Search reports..."
        className="flex-1 bg-transparent text-body-md text-on-surface placeholder:text-secondary/60 outline-none min-w-0"
      />
    </label>
  );
}
