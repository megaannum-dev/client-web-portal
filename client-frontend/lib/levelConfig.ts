import { ShieldAlert, AlertCircle, Shield, TrendingUp } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import type { ActionLevel } from "@/lib/mock/data";

export const LEVEL_CONFIG: Record<ActionLevel, {
  card: string; icon: string; title: string; Icon: LucideIcon;
}> = {
  urgent:  { card: "level-card-urgent",  icon: "level-icon-urgent",  title: "level-title-urgent",  Icon: ShieldAlert  },
  caution: { card: "level-card-neutral", icon: "level-icon-caution", title: "level-title-caution", Icon: AlertCircle  },
  primary: { card: "level-card-neutral", icon: "level-icon-primary", title: "level-title-neutral", Icon: TrendingUp   },
  info:    { card: "level-card-neutral", icon: "level-icon-info",    title: "level-title-info",    Icon: Shield       },
  neutral: { card: "level-card-neutral", icon: "level-icon-neutral", title: "level-title-neutral", Icon: AlertCircle  },
};
