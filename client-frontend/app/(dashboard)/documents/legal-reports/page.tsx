"use client";

import { useTranslation } from "react-i18next";
import { FileText, Download, BookOpen } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { downloadAs } from "@/lib/downloadFile";
import { MOCK_LEGAL_DOCUMENTS } from "@/lib/mock/data";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_KEYS: Record<string, string> = {
  "Fund Documents":   "documents.categories.fund_documents",
  "Legal Agreements": "documents.categories.legal_agreements",
  "Compliance":       "documents.categories.compliance",
};

const LEGAL_BY_CATEGORY = MOCK_LEGAL_DOCUMENTS.reduce<Record<string, typeof MOCK_LEGAL_DOCUMENTS>>(
  (acc, doc) => {
    if (!acc[doc.category]) acc[doc.category] = [];
    acc[doc.category].push(doc);
    return acc;
  },
  {},
);

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LegalReportsPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-8 pb-8">

      <PageHeader
        title={t("legal_reports.title")}
        subtitle={t("legal_reports.subtitle")}
      />

      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <BookOpen size={20} strokeWidth={1.75} className="text-primary shrink-0" />
          <h2 className="text-headline-md font-semibold text-on-surface">
            {t("legal_reports.section_title")}
          </h2>
        </div>

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
