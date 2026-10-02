import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AutomationNodeData, AutomationNodeDefinition, AutomationNodeType } from "../../automation.types";
import { getAutomationNodeIcon, toneClasses } from "./node-presentation";

export const AutomationNodeComponent = memo(function AutomationNodeComponent({
  data,
  type,
  selected,
}: NodeProps & {
  data: AutomationNodeData & { registryPresentation?: Pick<AutomationNodeDefinition, "category" | "icon" | "tone"> };
  type: AutomationNodeType;
}) {
  const presentation = data.registryPresentation;
  const style = presentation ? toneClasses[presentation.tone] : { bg: "bg-muted", border: "border-border" };
  const Icon = getAutomationNodeIcon(presentation?.icon);
  const isTrigger = presentation?.category === "trigger" || type === "trigger";
  const isCondition = presentation?.category === "condition" || type === "condition";

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
