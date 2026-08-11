import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Play, Pause, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import { getAutomationRule, toggleAutomationRule, updateAutomationRule } from "@/services/automation.service";
import type { AutomationNode, AutomationNodeData, AutomationEdge, AutomationGraphData } from "../automation.types";
import { TRIGGER_TYPE_LABELS } from "../automation.types";
import { AutomationBuilderCanvas } from "./automation-builder-canvas";
import { NodePropertiesPanel } from "./builder/node-properties-panel";

export function AutomationBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const queryClient = useQueryClient();

  const [nodes, setNodes] = useState<AutomationNode[]>([]);
  const [edges, setEdges] = useState<AutomationEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const ruleQuery = useQuery({
    queryKey: ["automations", "detail", id],
    queryFn: () => getAutomationRule(id!, auth.accessToken!),
    enabled: !!id,
  });

  // Initialize graph from server once
  if (ruleQuery.data && !initialized) {
    const graphData = ruleQuery.data.graphData as AutomationGraphData;
    setNodes((graphData?.nodes as AutomationNode[]) ?? []);
    setEdges((graphData?.edges as AutomationEdge[]) ?? []);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAutomationRule(id!, { graphData: { nodes, edges } }, auth.accessToken!),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) => toggleAutomationRule(id!, isActive, auth.accessToken!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations", "detail", id] }),
  });

  const handleNodesChange = useCallback((next: AutomationNode[]) => {
    setNodes(next);
    setIsDirty(true);
  }, []);

  const handleEdgesChange = useCallback((next: AutomationEdge[]) => {
    setEdges(next);
    setIsDirty(true);
  }, []);

  const handleNodeUpdate = useCallback((nodeId: string, data: Partial<AutomationNodeData>) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === nodeId) {
          return { ...n, data: { ...n.data, ...data } };
        }
        return n;
      })
    );
    setIsDirty(true);
  }, []);

  const rule = ruleQuery.data;

  if (ruleQuery.isLoading) {
    return (
      <div className="flex h-screen flex-col gap-4 p-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (ruleQuery.isError || !rule) {
    return (
      <div className="flex h-screen items-center justify-center">
        <ErrorState
          title="Không thể tải automation rule"
          description="Vui lòng thử lại."
          onReload={() => ruleQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Toolbar */}
      <header className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-2.5 shadow-xs">
        <div className="flex items-center gap-3">
          <Button
            id="back-to-rules"
            variant="ghost"
            size="sm"
            onClick={() => navigate("/automations")}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Danh sách
          </Button>
          <div className="h-5 w-px bg-border" />
          <div>
            <p className="text-sm font-semibold leading-none">{rule.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {TRIGGER_TYPE_LABELS[rule.triggerType] ?? rule.triggerType} · v{rule.version}
            </p>
          </div>
          <Badge variant={rule.isActive ? "default" : "secondary"} className="ml-1">
            {rule.isActive ? "Đang chạy" : "Tắt"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-muted-foreground">Chưa lưu</span>
          )}
          <Button
            id="save-rule-btn"
            size="sm"
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !isDirty}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Lưu
          </Button>
          <Button
            id="toggle-rule-btn"
            size="sm"
            variant={rule.isActive ? "secondary" : "default"}
            onClick={() => toggleMutation.mutate(!rule.isActive)}
            disabled={toggleMutation.isPending}
          >
            {toggleMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : rule.isActive ? (
              <Pause className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            {rule.isActive ? "Dừng rule" : "Bật rule"}
          </Button>
        </div>
      </header>

      {/* Canvas & Properties Panel */}
      <div className="relative flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden relative">
          <AutomationBuilderCanvas
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeSelect={setSelectedNodeId}
          />
        </div>
        {selectedNodeId && (
          <NodePropertiesPanel
            selectedNodeId={selectedNodeId}
            nodes={nodes}
            onNodeUpdate={handleNodeUpdate}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}
