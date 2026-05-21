export function SectionCard({
  id,
  title,
  action,
  children,
}: {
  id?: string;
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="bg-surface-lowest border border-outline-variant rounded-xl p-8">
      {title && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-headline-md font-bold text-on-surface">{title}</h2>
            {action}
          </div>
          <hr className="border-outline-variant mb-6" />
        </>
      )}
      {children}
    </div>
  );
}
