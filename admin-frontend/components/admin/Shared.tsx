"use client";

/* ============================================================
   Admin console — shared primitives
   Ported from admin/admin-app/{AdminBits,ProtoBits}.jsx. Reuses the
   repo's Button/Chip/Avatar (components/ui) and lucide icons
   (lib/icons); adds the handful of form/table/menu/modal primitives
   the handoff's inline-style prototype didn't have equivalents for
   yet. Shared by both Enroll User and System Config.
   ============================================================ */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertCircle, TriangleAlert, Check, CheckCircle2, ChevronDown, Eye,
  Grid3x3, Info, Minus, Pencil, Users, X,
} from "@/lib/icons";
import { Avatar } from "@/components/ui/Avatar";
import type { Level } from "@/lib/admin/types";

/* ---- label / help text -------------------------------------- */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-[11px] font-bold uppercase tracking-[0.05em] text-secondary ${className ?? ""}`}>
      {children}
    </span>
  );
}
export function Help({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <p className={`text-[12.5px] leading-[1.5] text-secondary ${className ?? ""}`} style={style}>{children}</p>;
}

/* ---- access level glyph (None / View / Edit) ---------------- */
const LEVEL_STYLE: Record<Level, { bg: string; fg: string; icon: typeof Minus }> = {
  NONE: { bg: "var(--surface-container)", fg: "var(--secondary)", icon: Minus },
  VIEW: { bg: "#eef2f7", fg: "#3d4655", icon: Eye },
  EDIT: { bg: "rgba(242,116,5,0.14)", fg: "var(--primary)", icon: Pencil },
};
const LEVEL_TITLE: Record<Level, string> = { NONE: "None", VIEW: "View", EDIT: "Edit" };

export function LevelBadge({ level = "NONE", override, size = 28 }: { level?: Level; override?: boolean; size?: number }) {
  const s = LEVEL_STYLE[level] ?? LEVEL_STYLE.NONE;
  const Icon = s.icon;
  return (
    <span
      title={(LEVEL_TITLE[level] ?? LEVEL_TITLE.NONE) + (override ? " · per-user override" : "")}
      className="relative inline-flex shrink-0 items-center justify-center rounded"
      style={{
        width: size, height: size, background: s.bg, color: s.fg,
        border: override ? "1.5px dashed var(--primary)" : "1px solid transparent",
      }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
      {override && (
        <span
          className="absolute -right-[3px] -top-[3px] h-[7px] w-[7px] rounded-full border-[1.5px] border-white"
          style={{ background: "var(--primary)" }}
        />
      )}
    </span>
  );
}

/* ---- segmented None / View / Edit control -------------------- */
const SEG_ORDER: Level[] = ["NONE", "VIEW", "EDIT"];
export function LevelSeg({ value = "NONE", override, onChange }: { value?: Level; override?: boolean; onChange?: (lv: Level) => void }) {
  return (
    <span
      className="inline-flex gap-0.5 rounded-[9px] p-[3px]"
      style={{
        background: "var(--surface-container)",
        border: override ? "1.5px dashed var(--primary)" : "1px solid var(--outline-variant)",
      }}
    >
      {SEG_ORDER.map((lv) => {
        const on = lv === value;
        const Icon = LEVEL_STYLE[lv].icon;
        return (
          <button
            key={lv}
            type="button"
            onClick={onChange ? () => onChange(lv) : undefined}
            className={`inline-flex items-center gap-1.5 rounded-[7px] px-[11px] py-[5px] text-[12.5px] font-semibold transition-all ${onChange ? "cursor-pointer" : "cursor-default"}`}
            style={{
              background: on ? "#fff" : "transparent",
              color: on ? (lv === "EDIT" ? "var(--primary)" : "var(--on-surface)") : "var(--secondary)",
              fontWeight: on ? 700 : 600,
              boxShadow: on ? "var(--shadow-card)" : "none",
            }}
          >
            <Icon size={13} strokeWidth={2} />{LEVEL_TITLE[lv]}
          </button>
        );
      })}
    </span>
  );
}

/* ---- level diff (from -> to) --------------------------------- */
export function LevelDiff({ from, to, override }: { from: Level; to: Level; override?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LevelBadge level={from} size={26} />
      <ChevronDown size={14} strokeWidth={2} className="-rotate-90 text-secondary" />
      <LevelBadge level={to} size={26} override={override} />
    </span>
  );
}

/* ---- notice --------------------------------------------------- */
export type NoticeTone = "ok" | "warn" | "bad" | "info";
const NOTICE_TONES: Record<NoticeTone, { bg: string; bd: string; fg: string; icon: typeof Info }> = {
  ok: { bg: "#f0fdf4", bd: "#bbf7d0", fg: "#15803d", icon: CheckCircle2 },
  warn: { bg: "#fff7ed", bd: "#fed7aa", fg: "#9a3412", icon: TriangleAlert },
  bad: { bg: "#ffebee", bd: "#ffcdd2", fg: "#b71c1c", icon: AlertCircle },
  info: { bg: "var(--surface-low)", bd: "var(--outline-variant)", fg: "var(--secondary)", icon: Info },
};
export function Notice({ tone = "info", children, className }: { tone?: NoticeTone; children: ReactNode; className?: string }) {
  const t = NOTICE_TONES[tone];
  const Icon = t.icon;
  return (
    <div
      className={`flex items-start gap-2.5 rounded-[10px] px-3.5 py-[11px] ${className ?? ""}`}
      style={{ background: t.bg, border: `1px solid ${t.bd}` }}
    >
      <Icon size={16} strokeWidth={2} className="mt-px shrink-0" style={{ color: t.fg }} />
      <span className="text-[12.5px] leading-[1.5]" style={{ color: t.fg }}>{children}</span>
    </div>
  );
}

/* ---- text input ------------------------------------------------ */
export function TextField({
  label, value, onChange, placeholder, icon: Icon, help, required, span, mono, trail, invalid, type = "text",
}: {
  label?: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  icon?: typeof Info;
  help?: ReactNode;
  required?: boolean;
  span?: boolean;
  mono?: boolean;
  trail?: ReactNode;
  invalid?: string | null;
  type?: string;
}) {
  const [focus, setFocus] = useState(false);
  const bad = !!invalid && !focus;
  return (
    <div style={span ? { gridColumn: "1 / -1" } : undefined}>
      {label && (
        <div className="mb-[7px]">
          <Label>{label}{required && <span style={{ color: "var(--primary)" }}> *</span>}</Label>
        </div>
      )}
      <div
        className="box-border flex min-h-[42px] w-full items-center gap-[9px] rounded px-[13px] py-2.5 transition-all"
        style={{
          background: "#fff",
          border: `1px solid ${bad ? "var(--error)" : focus ? "var(--primary)" : "var(--outline)"}`,
          boxShadow: focus ? "var(--focus-ring)" : "none",
        }}
      >
        {Icon && <Icon size={15} strokeWidth={1.75} className="shrink-0 text-secondary" />}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] font-medium leading-5 text-on-surface outline-none"
          style={mono ? { fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" } : undefined}
        />
        {trail}
      </div>
      {(help || bad) && (
        <Help className="mt-1.5 text-[12px]" style={bad ? { color: "var(--error)" } : undefined}>{bad ? invalid : help}</Help>
      )}
    </div>
  );
}

/* ---- select ----------------------------------------------------- */
export interface SelectOption { value: string; label: string }
export function SelectField({
  label, value, onChange, options, placeholder = "Select…", help, required, span,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | SelectOption)[];
  placeholder?: string;
  help?: ReactNode;
  required?: boolean;
  span?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const opts: SelectOption[] = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const cur = opts.find((o) => o.value === value);
  return (
    <div className="relative" style={span ? { gridColumn: "1 / -1" } : undefined}>
      {label && (
        <div className="mb-[7px]">
          <Label>{label}{required && <span style={{ color: "var(--primary)" }}> *</span>}</Label>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="box-border flex min-h-[42px] w-full cursor-pointer items-center gap-[9px] rounded px-[13px] py-2.5 text-left text-[14px] font-medium leading-5 transition-all"
        style={{
          background: "#fff",
          border: `1px solid ${open ? "var(--primary)" : "var(--outline)"}`,
          boxShadow: open ? "var(--focus-ring)" : "none",
          color: cur ? "var(--on-surface)" : "var(--secondary)",
        }}
      >
        <span className="min-w-0 flex-1 truncate">{cur ? cur.label : placeholder}</span>
        <ChevronDown size={15} strokeWidth={2} className="shrink-0 text-secondary" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-[70]" />
          <div
            className="absolute left-0 right-0 z-[71] mt-1.5 max-h-[244px] overflow-auto rounded-xl bg-white p-1.5 shadow-overlay"
            style={{ top: "100%", border: "1px solid var(--outline-variant)" }}
          >
            {opts.map((o) => {
              const on = o.value === value;
              return (
                <div
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="flex cursor-pointer items-center gap-[9px] rounded-lg px-[11px] py-[9px] text-[13px] transition-colors hover:bg-surface-container"
                  style={{ fontWeight: on ? 700 : 500, color: on ? "var(--primary)" : "var(--on-surface)", background: on ? "var(--primary-fixed)" : "transparent" }}
                >
                  <span className="flex-1">{o.label}</span>
                  {on && <Check size={14} strokeWidth={2.5} />}
                </div>
              );
            })}
          </div>
        </>
      )}
      {help && <Help className="mt-1.5 text-[12px]">{help}</Help>}
    </div>
  );
}

/* ---- checkbox ----------------------------------------------------- */
export function Checkbox({ on, onChange, children }: { on: boolean; onChange?: (v: boolean) => void; children: ReactNode }) {
  return (
    <div
      onClick={() => onChange?.(!on)}
      className={`flex items-start gap-2.5 ${onChange ? "cursor-pointer" : ""}`}
    >
      <span
        className="mt-px flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] text-white"
        style={{ background: on ? "var(--primary)" : "#fff", border: on ? "none" : "1px solid var(--outline)" }}
      >
        {on && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="text-[13px] leading-[1.45] text-on-surface">{children}</span>
    </div>
  );
}

/* ---- icon button -------------------------------------------------- */
export function IconButton({
  icon: Icon, size = 16, onClick, danger, title, className,
}: { icon: typeof Info; size?: number; onClick?: () => void; danger?: boolean; title?: string; className?: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`flex rounded-lg p-1.5 transition-colors ${className ?? ""}`}
      style={{
        background: hover ? "var(--surface-container)" : "transparent",
        color: danger ? "var(--error)" : hover ? "var(--on-surface)" : "var(--secondary)",
      }}
    >
      <Icon size={size} strokeWidth={2} />
    </button>
  );
}

/* ---- filter chip ---------------------------------------------------- */
export function FilterChip({ label, n, on, onClick }: { label: string; n: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-[7px] rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all hover:bg-surface-container"
      style={{
        background: on ? "var(--primary)" : "#fff",
        color: on ? "#fff" : "var(--secondary)",
        borderColor: on ? "var(--primary)" : "var(--outline-variant)",
        fontWeight: on ? 700 : 600,
      }}
    >
      {label}
      <span
        className="rounded-full px-[7px] py-px text-[11.5px] font-bold"
        style={{ background: on ? "rgba(255,255,255,0.22)" : "var(--surface-container)", color: on ? "#fff" : "var(--secondary)" }}
      >
        {n}
      </span>
    </button>
  );
}

/* ---- matrix <-> role view switcher ----------------------------------- */
export function ViewSwitch({ view, onChange }: { view: "matrix" | "role"; onChange: (v: "matrix" | "role") => void }) {
  const items: [("matrix" | "role"), typeof Grid3x3, string][] = [["matrix", Grid3x3, "Matrix"], ["role", Users, "By role"]];
  return (
    <span className="inline-flex gap-0.5 rounded-full p-[3px]" style={{ background: "var(--surface-container)", border: "1px solid var(--outline-variant)" }}>
      {items.map(([k, Icon, lab]) => {
        const on = k === view;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className="inline-flex cursor-pointer items-center gap-[7px] rounded-full border-none px-3.5 py-1.5 text-[12.5px] transition-all"
            style={{ background: on ? "#fff" : "transparent", color: on ? "var(--on-surface)" : "var(--secondary)", fontWeight: on ? 700 : 600, boxShadow: on ? "var(--shadow-card)" : "none" }}
          >
            <Icon size={14} strokeWidth={2} />{lab}
          </button>
        );
      })}
    </span>
  );
}

/* ---- dropdown menu (click-away) ---------------------------------------- */
export type MenuItemDef = [label: string, icon: typeof Info, danger?: boolean] | "-";
export function DropdownMenu({
  items, onClose, onPick, className, width = 236,
}: { items: MenuItemDef[]; onClose: () => void; onPick: (label: string) => void; className?: string; width?: number }) {
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[44]" />
      <div
        className={`absolute z-[45] rounded-2xl bg-white p-[7px] shadow-overlay ${className ?? ""}`}
        style={{ width, border: "1px solid var(--outline-variant)" }}
      >
        {items.map((it, i) =>
          it === "-" ? (
            <div key={i} className="mx-1 my-[5px] h-px" style={{ background: "var(--outline-variant)" }} />
          ) : (
            <MenuItem key={i} item={it} onPick={onPick} />
          ),
        )}
      </div>
    </>
  );
}
function MenuItem({ item, onPick }: { item: [string, typeof Info, boolean?]; onPick: (label: string) => void }) {
  const [hover, setHover] = useState(false);
  const [label, Icon, danger] = item;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onPick(label)}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-[11px] py-[9px] text-[13px] font-semibold transition-colors"
      style={{ background: hover ? (danger ? "rgba(186,26,26,0.07)" : "var(--surface-container)") : "transparent", color: danger ? "var(--error)" : "var(--on-surface)" }}
    >
      <Icon size={16} strokeWidth={1.75} style={{ color: danger ? "var(--error)" : "var(--secondary)" }} />{label}
    </div>
  );
}

/* ---- table shells -------------------------------------------------------- */
export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={`whitespace-nowrap px-4 py-[11px] text-left text-[11px] font-bold uppercase tracking-[0.05em] text-secondary ${className ?? ""}`}>
      {children}
    </th>
  );
}
export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={`border-t border-outline-variant px-4 py-[13px] text-[13px] text-on-surface ${className ?? ""}`}>
      {children}
    </td>
  );
}
export function UserCell({ initials, name, sub }: { initials: string; name: string; sub: string }) {
  return (
    <div className="flex items-center gap-[11px]">
      <Avatar initial={initials[0]} size={34} />
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-on-surface">{name}</div>
        <div className="text-[12px] text-secondary">{sub}</div>
      </div>
    </div>
  );
}

/* ---- modal (closable, absolutely positioned over the page wrapper) ------ */
export function Modal({
  title, sub, children, foot, width = 460, onClose,
}: { title: ReactNode; sub?: ReactNode; children: ReactNode; foot?: ReactNode; width?: number; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="absolute inset-0 z-[60] flex items-center justify-center p-8"
      style={{ background: "rgba(15,15,15,0.22)", backdropFilter: "blur(3px)" }}
    >
      <div
        className="flex max-h-full flex-col overflow-hidden rounded-[20px] bg-white shadow-overlay"
        style={{ width, maxWidth: "100%" }}
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-4 px-[22px] pb-[15px] pt-5" style={{ borderBottom: "1px solid var(--outline-variant)" }}>
          <div>
            <h2 className="text-[18px] font-bold leading-[1.25] text-on-surface">{title}</h2>
            {sub && <p className="mt-1 text-[12.5px] text-secondary">{sub}</p>}
          </div>
          <IconButton icon={X} size={17} onClick={onClose} />
        </div>
        <div className="flex flex-col gap-3.5 overflow-auto px-[22px] py-[18px]">{children}</div>
        {foot && (
          <div className="flex flex-shrink-0 items-center gap-2.5 px-[22px] py-3.5" style={{ borderTop: "1px solid var(--outline-variant)", background: "var(--surface-low)" }}>
            {foot}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- hover helper --------------------------------------------------------- */
export function useHover() {
  const [h, setH] = useState(false);
  return [h, { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false) }] as const;
}

/* ---- clickable table row --------------------------------------------------- */
export function Row({ children, dim, onClick }: { children: ReactNode; dim?: boolean; onClick?: () => void }) {
  const [hover, hb] = useHover();
  return (
    <tr
      {...hb}
      onClick={onClick}
      className="transition-colors"
      style={{ background: dim ? "var(--surface-low)" : hover ? "var(--surface-low)" : "#fff", opacity: dim ? 0.75 : 1, cursor: onClick ? "pointer" : "default" }}
    >
      {children}
    </tr>
  );
}
