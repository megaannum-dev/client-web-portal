interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-xl font-bold text-on-surface tracking-tight">{title}</h1>
        <p className="text-body-lg text-secondary max-w-2xl">
          {description ??
            "This section is not wired to live data yet. Use it to validate navigation and layout while product screens are implemented."}
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-outline-variant bg-surface-low px-6 py-12 text-center">
        <p className="text-body-md text-secondary">Placeholder content</p>
      </div>
    </div>
  );
}
