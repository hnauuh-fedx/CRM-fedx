import { NODE_TYPE_DEFINITIONS } from "../../automation.types";

export function NodePalette() {
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
      <div className="p-3 space-y-4">
        {categories.map((cat) => {
          const nodes = NODE_TYPE_DEFINITIONS.filter((n) => n.category === cat.key);
          if (nodes.length === 0) return null;
          return (
            <div key={cat.key}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {cat.label}
              </p>
              <div className="space-y-2">
                {nodes.map((node) => (
                  <div
                    key={node.type}
                    id={`palette-node-${node.type}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, node.type, node.label)}
                    className="flex cursor-grab items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 shadow-xs transition-all hover:shadow-sm hover:border-primary/40 active:cursor-grabbing"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white text-sm ${node.colorClass}`}
                    >
                      {node.type === "trigger" && "⚡"}
                      {node.type === "condition" && "◈"}
                      {node.type === "action_notification" && "🔔"}
                      {node.type === "action_assign" && "👤"}
                      {node.type === "action_update_stage" && "🔄"}
                      {node.type === "action_activity" && "📝"}
                      {node.type === "delay" && "⏱"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{node.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight truncate">
                        {node.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
