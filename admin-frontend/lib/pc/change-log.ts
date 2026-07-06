import type { ChangeEntry } from "./types";
import { fmtMoney } from "./format";

interface FieldDiff {
  name: string;
  before?: unknown;
  after?: unknown;
  // Long-text fields (description/underlyings/risk) omit before/after and
  // just flag that the value changed — see _LONG_TEXT_FIELDS in the
  // backend's ModelService._diff_field.
  changed?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  size: "Model size",
  model_size: "Model size",
  category: "Category",
  subscription_redemption: "Subscription / Redemption",
  symbols: "Symbols",
  mgmt: "Mgmt fee %",
  incentive: "Incentive fee %",
  description: "Description",
  underlyings: "Underlyings",
  risk: "Risk",
  liquidity: "Liquidity",
  reporting: "Reporting",
  nav_perf: "NAV performance",
  mgmt_fee: "Management fee",
  incentive_fee: "Incentive fee",
};

function fieldLabel(raw: string): string {
  return FIELD_LABELS[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtValue(v: unknown): string {
  if (typeof v === "number") return fmtMoney(v);
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v ?? "—");
}

/** Render a change-log entry as an array of display lines (one per field). */
export function renderChangeLines(c: ChangeEntry): string[] {
  switch (c.kind) {
    case "created":
      return ["Model created"];

    case "published":
      return ["Published to live"];

    case "material_uploaded": {
      const d = c.detail as { filename?: string; version?: string };
      const fname = d.filename ?? "file";
      const ver = d.version ?? c.ver;
      return [`Uploaded ${fname} (${ver})`];
    }

    case "edited": {
      const d = c.detail as { fields?: FieldDiff[] };
      if (!d.fields?.length) return ["Model updated"];
      return d.fields.map((f) =>
        f.changed
          ? `${fieldLabel(f.name)} updated`
          : `${fieldLabel(f.name)}: ${fmtValue(f.before)} → ${fmtValue(f.after)}`
      );
    }

    default:
      return [c.kind];
  }
}

/** @deprecated Use renderChangeLines for multi-line rendering. */
export function renderChange(c: ChangeEntry): string {
  return renderChangeLines(c).join("; ");
}
