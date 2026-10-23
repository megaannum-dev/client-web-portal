"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { faqText, type FaqText } from "./faqContent";

/** FAQ text lookups in the current UI language; follows language switches. */
export function useFaqText(): FaqText {
  const { i18n } = useTranslation();
  return useMemo(() => faqText(i18n.language), [i18n.language]);
}
