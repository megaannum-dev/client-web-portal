"use client";

import { useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Ticket,
  X,
} from "@/lib/icons";
import {
  submitAllotmentRequest,
  submitRedemptionRequest,
  submitOtherTicket,
} from "@/lib/mock/store";
import {
  MOCK_RECOMMENDED_MODELS,
  MOCK_SUBSCRIBED_MODELS,
  MOCK_PORTFOLIO_STATS,
  SUPPORTING_DOC_CATEGORIES,
  type AllotmentRequest,
  type SubscribedModel,
  type RecommendedModel,
} from "@/lib/mock/data";

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
  onConfirm: (req: AllotmentRequest) => void;
}) {
  const { t } = useTranslation();
  const [selectedModel, setSelectedModel] = useState<RecommendedModel | null>(null);
  const [amount,        setAmount]        = useState("");
  const [multiplier,    setMultiplier]    = useState("1.0");
  const cashOption = t("ticket.cash_balance", { amount: MOCK_PORTFOLIO_STATS.cashBalance });
  const [fundingSource, setFundingSource] = useState(cashOption);
  const [confirmed,     setConfirmed]     = useState(false);
  const [errors,        setErrors]        = useState<Record<string, string>>({});

  const RISK_LABEL: Record<"High" | "Medium" | "Low", { text: string; cls: string }> = {
    High:   { text: t("ticket.risk_high"),   cls: "text-warning" },
    Medium: { text: t("ticket.risk_medium"), cls: "text-caution" },
    Low:    { text: t("ticket.risk_low"),    cls: "text-success"  },
  };

  const minAmt = selectedModel ? parseFloat(selectedModel.minInvestment.replace(/[$,]/g, "")) : 0;

  function validate() {
    const e: Record<string, string> = {};
    if (!selectedModel)                                          e.model     = t("ticket.errors.select_model");
    const amt = parseFloat(amount);
    const mul = parseFloat(multiplier);
    if (!amount || isNaN(amt) || amt <= 0)                      e.amount     = t("ticket.errors.valid_amount");
    else if (selectedModel && amt < minAmt)                      e.amount     = t("ticket.errors.minimum_allotment", { amount: selectedModel.minInvestment });
    if (!multiplier || isNaN(mul) || mul <= 0)                  e.multiplier = t("ticket.errors.valid_multiplier");
    if (!confirmed)                                              e.confirmed  = t("ticket.errors.confirm_rm");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate() || !selectedModel) return;
    const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parseFloat(amount));
    const id  = submitAllotmentRequest({ model: selectedModel.name, amount: fmt });
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    onConfirm({ id, type: "Allotment", model: selectedModel.name, amount: fmt, date, status: "Sent" });
  }

  return (
    <div className="px-6 py-5 flex flex-col gap-5">

      {/* Model selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.select_model")}</label>
        <div className="relative">
          <select
            value={selectedModel?.name ?? ""}
            onChange={(e) => {
              const m = MOCK_RECOMMENDED_MODELS.find((x) => x.name === e.target.value) ?? null;
              setSelectedModel(m);
              setErrors((p) => ({ ...p, model: "" }));
            }}
            className={fieldCls(errors.model)}
          >
            <option value="">{t("ticket.select_model_placeholder")}</option>
            {MOCK_RECOMMENDED_MODELS.map((m) => (
              <option key={m.name} value={m.name}>{m.name} ({m.symbol})</option>
            ))}
          </select>
        </div>
        {errors.model && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.model}</p>}
      </div>

      {/* Model detail card */}
      {selectedModel && (
        <div className="bg-surface-container rounded-xl px-4 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-body-sm font-bold text-on-surface">{selectedModel.name}</p>
            <p className="text-label-md text-secondary mt-0.5">{selectedModel.assetClass}</p>
          </div>
          <span className={`text-[11px] font-extrabold tracking-wide ${RISK_LABEL[selectedModel.risk].cls}`}>
            {RISK_LABEL[selectedModel.risk].text}
          </span>
        </div>
      )}

      {/* Amount */}
      <div className="flex flex-col gap-1.5">
        <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.amount")}</label>
        <input type="number" min={0} placeholder="0.00" value={amount}
          onChange={(e) => { setAmount(e.target.value); setErrors((p) => ({ ...p, amount: "" })); }}
          className={fieldCls(errors.amount)} />
        {errors.amount
          ? <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.amount}</p>
          : selectedModel && <p className="flex items-center gap-1 text-[11px] text-secondary"><AlertCircle size={11} strokeWidth={1.75} />{t("ticket.minimum_allotment", { amount: selectedModel.minInvestment })}</p>
        }
      </div>

      {/* Multiplier */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          {errors.weighting && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.weighting}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.multiplier")}</label>
          <input type="number" min={0} step={0.1} placeholder="1.0" value={multiplier}
            onChange={(e) => { setMultiplier(e.target.value); setErrors((p) => ({ ...p, multiplier: "" })); }}
            className={fieldCls(errors.multiplier)} />
          {errors.multiplier && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.multiplier}</p>}
        </div>
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

      {/* Confirmation checkbox */}
      <div className="flex flex-col gap-1.5">
        <label className={`flex items-start gap-3 cursor-pointer select-none ${errors.confirmed ? "text-red-600" : "text-secondary"}`}>
          <input type="checkbox" checked={confirmed}
            onChange={(e) => { setConfirmed(e.target.checked); setErrors((p) => ({ ...p, confirmed: "" })); }}
            className="mt-0.5 accent-primary w-4 h-4 shrink-0" />
          <span className="text-body-sm leading-relaxed">
            {t("ticket.confirm_rm_allotment")}
          </span>
        </label>
        {errors.confirmed && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600 ml-7"><AlertCircle size={11} strokeWidth={2} />{errors.confirmed}</p>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-outline-variant">
        <button type="button" onClick={onClose}
          className="px-5 py-2.5 text-body-sm font-semibold text-on-surface rounded-lg hover:bg-surface-container transition-colors">
          {t("common.cancel")}
        </button>
        <button type="button" onClick={handleSubmit}
          className="bg-primary text-white px-6 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity">
          {t("ticket.submit_allotment")}
        </button>
      </div>
    </div>
  );
}

