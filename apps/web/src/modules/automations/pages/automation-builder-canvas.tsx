import { useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type NodeTypes,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AutomationEdge, AutomationNode, AutomationNodeType } from "../automation.types";

import { AutomationNodeComponent } from "./builder/automation-node";
import { NodePalette } from "./builder/node-palette";

const nodeTypes: NodeTypes = {
  trigger: AutomationNodeComponent,
  condition: AutomationNodeComponent,
  action_notification: AutomationNodeComponent,
  action_assign: AutomationNodeComponent,
  action_update_stage: AutomationNodeComponent,
  action_activity: AutomationNodeComponent,
  delay: AutomationNodeComponent,
};

type AutomationBuilderCanvasProps = {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  selectedNodeId: string | null;
  onNodesChange: (nodes: AutomationNode[]) => void;
  onEdgesChange: (edges: AutomationEdge[]) => void;
  onNodeSelect: (nodeId: string | null) => void;
};

export function AutomationBuilderCanvas({
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId,
  onNodesChange,
  onEdgesChange,
  onNodeSelect,
}: AutomationBuilderCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const onConnect = useCallback(
    (params: Connection) => {
      onEdgesChange(addEdge(params, initialEdges) as AutomationEdge[]);
    },
    [initialEdges, onEdgesChange],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/automation-node-type") as AutomationNodeType;
      const label = event.dataTransfer.getData("application/automation-node-label");
      if (!type || !reactFlowWrapper.current) return;

      const rect = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: event.clientX - rect.left - 75,
        y: event.clientY - rect.top - 30,
      };

      const newNode: AutomationNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label },
      };

      onNodesChange([...initialNodes, newNode]);
    },
    [initialNodes, onNodesChange],
  );

  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={initialNodes.map((n) => ({
          ...n,
          selected: n.id === selectedNodeId,
        }))}
        edges={initialEdges}
        onNodesChange={(changes) => onNodesChange(applyNodeChanges(changes, initialNodes) as AutomationNode[])}
        onEdgesChange={(changes) => onEdgesChange(applyEdgeChanges(changes, initialEdges) as AutomationEdge[])}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={(_e, node) => onNodeSelect(node.id)}
        onPaneClick={() => onNodeSelect(null)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="bg-muted/20"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const type = node.type as AutomationNodeType;
            const colors: Record<AutomationNodeType, string> = {
              trigger: "#3b82f6",
              condition: "#f97316",
              action_notification: "#22c55e",
              action_assign: "#a855f7",
              action_update_stage: "#14b8a6",
              action_activity: "#6366f1",
              delay: "#eab308",
            };
            return colors[type] ?? "#888";
          }}
          maskColor="rgb(0,0,0,0.05)"
        />
      </ReactFlow>
      <NodePalette />
    </div>
  );
}
