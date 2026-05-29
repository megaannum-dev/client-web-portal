// ── i18n shared settings ─────────────────────────────────────────────────────
// Single source of truth for supported languages, the default namespace, and
// the localStorage key used to persist the user's choice.

export const LANGUAGES = ["en", "zh-TW"] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";
export const DEFAULT_NS = "translation";

/** localStorage key that persists the selected language across sessions. */
export const I18N_STORAGE_KEY = "portal_lang";

/** Human-readable labels shown in the language selector. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English (US)",
  "zh-TW": "繁體中文",
};

export function isLanguage(value: string | null | undefined): value is Language {
  return !!value && (LANGUAGES as readonly string[]).includes(value);
}
