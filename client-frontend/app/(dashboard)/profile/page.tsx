"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { AlertCircle, ChevronDown, CloudUpload, Pencil, Shield, Upload, X, Zap } from "@/lib/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { MOCK_PORTFOLIO_STATS, STORE_KEYS, type KycStatus } from "@/lib/mock/data";
import { appendEventItem, appendLatestEvent } from "@/lib/mock/store";
import { PageHeader }  from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EyeToggle }   from "@/components/ui/EyeToggle";
import { downloadAs } from "@/lib/downloadFile";

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ KYC Upload Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function KycUploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [docType, setDocType]       = useState("Passport");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile]             = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(selected: File) {
    setFile(selected);
    setFileError(false);
  }

  function handleSubmit() {
    if (!file) { setFileError(true); return; }
    onSuccess();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-outline-variant">
          <div>
            <h2 className="text-[17px] font-bold text-on-surface leading-snug">KYC Document Upload</h2>
            <p className="text-body-sm text-secondary mt-1 leading-relaxed">
              Please provide clear scans of the required verification documents.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-secondary hover:bg-surface-container hover:text-on-surface transition-colors shrink-0"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Document Type + Expiry Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
                Document Type
              </label>
              <div className="relative">
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-sm text-on-surface bg-white appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
                >
                  <option>Passport</option>
                  <option>National ID</option>
                  <option>Driver&apos;s License</option>
                </select>
                <ChevronDown size={14} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
                Expiry Date
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                placeholder="mm/dd/yyyy"
                className="border border-outline-variant rounded-lg px-3 py-2.5 text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>

          {/* Drop zone */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
              Document File
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl py-8 px-6 flex flex-col items-center gap-3 transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-primary/50 bg-primary/5"
              }`}
            >
              <div className="size-14 rounded-full bg-primary/15 flex items-center justify-center">
                <CloudUpload size={24} strokeWidth={1.75} className="text-primary" />
              </div>
              {file ? (
                <p className="text-body-sm font-semibold text-on-surface">{file.name}</p>
              ) : (
                <>
                  <p className="text-body-sm font-bold text-on-surface">Drag &amp; drop files here</p>
                  <p className="text-body-sm text-secondary">Supported: JPG, PNG, PDF (Max 10MB)</p>
                </>
              )}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="px-5 py-2 border border-primary text-primary font-semibold text-body-sm rounded-lg hover:bg-warning/10 transition-colors"
              >
                Browse Files
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
              />
            </div>
          </div>

          {/* File validation error */}
          {fileError && (
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-error -mt-2">
              <AlertCircle size={13} strokeWidth={2} />
              Please select a document before uploading.
            </p>
          )}

          {/* Info note */}
          <div className="flex gap-2.5 bg-primary/5 border border-primary/25 rounded-lg px-4 py-3">
            <AlertCircle size={15} strokeWidth={1.75} className="text-primary shrink-0 mt-0.5" />
            <p className="text-body-sm text-secondary leading-relaxed">
              Ensure all text and photos are clearly visible. Reflections or obscured details may
              lead to verification delays or rejection.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-body-sm font-semibold text-on-surface rounded-lg hover:bg-surface-container transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity"
          >
            <Upload size={15} strokeWidth={2.5} />
            Upload Document
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function ProfilePage() {
  const { user } = useAuth();
  const [censored, setCensored] = useState(true);
  const [kycOpen, setKycOpen]   = useState(false);
  const [kycStatus, setKycStatus] = useState<KycStatus>(
    () => (typeof window !== "undefined"
      ? (localStorage.getItem(STORE_KEYS.kycStatus) as KycStatus) ?? "due"
      : "due"),
  );

  function applyKycStatus(next: KycStatus) {
    localStorage.setItem(STORE_KEYS.kycStatus, next);
    setKycStatus(next);
    if (next === "processing") {
      appendLatestEvent({
        id:          "kyc-review",
        level:       "info",
        title:       "KYC Document Under Review",
        description: "Your submitted KYC document is being reviewed. This typically takes 1â€“3 business days.",
      });
      appendEventItem({
        id:             "event-kyc-upload",
        iconType:       "shield",
        level:          "info",
        title:          "KYC Document Submitted for Review",
        time:           "Just now",
        description:    "Your KYC document has been uploaded and is now under review. This typically takes 1â€“3 business days.",
        category:       "Account Reminders",
        primaryLabel:   "View Details",
        primaryVariant: "outline",
        secondaryLabel: "Mark as Read",
      });
    }
  }

  const displayName = user?.displayName ?? "Alex Thompson";
  const email       = user?.email       ?? "alex.thompson@example.com";

  return (
    <div className="flex flex-col gap-6 pb-8">

      <PageHeader
        title="User Profile"
        subtitle="Manage your personal information and document compliance status."
      />

      {/* â”€â”€ Personal Information â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <SectionCard
        title="Personal Information"
        action={
          <button
            type="button"
            aria-label="Edit personal information"
            className="p-2 rounded text-secondary hover:bg-surface-container hover:text-on-surface transition-colors duration-150"
          >
            <Pencil size={16} strokeWidth={1.75} />
          </button>
        }
      >
        <div className="flex gap-10 items-start">

          {/* Avatar */}
          <div className="flex flex-col items-center gap-2 shrink-0 mx-20">
            <div className="size-24 rounded-full overflow-hidden shadow-card">
              <div className="size-full bg-gradient-to-br from-yellow-200 via-green-300 to-teal-600 flex items-center justify-center">
                <span className="text-headline-md font-bold text-white/80 select-none">
                  {displayName[0].toUpperCase()}
                </span>
              </div>
            </div>
            <button type="button" className="text-body-sm font-semibold text-primary hover:opacity-80 transition-opacity">
              Change Photo
            </button>
          </div>

          {/* Fields grid */}
          <div className="flex flex-1 flex-col gap-4 min-w-0">
            <ProfileField label="Full Name" value={displayName} />
            <div className="grid grid-cols-2 gap-6">
              <ProfileField label="Phone Number" value="+1 (555) 0123-4567"           />
              <ProfileField label="Email"         value={email}                         />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <ProfileField label="Company"    value="Thompson Global Holdings" />
              <ProfileField label="Occupation" value="Chief Executive Officer"  />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <ProfileField label="Residential Address"   value="123 Maple Avenue, Suite 400" />
              <ProfileField label="Location of Residence" value="New York, NY, USA"           />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* â”€â”€ Account Balance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <SectionCard
        title="Account Balance"
        action={<EyeToggle censored={censored} onToggle={() => setCensored((v) => !v)} />}
      >
        <div className="grid grid-cols-2 gap-8">
          <BalanceItem label="Total Portfolio Value" value={MOCK_PORTFOLIO_STATS.totalValue}  censored={censored} />
          <BalanceItem label="Total Cash Value"      value={MOCK_PORTFOLIO_STATS.cashBalance} censored={censored} />
        </div>
      </SectionCard>

      {/* â”€â”€ Document Verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <SectionCard id="document-verification" title="Document Verification">
        <div className="grid grid-cols-2 gap-5">

          {/* KYC â€” tri-state: due | processing | verified */}
          <div className={clsx(
            "rounded-lg p-5 flex flex-col gap-4 border transition-colors duration-300",
            kycStatus === "verified"   && "bg-success-container border-success/25",
            kycStatus === "processing" && "bg-surface-lowest border-outline-variant",
            kycStatus === "due"        && "bg-warning-container border-warning/25",
          )}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield
                  size={18} strokeWidth={1.75}
                  className={clsx(
                    "shrink-0",
                    kycStatus === "verified"   && "text-success",
                    kycStatus === "processing" && "text-primary",
                    kycStatus === "due"        && "text-warning",
                  )}
                />
                <span className="text-body-sm font-bold text-on-surface">KYC Document Status</span>
              </div>
              {kycStatus === "verified" && (
                <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border badge-success">
                  Verified
                </span>
              )}
              {kycStatus === "processing" && (
                <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border badge-caution">
                  Processing
                </span>
              )}
              {kycStatus === "due" && (
                <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border badge-warning">
                  Due in 10 days
                </span>
              )}
            </div>
            <p className="text-body-sm text-secondary leading-relaxed">
              {kycStatus === "verified"
                ? "Your KYC document has been successfully verified and is up to date. No further action is required at this time."
                : kycStatus === "processing"
                ? "Your KYC document is currently under review. This process typically takes 1â€“3 business days. You will be notified once verified."
                : "Your annual Know Your Customer (KYC) renewal is required to maintain full account access. Please upload a valid government ID and proof of address."}
            </p>
            <p className="text-body-sm text-on-surface">
              {kycStatus === "verified" && (
                <>Next Renewal Due: <span className="text-success font-bold">25 Oct 2024</span></>
              )}
              {kycStatus === "processing" && (
                <span className="text-secondary">Submitted: 18 May 2026</span>
              )}
              {kycStatus === "due" && (
                <>Annual Update Due: <span className="text-warning font-bold">25 Oct 2023</span></>
              )}
            </p>
            {kycStatus === "verified" && (
              <button type="button" className="w-full border border-success/30 text-success-on-container font-bold text-body-sm rounded-lg py-3 hover:bg-success-container transition-colors">
                View Document
              </button>
            )}
            {kycStatus === "processing" && (
              <button type="button" onClick={()=>downloadAs("/dummy-KYC-Report.pdf", "KYC-Report.pdf")} className="w-full border border-outline-variant font-bold text-body-sm rounded-lg py-3 hover:bg-secondary/5 transition-colors">
                View KYC Document
              </button>
            )}
            {kycStatus === "due" && (
              <button
                type="button"
                onClick={() => setKycOpen(true)}
                className="w-full bg-warning text-white font-bold text-body-sm rounded-lg py-3 hover:opacity-90 transition-opacity"
              >
                Upload KYC
              </button>
            )}
          </div>

          {/* AML â€” verified */}
          <div className="bg-surface-lowest border border-outline-variant rounded-lg p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Zap size={18} strokeWidth={1.75} className="text-primary shrink-0" />
                <span className="text-body-sm font-bold text-on-surface">AML Document Status</span>
              </div>
              <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border badge-success">
                Verified
              </span>
            </div>
            <p className="text-body-sm text-secondary leading-relaxed">
              Anti-Money Laundering (AML) declaration is current. Next reporting cycle begins Oct
              2024. No immediate action required.
            </p>
            <p className="text-body-sm text-secondary">Annual Update Due: 13th Sept 2023</p>
            <button type="button" onClick={()=>downloadAs("/dummy-AML-Report.pdf", "AML-Report.pdf")} className="w-full border border-outline-variant font-bold text-body-sm rounded-lg py-3 hover:bg-secondary/5 transition-colors">
              View AML Document
            </button>
          </div>
        </div>
      </SectionCard>

      {kycOpen && (
        <KycUploadModal
          onClose={() => setKycOpen(false)}
          onSuccess={() => { applyKycStatus("processing"); setKycOpen(false); }}
        />
      )}
    </div>
  );
}
