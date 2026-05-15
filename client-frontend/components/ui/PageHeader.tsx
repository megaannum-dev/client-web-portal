export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-headline-xl font-bold text-on-surface tracking-tight">{title}</h1>
      <p className="mt-1 text-body-lg text-secondary">{subtitle}</p>
    </div>
  );
}
