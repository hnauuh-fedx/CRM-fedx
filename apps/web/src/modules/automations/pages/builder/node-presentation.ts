import { Bell, Circle, Clock3, GitBranch, Mail, NotebookPen, RefreshCw, UserPlus, Users, Webhook, Zap, type LucideIcon } from "lucide-react";
import type { AutomationNodeDefinition } from "../../automation.types";

const icons: Record<AutomationNodeDefinition["icon"], LucideIcon> = {
  bell: Bell,
  clock: Clock3,
  "git-branch": GitBranch,
  notebook: NotebookPen,
  refresh: RefreshCw,
  "user-plus": UserPlus,
  users: Users,
  mail: Mail,
  webhook: Webhook,
  zap: Zap,
};

export const toneClasses: Record<AutomationNodeDefinition["tone"], { bg: string; border: string }> = {
  blue: { bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-300 dark:border-blue-700" },
  green: { bg: "bg-green-50 dark:bg-green-950/40", border: "border-green-300 dark:border-green-700" },
  indigo: { bg: "bg-indigo-50 dark:bg-indigo-950/40", border: "border-indigo-300 dark:border-indigo-700" },
  orange: { bg: "bg-orange-50 dark:bg-orange-950/40", border: "border-orange-300 dark:border-orange-700" },
  purple: { bg: "bg-purple-50 dark:bg-purple-950/40", border: "border-purple-300 dark:border-purple-700" },
  teal: { bg: "bg-teal-50 dark:bg-teal-950/40", border: "border-teal-300 dark:border-teal-700" },
  yellow: { bg: "bg-yellow-50 dark:bg-yellow-950/40", border: "border-yellow-300 dark:border-yellow-700" },
};

const miniMapColors: Record<AutomationNodeDefinition["tone"], string> = {
  blue: "var(--color-blue-500)",
  green: "var(--color-green-500)",
  indigo: "var(--color-indigo-500)",
  orange: "var(--color-orange-500)",
  purple: "var(--color-purple-500)",
  teal: "var(--color-teal-500)",
  yellow: "var(--color-yellow-500)",
};

export function getAutomationNodeIcon(icon?: AutomationNodeDefinition["icon"]) {
  return icon ? icons[icon] : Circle;
}

export function getAutomationNodeMiniMapColor(tone?: AutomationNodeDefinition["tone"]) {
  return tone ? miniMapColors[tone] : "var(--muted-foreground)";
}
