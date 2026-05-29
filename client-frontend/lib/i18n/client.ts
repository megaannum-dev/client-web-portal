"use client";

// ── i18next client instance ──────────────────────────────────────────────────
// Initialised once on the client. Translation JSON is fetched at runtime from
// /public/locales/{{lng}}/translation.json via i18next-http-backend, so the
// JSON never ships inside the JS bundle.

import i18next from "i18next";
import HttpBackend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_NS,
  I18N_STORAGE_KEY,
  LANGUAGES,
  isLanguage,
  type Language,
} from "./settings";

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const stored = window.localStorage.getItem(I18N_STORAGE_KEY);
  return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

let initPromise: Promise<unknown> | null = null;

/** Initialise i18next exactly once; subsequent calls return the same promise. */
export function initI18n(): Promise<unknown> {
  if (!initPromise) {
    initPromise = i18next
      .use(HttpBackend)
      .use(initReactI18next)
      .init({
        lng: getInitialLanguage(),
        fallbackLng: DEFAULT_LANGUAGE,
        supportedLngs: LANGUAGES as unknown as string[],
        load: "currentOnly",
        ns: [DEFAULT_NS],
        defaultNS: DEFAULT_NS,
        interpolation: { escapeValue: false },
        backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
        react: { useSuspense: false },
      });
  }
  return initPromise;
}

/** Change the active language, persist it, and update <html lang>. */
export async function setLanguage(lng: Language): Promise<void> {
  await i18next.changeLanguage(lng);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(I18N_STORAGE_KEY, lng);
    document.documentElement.lang = lng;
  }
}

export default i18next;
