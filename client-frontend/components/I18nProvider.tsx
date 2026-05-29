"use client";

import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18next, { initI18n } from "@/lib/i18n/client";

/**
 * Boots i18next on the client and exposes it to the React tree. Children are
 * gated until the initial translation bundle has loaded so the UI never flashes
 * raw translation keys.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(i18next.isInitialized);

  useEffect(() => {
    if (i18next.isInitialized) {
      setReady(true);
      return;
    }
    initI18n().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="size-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      </div>
    );
  }

  return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>;
}
