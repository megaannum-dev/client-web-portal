"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Download, ChevronLeft, ChevronRight } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { downloadAs } from "@/lib/downloadFile";
import { MOCK_EOM_REPORTS } from "@/lib/mock/data";
import clsx from "clsx";

const PAGE_SIZE = 5;

export default function MonthlyReportsPage() {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(MOCK_EOM_REPORTS.length / PAGE_SIZE));
  const pageData   = MOCK_EOM_REPORTS.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const columns = [
    { label: t("documents.columns.report_name"),      center: false },
    { label: t("documents.columns.reporting_period"), center: false },
    { label: t("documents.columns.generated_date"),   center: false },
    { label: t("common.download"),                    center: true  },
  ];

  return (
    <div className="flex flex-col gap-8 pb-8">

      <PageHeader
        title={t("monthly_reports.title")}
        subtitle={t("monthly_reports.subtitle")}
      />

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-headline-md font-semibold text-on-surface">
            {t("monthly_reports.section_title")}
          </h2>
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
                {columns.map(({ label, center }) => (
                  <th
                    key={label}
                    className={clsx(
                      "px-5 py-3 border-b border-outline-variant text-label-md font-semibold uppercase tracking-[0.05em] text-secondary",
                      center ? "text-center" : "text-left"
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-surface-lowest divide-y divide-outline-variant">
              {pageData.map((r, i) => (
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

        {/* ── Pagination ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mt-4 px-1">
          <span className="text-body-sm text-secondary">
            {t("monthly_reports.showing", {
              from:  (currentPage - 1) * PAGE_SIZE + 1,
              to:    Math.min(currentPage * PAGE_SIZE, MOCK_EOM_REPORTS.length),
              total: MOCK_EOM_REPORTS.length,
            })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded border border-outline-variant hover:bg-surface-container transition-colors flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={t("monthly_reports.previous_page")}
            >
              <ChevronLeft size={14} strokeWidth={2} className="text-secondary" />
            </button>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={clsx(
                    "w-7 h-7 flex items-center justify-center rounded text-[12px] font-semibold transition-colors",
                    page === currentPage
                      ? "bg-primary text-white"
                      : "text-secondary hover:bg-surface-container"
                  )}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded border border-outline-variant hover:bg-surface-container transition-colors flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={t("monthly_reports.next_page")}
            >
              <ChevronRight size={14} strokeWidth={2} className="text-secondary" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
