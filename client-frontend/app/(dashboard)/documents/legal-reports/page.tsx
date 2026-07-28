"use client";

import { useTranslation } from "react-i18next";
import { FileText, Download, BookOpen } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/components/auth/AuthProvider";
import { downloadDocument, type StoredFileDTO } from "@/lib/api/documents";
import { useDocuments } from "@/lib/hooks/useDocuments";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_KEYS: Record<string, string> = {
  "Fund Documents":   "documents.categories.fund_documents",
  "Legal Agreements": "documents.categories.legal_agreements",
  "Compliance":       "documents.categories.compliance",
};

function groupByCategory(docs: StoredFileDTO[]): Record<string, StoredFileDTO[]> {
  return docs.reduce<Record<string, StoredFileDTO[]>>((acc, doc) => {
    const category = doc.category ?? "";
    if (!acc[category]) acc[category] = [];
    acc[category].push(doc);
    return acc;
  }, {});
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LegalReportsPage() {
  const { t } = useTranslation();
  const { getIdToken } = useAuth();
  const { data } = useDocuments("legal");
  const legalByCategory = groupByCategory(data);

  async function handleDownload(doc: StoredFileDTO) {
    const token = await getIdToken();
    const blob = await downloadDocument(token, "legal", doc.key);
    const href = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href, download: doc.filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

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
          {Object.entries(legalByCategory).map(([category, docs]) => (
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
                      <tr key={doc.key} className="hover:bg-surface-container/40 transition-colors duration-100">
                        <td className="px-5 py-4">
                          <span className="flex items-center gap-2.5">
                            <FileText size={15} strokeWidth={1.75} className="shrink-0 text-primary" />
                            <span className="text-body-sm font-semibold text-on-surface">{doc.filename}</span>
                          </span>
                        </td>
                        <td className="px-5 py-4 text-body-sm text-secondary hidden md:table-cell">
                          {doc.filename.replace(/\.[^.]+$/, "")}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleDownload(doc)}
                            className="inline-flex items-center gap-1.5 text-primary text-[12.5px] font-semibold hover:opacity-70 transition-opacity"
                            aria-label={t("documents.download_aria", { name: doc.filename })}
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
