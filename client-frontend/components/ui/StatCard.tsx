export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6 flex flex-col gap-3">
      <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
        {label}
      </span>
      <span className="text-[28px] font-bold text-on-surface leading-none tracking-tight">
        {value}
      </span>
      {sub}
    </div>
  );
}
