"use client";

import { Menu, Search } from "@/lib/icons";

interface SearchBarProps {
  onMenuToggle?: () => void;
}

export function SearchBar({ onMenuToggle }: SearchBarProps) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onMenuToggle}
        className="flex items-center justify-center p-2 rounded cursor-pointer text-secondary hover:bg-surface-container transition-colors duration-150"
        aria-label="Toggle sidebar"
      >
        <Menu size={18} strokeWidth={1.75} />
      </button>

      <label className="flex items-center gap-2 bg-surface-container border border-outline rounded-full px-4 py-[5px] w-[30vw] max-w-[500px] margin-right">
        <Search size={15} strokeWidth={1.75} className="shrink-0 text-secondary" />
        <input
          type="search"
          placeholder="Search reports or funds..."
          className="flex-1 bg-transparent text-body-md text-on-surface placeholder:text-secondary/60 outline-none min-w-0"
        />
      </label>
    </div>
  );
}
