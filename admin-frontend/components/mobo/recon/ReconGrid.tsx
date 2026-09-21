"use client";

/* ============================================================
   MOBO Trade Reconciliation — hierarchical/flat recon grid.

   Renders the Trade -> Order -> Execution tree from
   `lib/mobo/executions.ts`. Owns search/filter/hide/depth/sort/
   expansion state and hands a bound CSV-export closure up to the
   page via `onExportChange`.
   ============================================================ */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronRight, AlertCircle } from "@/lib/icons";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemCell } from "@/components/mobo/Shared";
import {
  RECON_COLUMNS, RECON_FILTERS, RECON_SEARCH_COLS, RECON_TXN_COLS,
  walkNodes,
  type ReconNode, type ReconColumn, type ReconColKey, brkKeysFor,
} from "@/lib/mobo/executions";
import { ReconToolbar } from "./Toolbar";
import { downloadReconCsv } from "@/lib/mobo/reconCsv";

export interface ReconGridProps {
  trades: ReconNode[];
  day: string | null;
  error: string | null;
  /** A refetch is in flight (e.g. the day was switched). `trades` still holds
   *  the PREVIOUS day's tree until it lands, so the body renders skeleton rows
   *  rather than data that belongs to a day the header no longer names. */
  loading?: boolean;
  onExportChange?: (run: (() => void) | null) => void;
}

/** Read a formatted display field off a node by column key. All ReconColKeys
 *  that participate in filter/search/sort-by-string map straight to a
 *  same-named string field on ReconNode. */
function fieldStr(n: ReconNode, key: ReconColKey): string {
  const v = (n as unknown as Record<string, unknown>)[key];
  return v == null ? "" : String(v);
}

/** A node survives the prune if it matches, or any descendant does — filtering
 *  to e.g. "system = IB" must not drop the trade/order rows that contain the
 *  matching IB records. Rebuilds `children` rather than mutating; a node that
 *  itself matched keeps ALL of its children untouched. */
