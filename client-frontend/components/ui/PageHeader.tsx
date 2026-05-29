export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <h1 className="text-headline-xl font-bold text-on-surface tracking-tight">{title}</h1>
        <p className="mt-1 text-body-lg text-secondary">{subtitle}</p>
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </div>
  );
}
