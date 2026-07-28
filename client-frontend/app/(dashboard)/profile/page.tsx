"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Check,
  CloudUpload,
  Pencil,
  Settings,
  Shield,
  Upload,
  X,
} from "@/lib/icons";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/lib/hooks/useProfile";
import { useKyc } from "@/lib/hooks/useKyc";
import { usePortfolio } from "@/lib/hooks/usePortfolio";
// ponytail: Supporting Documents shelved (D-5) — the SUPPORTING_DOC_CATEGORIES/
// SupportingDoc types and the mock store helpers this used were deleted in
// FE-14; see the commented block below for the full import list they needed.
import { PageHeader }  from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EyeToggle }   from "@/components/ui/EyeToggle";

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 pb-3">
      <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
        {label}
      </span>
      <span className="text-body-md text-on-surface">{value}</span>
    </div>
  );
}

function ReadOnlyField({ label, value, note }: { label: string; value: string; note?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 pb-3">
      <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-body-md text-on-surface">{value}</span>
        {note}
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 pb-3">
      <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-sm text-on-surface bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
      />
    </div>
  );
}

function BalanceItem({ label, value, censored }: { label: string; value: string; censored: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
        {label}
      </span>
      <span className="text-[28px] font-bold text-on-surface leading-none tracking-tight">
        {censored ? "***********" : value}
      </span>
    </div>
  );
}

const moneyFmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── KYC Upload Modal ───────────────────────────────────────────────────────────

