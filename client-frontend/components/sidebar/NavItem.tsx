import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface NavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
}

export function NavItem({ href, icon: Icon, label, active = false }: NavItemProps) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-3 py-3 pl-4 pr-5 w-full transition-colors duration-150",
        active
          ? "bg-primary rounded text-white"
          : "rounded text-secondary hover:bg-surface-container hover:text-on-surface",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={18} strokeWidth={1.75} className="shrink-0" />
      <span className="text-label-md font-semibold tracking-[0.05em] uppercase">
        {label}
      </span>
    </Link>
  );
}