function pruneTree(nodes: ReconNode[], q: string, filters: Record<string, string[]>): ReconNode[] {
  const qLower = q.toLowerCase();
  const selfMatch = (n: ReconNode): boolean => {
    for (const f of RECON_FILTERS) {
      const sel = filters[f.key];
      if (sel && sel.length > 0 && !sel.includes(fieldStr(n, f.key))) return false;
    }
    if (qLower) {
      const hay = RECON_SEARCH_COLS.map((k) => fieldStr(n, k)).join(" ").toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  };
  const walk = (nodes: ReconNode[]): ReconNode[] => {
    const out: ReconNode[] = [];
    for (const n of nodes) {
      const matched = selfMatch(n);
      const kids = matched ? n.children : walk(n.children);
      if (matched || kids.length > 0) out.push(matched ? n : { ...n, children: kids });
    }
    return out;
  };
  return walk(nodes);
}

/** Numeric columns compare on the raw `sort` fields; null always sorts last
 *  regardless of direction (checked before `dir` is applied). */
function compareNodes(a: ReconNode, b: ReconNode, col: ReconColumn, dir: 1 | -1): number {
  if (col.numeric || col.key === "txnTime") {
    const key = col.key as keyof ReconNode["sort"];
    const av = a.sort[key];
    const bv = b.sort[key];
    if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1;
    return (av - bv) * dir;
  }
  return fieldStr(a, col.key).localeCompare(fieldStr(b, col.key)) * dir;
}

interface DisplayRow {
  node: ReconNode;
  open: boolean;
  hasKids: boolean;
  groupStart: boolean;
}

function statusTone(node: ReconNode): ChipTone {
  if (node.level === 0) return node.status === "Break" ? "failed" : "active";
  if (node.missing) return "failed";
  if (!node.statusReal) return "neutral"; // only PC carries a real lifecycle status
  if (node.status === "Filled") return "active";
  if (node.status === "Canceled") return "failed";
  return "pending";
}

function CellValue({ node, col }: { node: ReconNode; col: ReconColumn }) {
  // A placeholder has no transaction-grain data at all — blank those columns
  // rather than showing a formatted "—" per field or (worse) a stale 0.
  if (node.missing && RECON_TXN_COLS.includes(col.key)) {
    return <span className="text-secondary">—</span>;
  }
  if (col.key === "system") return <SystemCell node={node} />;
  if (col.key === "status") {
    // `status` is the one break the red-text treatment cannot carry, because this
    // cell renders a chip. Recolour the chip instead -- a cancelled-but-traded
    // exception is precisely the case that has to be visible here.
    const broken = node.breaks.includes("status");
    return (
      <span title={broken ? "status disagrees across systems" : undefined}>
        <Chip dot={false} tone={broken ? "failed" : statusTone(node)}>{node.status}</Chip>
      </span>
    );
  }

  const raw = fieldStr(node, col.key);
  const content: ReactNode = col.key === "descrpt" ? <span className="font-bold">{raw}</span> : raw;

  const brkKey = brkKeysFor(col.key).find((k) => node.brk[k]);
  if (brkKey) {
    return (
      <span className="font-bold" style={{ color: "#93000a" }} title={node.cellTitle[brkKey]}>
        {content}
      </span>
    );
  }
  return content;
}

export function ReconGrid({ trades, day, error, loading = false, onExportChange }: ReconGridProps) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [hidden, setHidden] = useState<ReconColKey[]>([]);
  const [depth, setDepth] = useState<0 | 1 | 2>(1);
  const [sort, setSort] = useState<{ key: ReconColKey | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const [flip, setFlip] = useState<Record<string, boolean>>({});

  const handleDepth = (d: 0 | 1 | 2) => {
    setDepth(d);
    setFlip({});
  };

  const handleSortClick = (key: ReconColKey) => {
    setSort((s) => {
      if (s.key !== key) return { key, dir: 1 };
      if (s.dir === 1) return { key, dir: -1 };
      return { key: null, dir: 1 };
    });
  };

  // Options come from the UNFILTERED tree so choices never vanish as they're selected.
  const options = useMemo(() => {
    const flat = walkNodes(trades);
    const out: Record<string, string[]> = {};
    for (const f of RECON_FILTERS) {
      const set = new Set<string>();
      for (const n of flat) {
        const v = fieldStr(n, f.key);
        if (v && v !== "—") set.add(v);
      }
      out[f.key] = Array.from(set).sort();
    }
    return out;
  }, [trades]);

  const pruned = useMemo(() => pruneTree(trades, q, filters), [trades, q, filters]);

  const isOpen = (node: ReconNode): boolean => flip[node.ref] ?? depth > node.level;

  const display = useMemo<DisplayRow[]>(() => {
    // Sorting reorders SIBLINGS, never the tree itself: trades among trades,
    // orders within their trade, fills within their order. Flattening would
    // answer a different question — "which record has the biggest fee" — and
    // lose the one this page exists to answer, which is whether the three
    // systems agree about a given trade.
    const col = sort.key ? (RECON_COLUMNS.find((c) => c.key === sort.key) ?? null) : null;
    const ordered = (nodes: ReconNode[]) =>
      col ? [...nodes].sort((a, b) => compareNodes(a, b, col, sort.dir)) : nodes;

    const out: DisplayRow[] = [];
    const walk = (nodes: ReconNode[]) => {
      for (const node of ordered(nodes)) {
        const hasKids = node.children.length > 0;
        const open = hasKids && isOpen(node);
        out.push({ node, open, hasKids, groupStart: node.level === 0 });
        if (open) walk(node.children);
      }
    };
    walk(pruned);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pruned, sort, flip, depth]);

  // Rendered rows vs every node that exists -- both are RECORD counts, so a
  // collapsed tree honestly reads as fewer rows shown than the day holds.
  const totalNodes = useMemo(() => walkNodes(trades).length, [trades]);

  const visibleCols = useMemo(() => RECON_COLUMNS.filter((c) => !hidden.includes(c.key)), [hidden]);

  useEffect(() => {
    const filtered = q !== "" || Object.values(filters).some((v) => v.length > 0);
    onExportChange?.(
      !loading && display.length
        ? () => downloadReconCsv(display.map((d) => d.node), visibleCols, { day, filtered })
        : null,
    );
    return () => onExportChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, visibleCols, day, loading]);

  const toggleRow = (row: DisplayRow) => {
    if (!row.hasKids) return;
    setFlip((f) => ({ ...f, [row.node.ref]: !isOpen(row.node) }));
  };

  const span = visibleCols.length;

  return (
    <div className="min-w-0 overflow-hidden">
      <ReconToolbar
        q={q}
        onQ={setQ}
        filters={filters}
        onFilters={setFilters}
        options={options}
        hidden={hidden}
        onHidden={setHidden}
        depth={depth}
        onDepth={handleDepth}
        counts={loading ? undefined : { shown: display.length, total: totalNodes }}
        onReset={() => { setQ(""); setFilters({}); }}
      />

      <div className="overflow-hidden rounded-md border border-outline-variant bg-surface-lowest shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]" style={{ minWidth: "100%", width: "max-content" }}>
            <thead>
              <tr>
                {visibleCols.map((col) => {
                  const active = sort.key === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSortClick(col.key)}
                      style={{ minWidth: col.width }}
                      className={`sticky top-0 z-[1] whitespace-nowrap bg-surface-low px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] cursor-pointer select-none border-b border-outline-variant ${col.numeric ? "text-right" : "text-left"} ${active ? "text-primary" : "text-secondary"}`}
                    >
                      <span className={`inline-flex items-center gap-1 ${col.numeric ? "flex-row-reverse" : ""}`}>
                        {col.head}
                        {sort.dir === -1 && active ? (
                          <ChevronDown size={12} className={active ? "opacity-100" : "opacity-[0.28]"} />
                        ) : (
                          <ChevronUp size={12} className={active ? "opacity-100" : "opacity-[0.28]"} />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`} style={{ borderTop: i === 0 ? undefined : "1px solid var(--outline-variant)" }}>
                    {visibleCols.map((col) => (
                      <td key={col.key} className="px-3 py-2.5">
                        {/* ponytail: fixed 8 rows — the real count isn't known until it lands */}
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading && error && (
                <tr>
                  <td colSpan={span} className="px-3 py-10 text-center text-[13px] text-secondary">
                    <span className="inline-flex items-center gap-2" style={{ color: "#93000a" }}>
                      <AlertCircle size={15} /> {error}
                    </span>
                  </td>
                </tr>
              )}
              {!loading && !error && trades.length === 0 && (
                <tr>
                  <td colSpan={span} className="px-3 py-10 text-center text-[13px] text-secondary">
                    No trade records for this day.
                  </td>
                </tr>
              )}
              {!loading && !error && trades.length > 0 && display.length === 0 && (
                <tr>
                  <td colSpan={span} className="px-3 py-10 text-center text-[13px] text-secondary">
                    No records match the current filters.
                  </td>
                </tr>
              )}
              {!loading && !error && display.map((row, index) => {
                const { node } = row;
                // Roll-up flags (hasMissing/hasBreak), not the node's own missing/breaks —
                // a trade collapsed to its own row must still read as broken when only a
                // nested fill disagrees. Collapsing must never hide an exception.
                let rowStyle: CSSProperties = {};
                let rowClassName = "";
                let firstShadow: string | undefined;
                if (node.hasMissing) {
                  rowStyle = {
                    backgroundImage:
                      "repeating-linear-gradient(135deg, rgba(186,26,26,0.05) 0 7px, rgba(186,26,26,0.11) 7px 14px)",
                    color: "#93000a",
                    fontWeight: 600,
                  };
                  firstShadow = "inset 3px 0 0 #ba1a1a";
                } else if (node.hasBreak) {
                  rowStyle = { background: "rgba(242,116,5,0.10)", color: "#8a4a03", fontWeight: 600 };
                  firstShadow = "inset 3px 0 0 #f27405";
                } else if (node.level === 0) {
                  rowClassName = "bg-surface-low font-bold";
                }
                const borderTop =
                  index === 0 ? undefined : row.groupStart ? "2px solid var(--outline-variant)" : "1px solid var(--outline-variant)";

                return (
                  <tr
                    key={node.ref}
                    onClick={() => toggleRow(row)}
                    className={`${rowClassName} ${row.hasKids ? "cursor-pointer" : "cursor-default"}`}
                    style={{ ...rowStyle, borderTop }}
                  >
                    {visibleCols.map((col, ci) => (
                      <td
                        key={col.key}
                        className={`px-3 py-2.5 whitespace-nowrap ${col.numeric ? "text-right tabular-nums" : ""}`}
                        style={{
                          ...(ci === 0 ? { paddingLeft: 12 + node.level * 16 } : {}),
                          ...(ci === 0 && firstShadow ? { boxShadow: firstShadow } : {}),
                        }}
                      >
                        {ci === 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <span className={row.hasKids ? "" : "opacity-0 pointer-events-none"}>
                              {row.open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </span>
                            <CellValue node={node} col={col} />
                          </span>
                        ) : (
                          <CellValue node={node} col={col} />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-2.5 mx-0.5 text-[11.5px] text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[13px] w-[22px] rounded-[3px]" style={{ background: "rgba(242,116,5,0.10)", boxShadow: "inset 3px 0 0 #f27405" }} />
          Value break
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-[13px] w-[22px] rounded-[3px]"
            style={{
              backgroundImage: "repeating-linear-gradient(135deg, rgba(186,26,26,0.05) 0 7px, rgba(186,26,26,0.11) 7px 14px)",
              boxShadow: "inset 3px 0 0 #ba1a1a",
            }}
          />
          Missing record
        </span>
      </div>
    </div>
  );
}
