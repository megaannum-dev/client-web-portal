"use client";

import { Lock } from "@/lib/icons";
import type { IbAccountOption } from "@/lib/pm/types";

export const LIVE_MASTER_LOCK = "Master IB account can't change once a model is live.";

function freeAccountLabel(count: number): string {
  return count === 1 ? "1 free account" : `${count} free accounts`;
}

export function MasterAccountField({
  value,
  onChange,
  options,
  loading,
  locked = false,
}: {
  value: string;
  onChange: (next: string) => void;
  options: IbAccountOption[];
  loading: boolean;
  locked?: boolean;
}) {
  const known = options.some((option) => option.master === value);
  const registryEmpty = !loading && options.length === 0;

  return (
    <div className="flex flex-col gap-1.5" title={locked ? LIVE_MASTER_LOCK : undefined}>
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
        Master IB Account
        {locked && (
          <span title={LIVE_MASTER_LOCK} className="inline-flex text-secondary">
            <Lock size={13} strokeWidth={2} aria-label={LIVE_MASTER_LOCK} />
          </span>
        )}
      </span>
      <select
        value={value}
        disabled={locked || loading}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded border border-outline-variant bg-white px-3 text-[14px] font-semibold text-on-surface outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-low"
      >
        <option value="">{loading ? "Loading master accounts" : "No master account"}</option>
        {value !== "" && !known && <option value={value}>{value}</option>}
        {options.map((option) => (
          <option key={option.master} value={option.master}>
            {`${option.master} · ${freeAccountLabel(option.free_count)}`}
          </option>
        ))}
      </select>
      {registryEmpty && (
        <p className="text-[11.5px] font-semibold text-secondary">No master accounts are configured.</p>
      )}
    </div>
  );
}
