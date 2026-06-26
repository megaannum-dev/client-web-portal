import type { ChangeEntry } from "./types";
import { fmtMoney } from "./format";

interface FieldDiff {
  field: string;
  before: string;
  after: string;
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
        .map((f) => `${f.field} ${fmtValue(f.before)} → ${fmtValue(f.after)}`)
        .join("; ");
    }

    default:
      return c.kind;
  }
}
