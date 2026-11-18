"use client";

import { useEffect, useState } from "react";
import { getIbAccountRegistry } from "@/app/(roles)/pm/model-management/actions";
import type { IbAccountOption } from "@/lib/pm/types";

/** Loads the configured master accounts. An empty list means none are configured. */
export function useIbAccountRegistry(): { options: IbAccountOption[]; loading: boolean } {
  const [options, setOptions] = useState<IbAccountOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getIbAccountRegistry().then((result) => {
      if (!cancelled) setOptions(result.success ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { options: options ?? [], loading: options === null };
}
