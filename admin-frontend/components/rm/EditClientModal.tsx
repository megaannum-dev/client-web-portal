"use client";

/* ============================================================
   RM -- "Edit profile" modal (Client Detail screen). Plain-field
   form over the 11 PATCH-able client fields (address/country/
   authorized-person + the 8 "Further Information" fields). Sends a
   diff-only PATCH -- mirrors EditModelForm.tsx's buildPatch()
   pattern, adapted to flat string fields instead of that file's
   model-specific shape.
   ============================================================ */

import { useState, type ChangeEvent, type ReactNode } from "react";
import clsx from "clsx";
import { Modal } from "@/components/rm/Shared";
import { Button } from "@/components/ui/Button";
import { Check } from "@/lib/icons";
import { useCanEdit } from "@/hooks/usePageAccess";
import type { ClientRow, ClientPatchReq } from "@/lib/rm/clients";

const inputCls =
  "h-10 w-full rounded border border-outline-variant bg-white px-3 text-[14px] font-semibold text-on-surface outline-none placeholder:font-normal placeholder:text-secondary focus:border-primary";
const textAreaCls = clsx(inputCls, "h-auto min-h-[84px] resize-y py-2.5");

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{label}</span>
      {children}
    </label>
  );
}

/** The 11 fields this modal edits, out of the full ClientRow. */
type EditableFields = Pick<
  ClientRow,
  | "address" | "countryOfResidence" | "occupation" | "anniversary"
  | "spouseName" | "children" | "personalInterests" | "communicationPreferences"
  | "giftHospitalityPreferences" | "relationshipNotes"
>;

type FormState = { [K in keyof EditableFields]: string };

// camelCase form key -> snake_case wire field (ClientPatchReq), matching
// lib/rm/clients.ts's dtoToRow snake<->camel convention 1:1.
const PATCH_KEY: Record<keyof FormState, keyof ClientPatchReq> = {
  address: "address",
  countryOfResidence: "country_of_residence",
  occupation: "occupation",
  anniversary: "anniversary",
  spouseName: "spouse_name",
  children: "children",
  personalInterests: "personal_interests",
  communicationPreferences: "communication_preferences",
  giftHospitalityPreferences: "gift_hospitality_preferences",
  relationshipNotes: "relationship_notes",
};

function toFormState(client: EditableFields): FormState {
  return {
    address: client.address ?? "",
    countryOfResidence: client.countryOfResidence ?? "",
    occupation: client.occupation ?? "",
    anniversary: client.anniversary ?? "",
    spouseName: client.spouseName ?? "",
    children: client.children ?? "",
    personalInterests: client.personalInterests ?? "",
    communicationPreferences: client.communicationPreferences ?? "",
    giftHospitalityPreferences: client.giftHospitalityPreferences ?? "",
    relationshipNotes: client.relationshipNotes ?? "",
  };
}

export function EditClientModal({
  client, onClose, onSave,
}: {
  client: EditableFields;
  onClose: () => void;
  onSave: (patch: ClientPatchReq) => Promise<{ success: boolean; error?: string }>;
}) {
  const initial = toFormState(client);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const canEdit = useCanEdit("rm.client-info");

  const set = (k: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Only send fields the user actually changed (mirrors EditModelForm.tsx's buildPatch).
  const buildPatch = (): ClientPatchReq => {
    const patch: ClientPatchReq = {};
    (Object.keys(form) as (keyof FormState)[]).forEach((k) => {
      const trimmed = form[k].trim();
      if (trimmed !== initial[k]) {
        patch[PATCH_KEY[k]] = trimmed === "" ? null : trimmed;
      }
    });
    return patch;
  };

  const save = async () => {
    if (saving) return;
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setInlineError(null);
    setSaving(true);
    const result = await onSave(patch);
    setSaving(false);
    if (result.success) onClose();
    else setInlineError(result.error ?? "Failed to save changes");
  };

  return (
    <Modal
      title="Edit Profile"
      subtitle="Update client information and relationship details."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="mr-auto">Cancel</Button>
          {/* View/Edit Gate Function */}
          {canEdit && (
            <Button icon={Check} disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Address">
          <input className={inputCls} value={form.address} onChange={set("address")} />
        </Field>
        <Field label="Country of Residence">
          <input className={inputCls} value={form.countryOfResidence} onChange={set("countryOfResidence")} />
        </Field>
        <Field label="Occupation">
          <input className={inputCls} value={form.occupation} onChange={set("occupation")} />
        </Field>
        <Field label="Anniversary">
          <input type="date" className={inputCls} value={form.anniversary} onChange={set("anniversary")} />
        </Field>
        <Field label="Spouse's Name">
          <input className={inputCls} value={form.spouseName} onChange={set("spouseName")} />
        </Field>
        <div className="col-span-2">
          <Field label="Children's Names and Ages">
            <textarea className={textAreaCls} value={form.children} onChange={set("children")} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Personal Interests">
            <textarea className={textAreaCls} value={form.personalInterests} onChange={set("personalInterests")} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Communication Preferences">
            <textarea className={textAreaCls} value={form.communicationPreferences} onChange={set("communicationPreferences")} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Gift / Hospitality Preferences">
            <textarea className={textAreaCls} value={form.giftHospitalityPreferences} onChange={set("giftHospitalityPreferences")} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Other Relationship Notes">
            <textarea className={textAreaCls} value={form.relationshipNotes} onChange={set("relationshipNotes")} />
          </Field>
        </div>
        {inlineError && (
          <p className="col-span-2 text-[13px] font-semibold text-red-600">{inlineError}</p>
        )}
      </div>
    </Modal>
  );
}
