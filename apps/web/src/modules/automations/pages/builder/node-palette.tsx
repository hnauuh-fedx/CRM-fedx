import { Bell, GitBranch, NotebookPen, RefreshCw, Timer, UserPlus, Zap, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AutomationNodeDefinition, AutomationNodeType } from "../../automation.types";

const NODE_ICONS: Record<AutomationNodeType, LucideIcon> = {
  trigger: Zap,
  condition: GitBranch,
  action_notification: Bell,
  action_assign: UserPlus,
  action_update_stage: RefreshCw,
  action_activity: NotebookPen,
  delay: Timer,
};

export function NodePalette({ definitions, onAdd }: {
  definitions: AutomationNodeDefinition[];
  onAdd: (type: AutomationNodeType, label: string) => void;
}) {
  function onDragStart(event: React.DragEvent, type: string, label: string) {
    event.dataTransfer.setData("application/automation-node-type", type);
    event.dataTransfer.setData("application/automation-node-label", label);
    event.dataTransfer.effectAllowed = "move";
  }

  const categories: Array<{ key: "trigger" | "condition" | "action" | "delay"; label: string }> = [
    { key: "trigger" as const, label: "Khởi động" },
    { key: "condition" as const, label: "Điều kiện" },
    { key: "action" as const, label: "Hành động" },
    { key: "delay" as const, label: "Thời gian" },
  ];

  return (
    <div
      className="absolute right-0 top-0 h-full w-64 overflow-y-auto border-l bg-background shadow-lg"
      aria-label="Thêm block mới"
    >
      <div className="sticky top-0 border-b bg-background px-4 py-3">
        <p className="text-sm font-semibold">Thêm block mới</p>
        <p className="text-xs text-muted-foreground">Kéo block vào sơ đồ để thêm</p>
      </div>
      <div className="flex flex-col gap-4 p-3">
        {categories.map((cat) => {
          const nodes = definitions.filter((node) => node.category === cat.key);
          if (nodes.length === 0) return null;
          return (
            <div key={cat.key}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {cat.label}
              </p>
              <div className="flex flex-col gap-2">
                {nodes.map((node) => {
                  const Icon = NODE_ICONS[node.type];

                  return (
                    <Button
                    key={node.type}
                    id={`palette-node-${node.type}`}
                    type="button"
                    variant="outline"
                    draggable
                    onDragStart={(event) => onDragStart(event, node.type, node.label)}
                    onClick={() => onAdd(node.type, node.label)}
                    className="h-auto min-h-11 cursor-grab justify-start px-3 py-2.5 text-left active:cursor-grabbing"
                  >
                      <Icon aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">{node.label}</span>
                        <span className="block truncate text-xs font-normal leading-tight text-muted-foreground">
                          {node.description}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
