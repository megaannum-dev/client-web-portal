import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";

interface CardProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** When false, removes the body padding (e.g. for flush tables). */
  pad?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Card({ title, action, children, pad = true, className, style }: CardProps) {
  return (
    <section
      className={clsx(
        "overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card",
        className,
      )}
      style={style}
    >
      {title && (
        <header className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <h3 className="text-[18px] font-semibold text-on-surface">{title}</h3>
          {action}
        </header>
      )}
      <div className={pad ? "px-5 py-[18px]" : undefined}>{children}</div>
    </section>
  );
}
