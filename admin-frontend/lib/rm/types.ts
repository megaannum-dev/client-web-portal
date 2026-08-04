// FE-15 — relocated from lib/mock/rm-data.ts. These are real view types (not
// mock data) that happened to live in the mock file; this is their canonical
// home now. Shapes are unchanged from their original definitions.
import type { ChipTone } from "@/components/ui/Chip";

export type SummaryItem = { id: string; c: string; d?: string; s?: string; t: ChipTone };

/** Count-only row for the Open Requests card (dot + label + number, no navigation). */
export type CountItem = { id: string; c: string; n: number; t: "primary" | "muted" };

export type ClientDoc = { name: string; status: string; tone: ChipTone; icon: string };

export type HistoryEntry = { t: string; d: string; accent?: boolean; detail?: string[] };