function KycUploadModal({
  onClose,
  onUpload,
}: {
  onClose: () => void;
  onUpload: (file: File) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const { t } = useTranslation();
  const [file, setFile]             = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(selected: File) { setFile(selected); setFileError(false); setSubmitError(null); }
  async function handleSubmit() {
    if (!file) { setFileError(true); return; }
    setSubmitting(true);
    const result = await onUpload(file);
    setSubmitting(false);
    if (result.ok) onClose();
    else setSubmitError(result.error);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-outline-variant">
          <div>
            <h2 className="text-[17px] font-bold text-on-surface leading-snug">{t("profile.kyc_modal.title")}</h2>
            <p className="text-body-sm text-secondary mt-1 leading-relaxed">
              {t("profile.kyc_modal.subtitle")}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")}
            className="p-1.5 rounded-lg text-secondary hover:bg-surface-container hover:text-on-surface transition-colors shrink-0">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("profile.kyc_modal.document_file")}</label>
            <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl py-8 px-6 flex flex-col items-center gap-3 transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-primary/50 bg-primary/5"}`}>
              <div className="size-14 rounded-full bg-primary/15 flex items-center justify-center">
                <CloudUpload size={24} strokeWidth={1.75} className="text-primary" />
              </div>
              {file ? (
                <p className="text-body-sm font-semibold text-on-surface">{file.name}</p>
              ) : (
                <>
                  <p className="text-body-sm font-bold text-on-surface">{t("common.drag_drop_files")}</p>
                  <p className="text-body-sm text-secondary">{t("common.supported_formats")}</p>
                </>
              )}
              <button type="button" onClick={() => inputRef.current?.click()}
                className="px-5 py-2 border border-primary text-primary font-semibold text-body-sm rounded-lg hover:bg-warning/10 transition-colors">
                {t("common.browse_files")}
              </button>
              <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
            </div>
          </div>
          {fileError && (
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-error -mt-2">
              <AlertCircle size={13} strokeWidth={2} />{t("common.select_document_error")}
            </p>
          )}
          {submitError && (
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-error -mt-2">
              <AlertCircle size={13} strokeWidth={2} />{submitError}
            </p>
          )}
          <div className="flex gap-2.5 bg-primary/5 border border-primary/25 rounded-lg px-4 py-3">
            <AlertCircle size={15} strokeWidth={1.75} className="text-primary shrink-0 mt-0.5" />
            <p className="text-body-sm text-secondary leading-relaxed">
              {t("profile.kyc_modal.guidance")}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-body-sm font-semibold text-on-surface rounded-lg hover:bg-surface-container transition-colors">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting}
            className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
            <Upload size={15} strokeWidth={2.5} />{t("common.upload_document")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Supporting Document Upload Modal ──────────────────────────────────────────
// ponytail: Supporting Documents shelved (D-5) — reviving needs either a DocSpec
// key per category, or a relaxed UniqueConstraint(onboarding_id, doc_type) if a
// client must hold several files of one kind. JSX/state kept below, commented,
// so a future proposal restores rather than rewrites this.
//
// import { SUPPORTING_DOC_CATEGORIES, type SupportingDoc } from the (now-deleted) mock data module;
// import { appendSupportingDoc, getSupportingDocs } from the (now-deleted) mock store module;
//
// function SupportingDocModal({
//   onClose,
//   onSuccess,
// }: {
//   onClose: () => void;
//   onSuccess: (doc: SupportingDoc) => void;
// }) {
//   const { t } = useTranslation();
//   const [category, setCategory] = useState<string>(SUPPORTING_DOC_CATEGORIES[0]);
//   const [file, setFile]         = useState<File | null>(null);
//   const [isDragging, setIsDragging] = useState(false);
//   const [fileError, setFileError]   = useState(false);
//   const inputRef = useRef<HTMLInputElement>(null);
//
//   function handleFileSelect(f: File) { setFile(f); setFileError(false); }
//   function handleDrop(e: React.DragEvent) {
//     e.preventDefault(); setIsDragging(false);
//     const dropped = e.dataTransfer.files[0];
//     if (dropped) handleFileSelect(dropped);
//   }
//
//   function handleSubmit() {
//     if (!file) { setFileError(true); return; }
//     const doc: SupportingDoc = {
//       id:            `sdoc-${Date.now()}`,
//       category,
//       filename:      file.name,
//       status:        "processing",
//       submittedDate: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
//     };
//     appendSupportingDoc(doc);
//     onSuccess(doc);
//   }
//
//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center">
//       <div className="absolute inset-0 bg-black/40" onClick={onClose} />
//       <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col">
//         <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-outline-variant">
//           <div>
//             <h2 className="text-[17px] font-bold text-on-surface leading-snug">{t("profile.supporting_modal.title")}</h2>
//             <p className="text-body-sm text-secondary mt-1 leading-relaxed">
//               {t("profile.supporting_modal.subtitle")}
//             </p>
//           </div>
//           <button type="button" onClick={onClose} aria-label={t("common.close")}
//             className="p-1.5 rounded-lg text-secondary hover:bg-surface-container hover:text-on-surface transition-colors shrink-0">
//             <X size={18} strokeWidth={2} />
//           </button>
//         </div>
//
//         <div className="px-6 py-5 flex flex-col gap-5">
//           {/* Category */}
//           <div className="flex flex-col gap-1.5">
//             <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
//               {t("profile.supporting_modal.document_category")}
//             </label>
//             <div className="relative">
//               <select value={category} onChange={(e) => setCategory(e.target.value)}
//                 className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-sm text-on-surface bg-white appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer">
//                 {SUPPORTING_DOC_CATEGORIES.map((c) => (
//                   <option key={c} value={c}>{c}</option>
//                 ))}
//               </select>
//               <ChevronDown size={14} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary" />
//             </div>
//           </div>
//
//           {/* Drop zone */}
//           <div className="flex flex-col gap-1.5">
//             <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("profile.kyc_modal.document_file")}</label>
//             <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
//               onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
//               className={`border-2 border-dashed rounded-xl py-8 px-6 flex flex-col items-center gap-3 transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-primary/50 bg-primary/5"}`}>
//               <div className="size-14 rounded-full bg-primary/15 flex items-center justify-center">
//                 <CloudUpload size={24} strokeWidth={1.75} className="text-primary" />
//               </div>
//               {file ? (
//                 <p className="text-body-sm font-semibold text-on-surface">{file.name}</p>
//               ) : (
//                 <>
//                   <p className="text-body-sm font-bold text-on-surface">{t("common.drag_drop_files")}</p>
//                   <p className="text-body-sm text-secondary">{t("common.supported_formats")}</p>
//                 </>
//               )}
//               <button type="button" onClick={() => inputRef.current?.click()}
//                 className="px-5 py-2 border border-primary text-primary font-semibold text-body-sm rounded-lg hover:bg-warning/10 transition-colors">
//                 {t("common.browse_files")}
//               </button>
//               <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
//                 onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
//             </div>
//           </div>
//
//           {fileError && (
//             <p className="flex items-center gap-1.5 text-[12px] font-semibold text-error -mt-2">
//               <AlertCircle size={13} strokeWidth={2} />{t("common.select_document_error")}
//             </p>
//           )}
//         </div>
//
//         <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant">
//           <button type="button" onClick={onClose}
//             className="px-5 py-2.5 text-body-sm font-semibold text-on-surface rounded-lg hover:bg-surface-container transition-colors">
//             {t("common.cancel")}
//           </button>
//           <button type="button" onClick={handleSubmit}
//             className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity">
//             <Upload size={15} strokeWidth={2.5} />{t("common.upload_document")}
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }
//
// // Supporting Documents card — sat third in the Document Verification row.
// // <div className="flex-1 min-w-[260px] bg-surface-lowest border border-outline-variant rounded-lg p-5 flex flex-col gap-4">
// //   <div className="flex items-start justify-between gap-3">
// //     <div className="flex items-center gap-2">
// //       <FileText size={18} strokeWidth={1.75} className="text-primary shrink-0" />
// //       <span className="text-body-sm font-bold text-on-surface">{t("profile.supporting_documents")}</span>
// //     </div>
// //     <button type="button" onClick={() => setSupportingOpen(true)}
// //       className="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-lg text-[12px] font-bold hover:opacity-90 transition-opacity shrink-0">
// //       <Upload size={12} strokeWidth={2.5} />{t("common.upload")}
// //     </button>
// //   </div>
// //   {supportingDocs.length === 0 ? (
// //     <div className="flex flex-col items-center justify-center gap-2 py-5 text-center flex-1">
// //       <div className="size-10 rounded-full bg-surface-container flex items-center justify-center">
// //         <FileText size={18} strokeWidth={1.5} className="text-secondary" />
// //       </div>
// //       <p className="text-body-sm font-semibold text-on-surface">{t("profile.no_documents_uploaded")}</p>
// //       <p className="text-[12px] text-secondary leading-relaxed max-w-[200px]">
// //         {t("profile.supporting_empty_hint")}
// //       </p>
// //     </div>
// //   ) : (
// //     <div className="flex flex-col gap-2 overflow-auto max-h-48">
// //       {supportingDocs.map((doc) => (
// //         <div key={doc.id}
// //           className="flex items-center justify-between gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container/40">
// //           <div className="flex items-center gap-2 min-w-0">
// //             <div className="size-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
// //               <FileText size={13} strokeWidth={1.75} className="text-primary" />
// //             </div>
// //             <div className="min-w-0">
// //               <p className="text-[12px] font-semibold text-on-surface truncate">{doc.filename}</p>
// //               <p className="text-[11px] text-secondary mt-0.5">{doc.category}</p>
// //             </div>
// //           </div>
// //           <span className={clsx(
// //             "shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
// //             doc.status === "verified"     && "badge-success",
// //             doc.status === "processing"   && "badge-caution",
// //             doc.status === "not_uploaded" && "badge-warning",
// //           )}>
// //             {doc.status === "verified" ? t("common.verified") : doc.status === "processing" ? t("common.review") : t("common.pending")}
// //           </span>
// //         </div>
// //       ))}
// //     </div>
// //   )}
// // </div>
//
// // Modal render (sat alongside the KYC upload modal at the bottom of the page):
// // supportingOpen && SupportingDocModal({ onClose: () => setSupportingOpen(false), onSuccess: onSupportingSuccess })

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  // ── KYC state ──────────────────────────────────────────────────────────────
  const [censored, setCensored] = useState(true);
  const [kycOpen, setKycOpen]   = useState(false);
  const { data: kyc, upload: uploadKyc } = useKyc();
  const kycOverall = kyc?.overall;
  const nextReviewLabel = kyc?.next_review_at ? new Date(kyc.next_review_at).toLocaleDateString() : "—";

  // ── Account balance ────────────────────────────────────────────────────────
  const { data: portfolio } = usePortfolio();
  const totalValueLabel = portfolio ? moneyFmt(portfolio.total_value) : "—";
  const cashBalanceLabel = portfolio ? moneyFmt(portfolio.cash_deposit) : "—";

  // ── Profile info edit state ────────────────────────────────────────────────
  const { data: profile, save } = useProfile();
  const [editing, setEditing]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", occupation: "", address: "", country_of_residence: "" });

  function startEdit() {
    setDraft({
      name: profile?.name ?? "",
      occupation: profile?.occupation ?? "",
      address: profile?.address ?? "",
      country_of_residence: profile?.country_of_residence ?? "",
    });
    setSaveError(null);
    setEditing(true);
  }
  function cancelEdit() { setEditing(false); setSaveError(null); }
  async function commitEdit() {
    const result = await save(draft);
    setEditing(false);
    setSaveError(result.ok ? null : result.error);
  }
  function patchDraft(key: keyof typeof draft, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const dob = profile?.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : "—";

  // ── Supporting docs state ──────────────────────────────────────────────────
  // ponytail: Supporting Documents shelved (D-5) — see the commented
  // SupportingDocModal above for the full block this state fed.
  // const [supportingDocs, setSupportingDocs] = useState<SupportingDoc[]>(() => getSupportingDocs());
  // const [supportingOpen, setSupportingOpen] = useState(false);
  //
  // function onSupportingSuccess(doc: SupportingDoc) {
  //   setSupportingDocs((prev) => [doc, ...prev]);
  //   setSupportingOpen(false);
  // }

  return (
    <div className="flex flex-col gap-6 pb-8">

      <PageHeader
        title={t("profile.title")}
        subtitle={t("profile.subtitle")}
      />

      {/* ── Personal Information ─────────────────────────────────────────── */}
      <SectionCard
        title={t("profile.personal_information")}
        action={
          editing ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={cancelEdit}
                className="px-4 py-1.5 text-body-sm font-semibold text-secondary rounded-lg border border-outline-variant hover:bg-surface-container transition-colors">
                {t("common.cancel")}
              </button>
              <button type="button" onClick={commitEdit}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-body-sm font-bold bg-primary text-white rounded-lg hover:opacity-90 transition-opacity">
                <Check size={14} strokeWidth={2.5} />{t("common.save")}
              </button>
            </div>
          ) : (
            <button type="button" onClick={startEdit} aria-label={t("profile.edit_personal_information")}
              className="p-2 rounded text-secondary hover:bg-surface-container hover:text-on-surface transition-colors duration-150">
              <Pencil size={16} strokeWidth={1.75} />
            </button>
          )
        }
      >
        {saveError && (
          <p className="text-body-sm text-error px-1 -mt-1">{saveError}</p>
        )}
        <div className="flex gap-10 items-start">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2 shrink-0 mx-20">
            <div className="size-24 rounded-full overflow-hidden shadow-card">
              <div className="size-full bg-gradient-to-br from-yellow-200 via-green-300 to-teal-600 flex items-center justify-center">
                <span className="text-headline-md font-bold text-white/80 select-none">
                  {(profile?.name ?? user?.displayName ?? "?")[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
            </div>
            <button type="button" className="text-body-sm font-semibold text-primary hover:opacity-80 transition-opacity">
              {t("profile.change_photo")}
            </button>
          </div>

          {/* Fields grid */}
          <div className="flex flex-1 flex-col gap-4 min-w-0">

            {/* Full Name — editable */}
            {editing ? (
              <EditableField label={t("profile.full_name")} value={draft.name} onChange={(v) => patchDraft("name", v)} />
            ) : (
              <ProfileField label={t("profile.full_name")} value={profile?.name ?? "—"} />
            )}

            <div className="grid grid-cols-2 gap-6">
              {/* Phone — read-only (managed in Settings) */}
              <ReadOnlyField label={t("profile.phone_number")} value={profile?.phone ?? "—"}
                note={editing ? (
                  <Link href="/settings" className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary hover:text-primary transition-colors">
                    <Settings size={11} strokeWidth={2} />{t("profile.edit_in_settings")}
                  </Link>
                ) : undefined}
              />
              {/* Email — read-only (managed in Settings) */}
              <ReadOnlyField label={t("profile.email")} value={profile?.email ?? "—"}
                note={editing ? (
                  <Link href="/settings" className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary hover:text-primary transition-colors">
                    <Settings size={11} strokeWidth={2} />{t("profile.edit_in_settings")}
                  </Link>
                ) : undefined}
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              {editing ? (
                <EditableField label={t("profile.occupation")} value={draft.occupation} onChange={(v) => patchDraft("occupation", v)} />
              ) : (
                <ProfileField label={t("profile.occupation")} value={profile?.occupation ?? "—"} />
              )}
              {/* Date of Birth — read-only, never editable */}
              <ReadOnlyField label={t("profile.date_of_birth")} value={dob} />
            </div>

            <div className="grid grid-cols-2 gap-6">
              {editing ? (
                <>
                  <EditableField label={t("profile.residential_address")}   value={draft.address}               onChange={(v) => patchDraft("address", v)} />
                  <EditableField label={t("profile.location_of_residence")} value={draft.country_of_residence}  onChange={(v) => patchDraft("country_of_residence", v)} />
                </>
              ) : (
                <>
                  <ProfileField label={t("profile.residential_address")}   value={profile?.address ?? "—"} />
                  <ProfileField label={t("profile.location_of_residence")} value={profile?.country_of_residence ?? "—"} />
                </>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Account Balance ──────────────────────────────────────────────── */}
      <SectionCard
        title={t("profile.account_balance")}
        action={<EyeToggle censored={censored} onToggle={() => setCensored((v) => !v)} />}
      >
        <div className="grid grid-cols-2 gap-8">
          <BalanceItem label={t("profile.total_portfolio_value")} value={totalValueLabel}  censored={censored} />
          <BalanceItem label={t("profile.total_cash_value")}      value={cashBalanceLabel} censored={censored} />
        </div>
      </SectionCard>

      {/* ── Document Verification ────────────────────────────────────────── */}
      <SectionCard id="document-verification" title={t("profile.document_verification")}>
        <div className="flex flex-wrap gap-5">

          {/* KYC — tri-state: due | processing | verified */}
          <div className={clsx(
            "flex-1 min-w-[260px] rounded-lg p-5 flex flex-col gap-4 border transition-colors duration-300",
            kycOverall === "verified"   && "bg-success-container border-success/25",
            kycOverall === "processing" && "bg-surface-lowest border-outline-variant",
            kycOverall === "due"        && "bg-warning-container border-warning/25",
          )}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield size={18} strokeWidth={1.75}
                  className={clsx("shrink-0",
                    kycOverall === "verified"   && "text-success",
                    kycOverall === "processing" && "text-primary",
                    kycOverall === "due"        && "text-warning",
                  )} />
                <span className="text-body-sm font-bold text-on-surface">{t("profile.kyc_status")}</span>
              </div>
              {kycOverall === "verified"   && <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border badge-success">{t("profile.kyc_verified_badge")}</span>}
              {kycOverall === "processing" && <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border badge-caution">{t("profile.kyc_processing_badge")}</span>}
              {kycOverall === "due"        && <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border badge-warning">{t("profile.kyc_due_badge")}</span>}
            </div>
            <p className="text-body-sm text-secondary leading-relaxed">
              {kycOverall === "verified"   ? t("profile.kyc_verified_desc")
              : kycOverall === "processing" ? t("profile.kyc_processing_desc")
              : t("profile.kyc_due_desc")}
            </p>
            <p className="text-body-sm text-on-surface">
              {kycOverall === "verified"   && <><span>{t("profile.next_renewal_due")}</span><span className="text-success font-bold">{nextReviewLabel}</span></>}
              {kycOverall === "processing" && <span className="text-secondary">{t("profile.submitted", { date: nextReviewLabel })}</span>}
              {kycOverall === "due"        && <><span>{t("profile.annual_update_due")}</span><span className="text-warning font-bold">{nextReviewLabel}</span></>}
            </p>
            {kycOverall === "verified"   && <button type="button" className="w-full border border-success/30 text-success-on-container font-bold text-body-sm rounded-lg py-3 hover:bg-success-container transition-colors">{t("profile.view_document")}</button>}
            {kycOverall === "processing" && <button type="button" className="w-full border border-outline-variant font-bold text-body-sm rounded-lg py-3 hover:bg-secondary/5 transition-colors">{t("profile.view_kyc_document")}</button>}
            {kycOverall === "due" && (
              kyc?.can_upload ? (
                <button type="button" onClick={() => setKycOpen(true)} className="w-full bg-warning text-white font-bold text-body-sm rounded-lg py-3 hover:opacity-90 transition-opacity">{t("profile.upload_kyc")}</button>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <button type="button" disabled className="w-full bg-warning/40 text-white/70 font-bold text-body-sm rounded-lg py-3 cursor-not-allowed">{t("profile.upload_kyc")}</button>
                  <p className="text-[11px] text-secondary text-center">{t("profile.upload_available_from", { date: kyc?.upload_opens_at })}</p>
                </div>
              )
            )}
          </div>

          {/* ponytail: AML card deleted (D-5) — no DocSpec or column backs it
              anywhere in the repo; this row now reflows from 3 cards to 2
              under the existing flex-wrap + min-w-[260px], no new layout rule. */}

          {/* ponytail: Supporting Documents shelved (D-5) — reviving needs either a DocSpec
              key per category, or a relaxed UniqueConstraint(onboarding_id, doc_type) if a
              client must hold several files of one kind. Full JSX/state kept commented,
              near the SupportingDocModal definition above, so a future proposal restores
              rather than rewrites this. */}

        </div>
      </SectionCard>

      {kycOpen && (
        <KycUploadModal
          onClose={() => setKycOpen(false)}
          onUpload={uploadKyc}
        />
      )}

      {/* ponytail: Supporting Documents shelved (D-5) — this used to render the
          SupportingDocModal here when supportingOpen was true; see the commented
          definition and call above. */}
    </div>
  );
}
