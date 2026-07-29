"use client";

import { useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Ticket,
  X,
} from "@/lib/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePortfolio } from "@/lib/hooks/usePortfolio";
import { useRecommendedModels } from "@/lib/hooks/useRecommendedModels";
import { submitTicket, type ClientRequestDTO, type RaiseTicketReq } from "@/lib/api/tickets";
import type { RecommendedModelDTO } from "@/lib/api/models";
import type { PositionDTO } from "@/lib/api/portfolio";

const currencyFmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

// ── Shared form utilities ─────────────────────────────────────────────────────

function fieldCls(err?: string) {
  return clsx(
    "w-full border rounded-lg px-3 py-2.5 text-body-sm text-on-surface bg-white",
    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors",
    err ? "border-red-400" : "border-outline-variant",
  );
}

// ── Allotment Form (inside RaiseTicketModal) ──────────────────────────────────

function AllotmentForm({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (req: ClientRequestDTO) => void;
}) {
  const { t } = useTranslation();
  const { getIdToken } = useAuth();
  const { data: models } = useRecommendedModels(true);
  const { data: portfolio } = usePortfolio();
  const [selectedModel, setSelectedModel] = useState<RecommendedModelDTO | null>(null);
  const [multiplier,    setMultiplier]    = useState("1.0");
  const cashOption = t("ticket.cash_balance", {
    amount: portfolio ? currencyFmt(portfolio.cash_deposit) : "—",
  });
  const [fundingSource, setFundingSource] = useState(cashOption);
  const [subject,       setSubject]       = useState("");
  const [description,   setDescription]  = useState("");
  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [submitError,   setSubmitError]   = useState<string | null>(null);
  const [submitting,    setSubmitting]    = useState(false);

  const notional = (selectedModel?.model_size ?? 0) * (parseFloat(multiplier) || 0);

  function validate() {
    const e: Record<string, string> = {};
    if (!selectedModel)                          e.model      = t("ticket.errors.select_model");
    const mul = parseFloat(multiplier);
    if (!multiplier || isNaN(mul) || mul <= 0)   e.multiplier = t("ticket.errors.valid_multiplier");
    if (!subject.trim())                         e.subject    = t("ticket.errors.enter_subject");
    if (!description.trim())                     e.description = t("ticket.errors.describe_request");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || !selectedModel) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const req: RaiseTicketReq = {
        kind: "allotment",
        model_id: selectedModel.model_id,
        amount: notional,
        multiplier: parseFloat(multiplier),
        subject: subject.trim(),
        message: description.trim(),
      };
      const dto = await submitTicket(token, req);
      onConfirm(dto);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-6 py-5 flex flex-col gap-5">

      {/* Model selector */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="allotment-model" className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.select_model")}</label>
        <div className="relative">
          <select
            id="allotment-model"
            value={selectedModel?.name ?? ""}
            onChange={(e) => {
              const m = models.find((x) => x.name === e.target.value) ?? null;
              setSelectedModel(m);
              setErrors((p) => ({ ...p, model: "" }));
            }}
            className={fieldCls(errors.model)}
            aria-invalid={!!errors.model}
            aria-describedby={errors.model ? "allotment-model-error" : undefined}
          >
            <option value="">{t("ticket.select_model_placeholder")}</option>
            {models.map((m) => (
              <option key={m.model_id} value={m.name}>{m.name}</option>
            ))}
          </select>
        </div>
        {errors.model && <p id="allotment-model-error" role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.model}</p>}
      </div>

      {/* Multiplier */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="allotment-multiplier" className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.multiplier")}</label>
        <input id="allotment-multiplier" type="number" min={0} step={0.1} placeholder="1.0" value={multiplier}
          onChange={(e) => { setMultiplier(e.target.value); setErrors((p) => ({ ...p, multiplier: "" })); }}
          className={fieldCls(errors.multiplier)}
          aria-invalid={!!errors.multiplier}
          aria-describedby={errors.multiplier ? "allotment-multiplier-error" : undefined} />
        {errors.multiplier && <p id="allotment-multiplier-error" role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.multiplier}</p>}
      </div>

      {/* Computed notional summary */}
      <div className="bg-surface-container rounded-lg border border-outline-variant px-4 py-3.5 flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-body-sm text-on-surface">
          <BarChart2 size={13} strokeWidth={1.75} className="text-secondary shrink-0" />
          <span className="text-secondary">{t("ticket.model_size")}: </span>
          <span className="font-semibold">{currencyFmt(selectedModel?.model_size ?? 0)}</span>
        </p>
        <p className="text-body-sm text-on-surface">
          <span className="text-secondary">{t("ticket.notional")}: </span>
          <span className="font-bold text-primary text-[15px]">{currencyFmt(notional)}</span>
        </p>
      </div>

      {/* Funding Source */}
      <div className="flex flex-col gap-1.5">
        <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.funding_source")}</label>
        <div className="relative">
          <select value={fundingSource} onChange={(e) => setFundingSource(e.target.value)}
            className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-sm text-on-surface bg-white appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer">
            <option>{cashOption}</option>
            <option>{t("ticket.external_transfer")}</option>
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary">▾</span>
        </div>
      </div>

      {/* Subject */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="allotment-subject" className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.subject")}</label>
        <input id="allotment-subject" type="text" placeholder={t("ticket.subject_placeholder")} value={subject}
          onChange={(e) => { setSubject(e.target.value); setErrors((p) => ({ ...p, subject: "" })); }}
          className={fieldCls(errors.subject)}
          aria-invalid={!!errors.subject}
          aria-describedby={errors.subject ? "allotment-subject-error" : undefined} />
        {errors.subject && <p id="allotment-subject-error" role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.subject}</p>}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="allotment-description" className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.description")}</label>
        <textarea id="allotment-description" rows={4} placeholder={t("ticket.description_placeholder")} value={description}
          onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: "" })); }}
          className={clsx("resize-none", fieldCls(errors.description))}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? "allotment-description-error" : undefined} />
        {errors.description && <p id="allotment-description-error" role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.description}</p>}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant">
        {submitError && <p role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{submitError}</p>}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-body-sm font-semibold text-on-surface rounded-lg hover:bg-surface-container transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting}
            className="bg-primary text-white px-6 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40">
            {t("ticket.submit_allotment")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Redemption Form (inside RaiseTicketModal) ─────────────────────────────────

function RedemptionForm({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (req: ClientRequestDTO) => void;
}) {
  const { t } = useTranslation();
  const { getIdToken } = useAuth();
  const { data: portfolio } = usePortfolio();
  const positions = portfolio?.positions ?? [];
  const [selectedModel, setSelectedModel] = useState<PositionDTO | null>(null);
  const [redeemAll,   setRedeemAll]   = useState(false);
  const [multiplier,  setMultiplier]  = useState("1.0");
  const [returnTo,    setReturnTo]    = useState("Cash Balance");
  const [subject,     setSubject]     = useState("");
  const [description, setDescription] = useState("");
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  const notional = redeemAll
    ? (selectedModel?.amount ?? 0)
    : (selectedModel?.model_size ?? 0) * (parseFloat(multiplier) || 0);

  function validate() {
    const e: Record<string, string> = {};
    if (!selectedModel) e.model = t("ticket.errors.select_model");
    if (!redeemAll) {
      const mul = parseFloat(multiplier);
      if (!multiplier || isNaN(mul) || mul <= 0) e.multiplier = t("ticket.errors.valid_multiplier");
    }
    if (!subject.trim())     e.subject     = t("ticket.errors.enter_subject");
    if (!description.trim()) e.description = t("ticket.errors.describe_request");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || !selectedModel) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const req: RaiseTicketReq = {
        kind: "redemption",
        model_id: selectedModel.model_id,
        amount: notional,
        subject: subject.trim(),
        message: description.trim(),
      };
      const dto = await submitTicket(token, req);
      onConfirm(dto);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-6 py-5 flex flex-col gap-5">

      {/* Model selector */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="redemption-model" className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.select_subscribed_model")}</label>
        <select
          id="redemption-model"
          value={selectedModel?.model_name ?? ""}
          onChange={(e) => {
            const m = positions.find((x) => x.model_name === e.target.value) ?? null;
            setSelectedModel(m);
            setErrors((p) => ({ ...p, model: "" }));
          }}
          className={fieldCls(errors.model)}
          aria-invalid={!!errors.model}
          aria-describedby={errors.model ? "redemption-model-error" : undefined}
        >
          <option value="">{t("ticket.select_subscribed_placeholder")}</option>
          {positions.map((m) => (
            <option key={m.model_id} value={m.model_name}>{m.model_name}</option>
          ))}
        </select>
        {errors.model && <p id="redemption-model-error" role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.model}</p>}
      </div>

      {/* Selected model card */}
      {selectedModel && (
        <div className="bg-surface-container rounded-xl px-4 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary mb-0.5">{t("ticket.selected_model")}</p>
            <p className="text-body-sm font-bold text-on-surface">{selectedModel.model_name}</p>
          </div>
          <span className="text-[15px] font-bold text-primary">{currencyFmt(selectedModel.amount)}</span>
        </div>
      )}

      {/* Redemption Type */}
      <div className="flex flex-col gap-2">
        <p className="text-body-sm font-semibold text-on-surface">{t("ticket.redemption_type")}</p>
        <div className="flex gap-3">
          {([
            { id: "Partial Redemption", label: t("ticket.partial_redemption") },
            { id: "Redeem All",         label: t("ticket.redeem_all") },
          ] as const).map((opt) => {
            const active = (opt.id === "Redeem All") === redeemAll;
            return (
              <label key={opt.id}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer text-body-sm font-semibold transition-colors select-none",
                  active ? "border-primary bg-primary/5 text-on-surface" : "border-outline-variant text-secondary hover:border-primary/50",
                )}>
                <input type="radio" name="redemptionType" checked={active}
                  onChange={() => { setRedeemAll(opt.id === "Redeem All"); setErrors((p) => ({ ...p, multiplier: "" })); }}
                  className="accent-primary w-4 h-4 shrink-0" />
                {opt.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Multiplier */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="redemption-multiplier" className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.multiplier")}</label>
        <input id="redemption-multiplier" type="number" min={0} step={0.1} placeholder="1.0" value={redeemAll ? "" : multiplier} disabled={redeemAll}
          onChange={(e) => { setMultiplier(e.target.value); setErrors((p) => ({ ...p, multiplier: "" })); }}
          className={clsx("disabled:bg-surface-container disabled:text-secondary disabled:cursor-not-allowed", fieldCls(errors.multiplier))}
          aria-invalid={!!errors.multiplier}
          aria-describedby={errors.multiplier ? "redemption-multiplier-error" : undefined} />
        {errors.multiplier && <p id="redemption-multiplier-error" role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.multiplier}</p>}
      </div>

      {/* Computed notional summary */}
      <div className="bg-surface-container rounded-lg border border-outline-variant px-4 py-3.5 flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-body-sm text-on-surface">
          <BarChart2 size={13} strokeWidth={1.75} className="text-secondary shrink-0" />
          <span className="text-secondary">{t("ticket.model_size")}: </span>
          <span className="font-semibold">{currencyFmt(selectedModel?.model_size ?? 0)}</span>
        </p>
        <p className="text-body-sm text-on-surface">
          <span className="text-secondary">{t("ticket.notional")}: </span>
          <span className="font-bold text-primary text-[15px]">{currencyFmt(notional)}</span>
        </p>
      </div>

      {/* Returning To */}
      <div className="flex flex-col gap-1.5">
        <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.returning_to")}</label>
        <div className="relative">
          <select value={returnTo} onChange={(e) => setReturnTo(e.target.value)}
            className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-sm text-on-surface bg-white appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer">
            <option>{t("portfolio.cash")}</option>
            <option>{t("ticket.external_transfer")}</option>
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary">▾</span>
        </div>
      </div>

      <p className="flex items-center gap-2 text-[12px] text-secondary">
        <AlertCircle size={14} strokeWidth={1.75} className="shrink-0" />
        {t("ticket.redemption_processing_note")}
      </p>

      {/* Subject */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="redemption-subject" className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.subject")}</label>
        <input id="redemption-subject" type="text" placeholder={t("ticket.subject_placeholder")} value={subject}
          onChange={(e) => { setSubject(e.target.value); setErrors((p) => ({ ...p, subject: "" })); }}
          className={fieldCls(errors.subject)}
          aria-invalid={!!errors.subject}
          aria-describedby={errors.subject ? "redemption-subject-error" : undefined} />
        {errors.subject && <p id="redemption-subject-error" role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.subject}</p>}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="redemption-description" className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.description")}</label>
        <textarea id="redemption-description" rows={4} placeholder={t("ticket.description_placeholder")} value={description}
          onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: "" })); }}
          className={clsx("resize-none", fieldCls(errors.description))}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? "redemption-description-error" : undefined} />
        {errors.description && <p id="redemption-description-error" role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.description}</p>}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant">
        {submitError && <p role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{submitError}</p>}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-body-sm font-semibold text-on-surface rounded-lg hover:bg-surface-container transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting}
            className="bg-primary text-white px-6 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40">
            {t("ticket.submit_redemption")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Others Form (inside RaiseTicketModal) ─────────────────────────────────────

const OTHER_TICKET_CATEGORIES = ["Questionnaire", "Others"] as const;

function OthersForm({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (req: ClientRequestDTO) => void;
}) {
  const { t } = useTranslation();
  const { getIdToken } = useAuth();
  const [subject,     setSubject]     = useState("");
  const [category,    setCategory]    = useState<string>(OTHER_TICKET_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!subject.trim())     e.subject     = t("ticket.errors.enter_subject");
    if (!description.trim()) e.description = t("ticket.errors.describe_request");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const req: RaiseTicketReq = {
        kind: "other",
        subject: subject.trim(),
        category,
        message: description.trim(),
      };
      const dto = await submitTicket(token, req);
      onConfirm(dto);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-6 py-5 flex flex-col gap-5">

      {/* Category */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="others-category" className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.category")}</label>
        <div className="relative">
          <select id="others-category" value={category} onChange={(e) => setCategory(e.target.value)}
            className={fieldCls()}>
            {OTHER_TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary">▾</span>
        </div>
      </div>

      {/* Subject */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="others-subject" className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.subject")}</label>
        <input id="others-subject" type="text" placeholder={t("ticket.subject_placeholder")} value={subject}
          onChange={(e) => { setSubject(e.target.value); setErrors((p) => ({ ...p, subject: "" })); }}
          className={fieldCls(errors.subject)}
          aria-invalid={!!errors.subject}
          aria-describedby={errors.subject ? "others-subject-error" : undefined} />
        {errors.subject && <p id="others-subject-error" role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.subject}</p>}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="others-description" className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.description")}</label>
        <textarea id="others-description" rows={4} placeholder={t("ticket.description_placeholder")} value={description}
          onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: "" })); }}
          className={clsx("resize-none", fieldCls(errors.description))}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? "others-description-error" : undefined} />
        {errors.description && <p id="others-description-error" role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.description}</p>}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant">
        {submitError && <p role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{submitError}</p>}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-body-sm font-semibold text-on-surface rounded-lg hover:bg-surface-container transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting}
            className="bg-primary text-white px-6 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40">
            {t("ticket.submit_ticket")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Raise Ticket Modal ────────────────────────────────────────────────────────

type TicketType = "Allotment" | "Redemption" | "Others";

const TICKET_TYPES: { type: TicketType; labelKey: string; descKey: string; color: string }[] = [
  { type: "Allotment",  labelKey: "ticket.types.allotment_label",  descKey: "ticket.types.allotment_desc",  color: "text-primary"  },
  { type: "Redemption", labelKey: "ticket.types.redemption_label", descKey: "ticket.types.redemption_desc", color: "text-warning"  },
  { type: "Others",     labelKey: "ticket.types.others_label",     descKey: "ticket.types.others_desc",     color: "text-secondary" },
];

export function RaiseTicketModal({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (req: ClientRequestDTO) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep]             = useState<1 | 2>(1);
  const [ticketType, setTicketType] = useState<TicketType | null>(null);

  function handleTypeSelect(type: TicketType) {
    setTicketType(type);
    setStep(2);
  }

  const stepTitle = step === 1
    ? t("ticket.raise_ticket")
    : ticketType === "Allotment"  ? t("ticket.allotment_ticket")
    : ticketType === "Redemption" ? t("ticket.redemption_ticket")
    : t("ticket.others_ticket");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4 border-b border-outline-variant shrink-0">
          <div className="flex items-center gap-2.5">
            {step === 2 && (
              <button type="button" onClick={() => setStep(1)} aria-label={t("common.back")}
                className="p-1.5 rounded-lg text-secondary hover:bg-surface-container transition-colors">
                <ChevronLeft size={18} strokeWidth={2} />
              </button>
            )}
            <Ticket size={18} strokeWidth={1.75} className="text-primary" />
            <h2 className="text-[17px] font-bold text-on-surface">{stepTitle}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")}
            className="p-1.5 rounded-lg text-secondary hover:bg-surface-container hover:text-on-surface transition-colors shrink-0">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Step 1 — type selector */}
        {step === 1 && (
          <div className="px-6 py-6 flex flex-col gap-3">
            <p className="text-body-sm text-secondary mb-1">{t("ticket.select_type_prompt")}</p>
            {TICKET_TYPES.map(({ type, labelKey, descKey, color }) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeSelect(type)}
                className="flex items-center justify-between gap-4 w-full text-left px-5 py-4 rounded-xl border border-outline-variant hover:border-primary/50 hover:bg-primary/3 transition-all duration-150 group"
              >
                <div>
                  <p className={`text-body-sm font-bold ${color}`}>{t(labelKey)}</p>
                  <p className="text-label-md text-secondary mt-0.5 leading-relaxed">{t(descKey)}</p>
                </div>
                <ChevronRight size={16} strokeWidth={2} className="text-secondary shrink-0 group-hover:text-primary transition-colors" />
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — form */}
        {step === 2 && ticketType === "Allotment"  && <AllotmentForm  onClose={onClose} onConfirm={onConfirm} />}
        {step === 2 && ticketType === "Redemption" && <RedemptionForm onClose={onClose} onConfirm={onConfirm} />}
        {step === 2 && ticketType === "Others"     && <OthersForm     onClose={onClose} onConfirm={onConfirm} />}
      </div>
    </div>
  );
}
