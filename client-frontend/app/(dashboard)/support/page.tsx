"use client";

import { useTranslation } from "react-i18next";

export default function SupportPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-headline-xl font-bold text-on-surface tracking-tight">{t("support.title")}</h1>
    </div>
  );
}
