"use client";

import { useTranslation } from "react-i18next";
import { FileText, Download, BookOpen } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { downloadAs } from "@/lib/downloadFile";
import { MOCK_EOM_REPORTS, MOCK_LEGAL_DOCUMENTS } from "@/lib/mock/data";
import clsx from "clsx";

// ── Constants ─────────────────────────────────────────────────────────────────

// Maps the mock legal-document category strings to translation keys.
// DETACHABLE: tied to the mock data categories — remove with the mock layer.
const CATEGORY_KEYS: Record<string, string> = {
  "Fund Documents":   "documents.categories.fund_documents",
  "Legal Agreements": "documents.categories.legal_agreements",
  "Compliance":       "documents.categories.compliance",
};

// Group legal docs by category for section rendering
const LEGAL_BY_CATEGORY = MOCK_LEGAL_DOCUMENTS.reduce<Record<string, typeof MOCK_LEGAL_DOCUMENTS>>(
  (acc, doc) => {
    if (!acc[doc.category]) acc[doc.category] = [];
    acc[doc.category].push(doc);
    return acc;
  },
  {},
);

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { t } = useTranslation();

  const eomColumns = [
    { label: t("documents.columns.report_name"),      center: false },
    { label: t("documents.columns.reporting_period"), center: false },
    { label: t("documents.columns.generated_date"),   center: false },
    { label: t("common.download"),                    center: true  },
  ];

  return (
    <div className="flex flex-col gap-8 pb-8">

      <PageHeader
        title={t("documents.title")}
        subtitle={t("documents.subtitle")}
      />

      {/* ── Historical EOM Reports ────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-headline-md font-semibold text-on-surface">{t("documents.historical_eom_reports")}</h2>
        </div>

        <div className="border border-outline-variant rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse table-fixed">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[30%]" />
              <col className="w-[30%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="bg-surface-container">
              <tr>
                {eomColumns.map(({ label, center }) => (
                  <th
                    key={label}
                    className={clsx(`px-5 py-3 border-b border-outline-variant text-label-md font-semibold uppercase tracking-[0.05em] text-secondary`,
                      center ? "text-center" : "text-left"
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-surface-lowest divide-y divide-outline-variant">
              {MOCK_EOM_REPORTS.map((r, i) => (
                <tr key={i} className="hover:bg-surface-container/40 transition-colors duration-100">
                  <td className="px-5 py-4">
                    <span className="flex items-center gap-2.5">
                      <FileText size={16} strokeWidth={1.75} className="shrink-0 text-primary" />
                      <span className="text-body-sm font-medium text-on-surface">{r.name}</span>
                    </span>
                  </td>
                  <td className="px-5 py-4 text-body-sm text-secondary">{r.period}</td>
                  <td className="px-5 py-4 text-body-sm text-secondary">{r.generated}</td>
                  <td className="px-5 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => downloadAs("/dummy-EoM-Report.pdf", r.name)}
                      className="text-primary hover:opacity-70 transition-opacity"
                      aria-label={t("documents.download_aria", { name: r.name })}
                    >
                      <Download size={16} strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Reference Documents ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <BookOpen size={20} strokeWidth={1.75} className="text-primary shrink-0" />
          <h2 className="text-headline-md font-semibold text-on-surface">{t("documents.reference_documents")}</h2>
        </div>
        <p className="text-body-sm text-secondary mb-6 -mt-1">
          {t("documents.reference_subtitle")}
        </p>

        <div className="flex flex-col gap-6">
          {Object.entries(LEGAL_BY_CATEGORY).map(([category, docs]) => (
            <div key={category}>
              <p className="text-label-md font-bold uppercase tracking-[0.08em] text-secondary mb-3">
                {CATEGORY_KEYS[category] ? t(CATEGORY_KEYS[category]) : category}
              </p>
              <div className="border border-outline-variant rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse table-fixed">
                  <colgroup>
                    <col className="w-[20%]" />
                    <col className="w-[60%]" />
                    <col className="w-[10%]" />
                  </colgroup>
                  <tbody className="bg-surface-lowest divide-y divide-outline-variant">
                    {docs.map((doc) => (
                      <tr key={doc.filename} className="hover:bg-surface-container/40 transition-colors duration-100">
                        <td className="px-5 py-4">
                          <span className="flex items-center gap-2.5">
                            <FileText size={15} strokeWidth={1.75} className="shrink-0 text-primary" />
                            <span className="text-body-sm font-semibold text-on-surface">{doc.name}</span>
                          </span>
                        </td>
                        <td className="px-5 py-4 text-body-sm text-secondary hidden md:table-cell">
                          {doc.description}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => downloadAs("/dummy-EoM-Report.pdf", doc.filename)}
                            className="inline-flex items-center gap-1.5 text-primary text-[12.5px] font-semibold hover:opacity-70 transition-opacity"
                            aria-label={t("documents.download_aria", { name: doc.name })}
                          >
                            <Download size={14} strokeWidth={2} />
                            {t("common.download")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
