import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bell, Circle, Clock3, GitBranch, ListPlus, UserRoundPlus, Workflow, Zap, type LucideIcon } from "lucide-react";
import type { AutomationNodeData, AutomationNodeType } from "../../automation.types";

const NODE_STYLE: Record<
  AutomationNodeType,
  { bg: string; border: string; icon: LucideIcon }
> = {
  trigger: { bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-300 dark:border-blue-700", icon: Zap },
  condition: { bg: "bg-orange-50 dark:bg-orange-950/40", border: "border-orange-300 dark:border-orange-700", icon: GitBranch },
  action_notification: { bg: "bg-green-50 dark:bg-green-950/40", border: "border-green-300 dark:border-green-700", icon: Bell },
  action_assign: { bg: "bg-purple-50 dark:bg-purple-950/40", border: "border-purple-300 dark:border-purple-700", icon: UserRoundPlus },
  action_update_stage: { bg: "bg-teal-50 dark:bg-teal-950/40", border: "border-teal-300 dark:border-teal-700", icon: Workflow },
  action_activity: { bg: "bg-indigo-50 dark:bg-indigo-950/40", border: "border-indigo-300 dark:border-indigo-700", icon: ListPlus },
  delay: { bg: "bg-yellow-50 dark:bg-yellow-950/40", border: "border-yellow-300 dark:border-yellow-700", icon: Clock3 },
};

export const AutomationNodeComponent = memo(function AutomationNodeComponent({
  data,
  type,
  selected,
}: NodeProps & { data: AutomationNodeData; type: AutomationNodeType }) {
  const style = NODE_STYLE[type] ?? { bg: "bg-muted", border: "border-border", icon: Circle };
  const Icon = style.icon;
  const isTrigger = type === "trigger";
  const isCondition = type === "condition";

  return (
    <div
      className={[
        "relative min-w-35 max-w-45 rounded-lg border-2 px-3 py-2.5 shadow-sm transition-shadow",
        style.bg,
        style.border,
        selected ? "ring-2 ring-offset-1 ring-primary shadow-md" : "",
      ].join(" ")}
    >
      {/* Target handle (top) — only if not a trigger */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="h-3! w-3! border-2! border-background! bg-muted-foreground!"
        />
      )}

      <div className="flex flex-col items-center gap-1 text-center">
        <Icon className="h-5 w-5" aria-hidden="true" />
        <span className="text-xs font-semibold leading-tight text-foreground">
          {data.label}
        </span>
        {data.triggerType && (
          <span className="text-[10px] text-muted-foreground">{data.triggerType}</span>
        )}
      </div>

      {/* Source handle (right) — always */}
      <Handle
        type="source"
        position={Position.Right}
        id="default"
        className="h-3! w-3! border-2! border-background! bg-primary!"
      />

      {/* Second source for condition YES/NO */}
      {isCondition && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="false"
          className="h-3! w-3! border-2! border-background! bg-red-400!"
        />
      )}
    </div>
  );
});
