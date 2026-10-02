import { useCallback, useMemo, useRef } from "react";
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
import type {
  AutomationEdge,
  AutomationNode,
  AutomationNodeDefinition,
  AutomationNodeType,
} from "../automation.types";

import { AutomationNodeComponent } from "./builder/automation-node";
import { NodePalette } from "./builder/node-palette";
import { getAutomationNodeMiniMapColor } from "./builder/node-presentation";

type AutomationBuilderCanvasProps = {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  nodeDefinitions: AutomationNodeDefinition[];
  selectedNodeId: string | null;
  onNodesChange: (nodes: AutomationNode[]) => void;
  onEdgesChange: (edges: AutomationEdge[]) => void;
  onNodeSelect: (nodeId: string | null) => void;
};

export function AutomationBuilderCanvas({
  nodes: initialNodes,
  edges: initialEdges,
  nodeDefinitions,
  selectedNodeId,
  onNodesChange,
  onEdgesChange,
  onNodeSelect,
}: AutomationBuilderCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const definitionsByType = useMemo(() => new Map(nodeDefinitions.map((definition) => [definition.type, definition])), [nodeDefinitions]);
  const nodeTypes = useMemo(() => Object.fromEntries(
    nodeDefinitions.map((definition) => [definition.type, AutomationNodeComponent]),
  ) as NodeTypes, [nodeDefinitions]);

  const createNode = useCallback(
    (type: AutomationNodeType, label: string, position: { x: number; y: number }) => {
      const definition = definitionsByType.get(type);
      const defaultData = definition?.defaultData ?? {};
      const newNode: AutomationNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: {
          ...defaultData,
          ...(defaultData.conditions
            ? { conditions: defaultData.conditions.map((condition) => ({ ...condition, id: crypto.randomUUID() })) }
            : {}),
          label,
        },
      };

      onNodesChange([...initialNodes, newNode]);
      onNodeSelect(newNode.id);
    },
    [definitionsByType, initialNodes, onNodeSelect, onNodesChange],
  );

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

      createNode(type, label, position);
    },
    [createNode],
  );

  const addNodeFromPalette = useCallback(
    (type: AutomationNodeType, label: string) => {
      const offset = initialNodes.length * 24;
      createNode(type, label, { x: 220 + offset, y: 120 + offset });
    },
    [createNode, initialNodes.length],
  );

  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={initialNodes.map((n) => ({
          ...n,
          selected: n.id === selectedNodeId,
          data: {
            ...n.data,
            registryPresentation: definitionsByType.get(n.type),
          },
        }))}
        edges={initialEdges}
        onNodesChange={(changes) => {
          const graphChanges = changes.filter((change) => change.type !== "select");
          if (graphChanges.length > 0) onNodesChange(applyNodeChanges(graphChanges, initialNodes) as AutomationNode[]);
        }}
        onEdgesChange={(changes) => {
          const graphChanges = changes.filter((change) => change.type !== "select");
          if (graphChanges.length > 0) onEdgesChange(applyEdgeChanges(graphChanges, initialEdges) as AutomationEdge[]);
        }}
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
            return getAutomationNodeMiniMapColor(definitionsByType.get(node.type as AutomationNodeType)?.tone);
          }}
          maskColor="rgb(0,0,0,0.05)"
        />
      </ReactFlow>
      <NodePalette definitions={nodeDefinitions} onAdd={addNodeFromPalette} />
    </div>
  );
}
