export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["animate-pulse rounded bg-surface-highest", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