// ── Redemption Form (inside RaiseTicketModal) ─────────────────────────────────

function RedemptionForm({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (req: AllotmentRequest) => void;
}) {
  const { t } = useTranslation();
  const [selectedModel, setSelectedModel] = useState<SubscribedModel | null>(null);
  const [redeemAll,  setRedeemAll]  = useState(false);
  const [amount,     setAmount]     = useState("");
  const [returnTo,   setReturnTo]   = useState("Cash Balance");
  const [confirmed,  setConfirmed]  = useState(false);
  const [errors,     setErrors]     = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!selectedModel) e.model = t("ticket.errors.select_model");
    if (!redeemAll) {
      const amt = parseFloat(amount);
      if (!amount || isNaN(amt) || amt <= 0) e.amount = t("ticket.errors.valid_redemption_amount");
    }
    if (!confirmed) e.confirmed = t("ticket.errors.confirm_rm");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate() || !selectedModel) return;
    const rawAmt = redeemAll
      ? selectedModel.amount
      : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parseFloat(amount));
    const id   = submitRedemptionRequest({ model: selectedModel.name, amount: rawAmt, redeemAll });
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    onConfirm({ id, type: "Redemption", model: selectedModel.name, amount: rawAmt, date, status: "Sent" });
  }

  return (
    <div className="px-6 py-5 flex flex-col gap-5">

      {/* Model selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.select_subscribed_model")}</label>
        <select
          value={selectedModel?.name ?? ""}
          onChange={(e) => {
            const m = MOCK_SUBSCRIBED_MODELS.find((x) => x.name === e.target.value) ?? null;
            setSelectedModel(m);
            setErrors((p) => ({ ...p, model: "" }));
          }}
          className={fieldCls(errors.model)}
        >
          <option value="">{t("ticket.select_subscribed_placeholder")}</option>
          {MOCK_SUBSCRIBED_MODELS.map((m) => (
            <option key={m.name} value={m.name}>{m.name} ({m.symbol}) · {m.amount}</option>
          ))}
        </select>
        {errors.model && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.model}</p>}
      </div>

      {/* Selected model card */}
      {selectedModel && (
        <div className="bg-surface-container rounded-xl px-4 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary mb-0.5">{t("ticket.selected_model")}</p>
            <p className="text-body-sm font-bold text-on-surface">{selectedModel.name}</p>
          </div>
          <span className="text-[15px] font-bold text-primary">{selectedModel.amount}</span>
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
                  onChange={() => { setRedeemAll(opt.id === "Redeem All"); setErrors((p) => ({ ...p, amount: "" })); }}
                  className="accent-primary w-4 h-4 shrink-0" />
                {opt.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Redemption Amount */}
      <div className="flex flex-col gap-1.5">
        <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.redemption_amount")}</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-body-sm select-none">$</span>
          <input type="number" min={0} placeholder="0.00" value={redeemAll ? "" : amount} disabled={redeemAll}
            onChange={(e) => { setAmount(e.target.value); setErrors((p) => ({ ...p, amount: "" })); }}
            className={clsx("pl-7 disabled:bg-surface-container disabled:text-secondary disabled:cursor-not-allowed", fieldCls(errors.amount))} />
        </div>
        {errors.amount && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.amount}</p>}
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

      {/* Confirmation checkbox */}
      <div className="flex flex-col gap-1.5">
        <label className={`flex items-start gap-3 cursor-pointer select-none ${errors.confirmed ? "text-red-600" : "text-secondary"}`}>
          <input type="checkbox" checked={confirmed}
            onChange={(e) => { setConfirmed(e.target.checked); setErrors((p) => ({ ...p, confirmed: "" })); }}
            className="mt-0.5 accent-primary w-4 h-4 shrink-0" />
          <span className="text-body-sm leading-relaxed">
            {t("ticket.confirm_rm_redemption")}
          </span>
        </label>
        {errors.confirmed && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600 ml-7"><AlertCircle size={11} strokeWidth={2} />{errors.confirmed}</p>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-outline-variant">
        <button type="button" onClick={onClose}
          className="px-5 py-2.5 text-body-sm font-semibold text-on-surface rounded-lg hover:bg-surface-container transition-colors">
          {t("common.cancel")}
        </button>
        <button type="button" onClick={handleSubmit}
          className="bg-primary text-white px-6 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity">
          {t("ticket.submit_redemption")}
        </button>
      </div>
    </div>
  );
}

// ── Others Form (inside RaiseTicketModal) ─────────────────────────────────────

function OthersForm({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (req: AllotmentRequest) => void;
}) {
  const { t } = useTranslation();
  const [subject,     setSubject]     = useState("");
  const [category,    setCategory]    = useState<string>(SUPPORTING_DOC_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [confirmed,   setConfirmed]   = useState(false);
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!subject.trim())     e.subject     = t("ticket.errors.enter_subject");
    if (!description.trim()) e.description = t("ticket.errors.describe_request");
    if (!confirmed)          e.confirmed   = t("ticket.errors.confirm_reviewed");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const id   = submitOtherTicket({ subject: subject.trim(), category, description: description.trim() });
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    onConfirm({ id, type: "Others", model: subject.trim() || t("ticket.general_inquiry"), amount: "—", date, status: "Sent", subject: subject.trim() });
  }

  return (
    <div className="px-6 py-5 flex flex-col gap-5">

      {/* Category */}
      <div className="flex flex-col gap-1.5">
        <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.category")}</label>
        <div className="relative">
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className={fieldCls()}>
            {SUPPORTING_DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary">▾</span>
        </div>
      </div>

      {/* Subject */}
      <div className="flex flex-col gap-1.5">
        <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.subject")}</label>
        <input type="text" placeholder={t("ticket.subject_placeholder")} value={subject}
          onChange={(e) => { setSubject(e.target.value); setErrors((p) => ({ ...p, subject: "" })); }}
          className={fieldCls(errors.subject)} />
        {errors.subject && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.subject}</p>}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">{t("ticket.description")}</label>
        <textarea rows={4} placeholder={t("ticket.description_placeholder")} value={description}
          onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: "" })); }}
          className={clsx("resize-none", fieldCls(errors.description))} />
        {errors.description && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.description}</p>}
      </div>

      {/* Confirmation */}
      <div className="flex flex-col gap-1.5">
        <label className={`flex items-start gap-3 cursor-pointer select-none ${errors.confirmed ? "text-red-600" : "text-secondary"}`}>
          <input type="checkbox" checked={confirmed}
            onChange={(e) => { setConfirmed(e.target.checked); setErrors((p) => ({ ...p, confirmed: "" })); }}
            className="mt-0.5 accent-primary w-4 h-4 shrink-0" />
          <span className="text-body-sm leading-relaxed">
            {t("ticket.confirm_others")}
          </span>
        </label>
        {errors.confirmed && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600 ml-7"><AlertCircle size={11} strokeWidth={2} />{errors.confirmed}</p>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-outline-variant">
        <button type="button" onClick={onClose}
          className="px-5 py-2.5 text-body-sm font-semibold text-on-surface rounded-lg hover:bg-surface-container transition-colors">
          {t("common.cancel")}
        </button>
        <button type="button" onClick={handleSubmit}
          className="bg-primary text-white px-6 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity">
          {t("ticket.submit_ticket")}
        </button>
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
  onConfirm: (req: AllotmentRequest) => void;
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
