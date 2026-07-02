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

function fmtValue(v: unknown): string {
  if (typeof v === "number") return fmtMoney(v);
  return String(v ?? "—");
}

/** Render a change-log entry to a display string using per-kind templates. */
export function renderChange(c: ChangeEntry): string {
  switch (c.kind) {
    case "created":
      return "Model created";

    case "published":
      return "Published to live";

    case "material_uploaded": {
      const d = c.detail as { filename?: string; version?: string };
      const fname = d.filename ?? "file";
      const ver = d.version ?? c.ver;
      return `Uploaded ${fname} (${ver})`;
    }

    case "edited": {
      const d = c.detail as { fields?: FieldDiff[] };
      if (!d.fields?.length) return "Model updated";
      return d.fields
        .map((f) => (f.changed ? `${f.name} updated` : `${f.name} ${fmtValue(f.before)} → ${fmtValue(f.after)}`))
        .join("; ");
    }

    default:
      return c.kind;
  }
}
