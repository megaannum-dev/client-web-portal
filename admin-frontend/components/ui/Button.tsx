"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  full?: boolean;
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-white border-transparent hover:bg-[#dd6a05]",
  secondary:
    "bg-white text-secondary border-outline hover:bg-surface-container",
  ghost:
    "bg-transparent text-secondary border-transparent hover:bg-surface-container hover:text-on-surface",
};

export function Button({
  variant = "primary",
  icon: Icon,
  iconRight: IconRight,
  full,
  disabled,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded border text-[14px] font-semibold leading-5",
        "px-[18px] py-2.5 whitespace-nowrap transition-all duration-150",
        full && "w-full",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={16} strokeWidth={2} className="shrink-0" />}
      {children}
      {IconRight && <IconRight size={16} strokeWidth={2} className="shrink-0" />}
    </button>
  );
}
