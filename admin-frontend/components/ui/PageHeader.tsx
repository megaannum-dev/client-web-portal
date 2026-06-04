import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-headline-xl font-bold tracking-tight text-on-surface">{title}</h1>
        {subtitle && <p className="mt-1 text-body-lg text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-3 pt-1">{actions}</div>}
    </div>
  );
}
