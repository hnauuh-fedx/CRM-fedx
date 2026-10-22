import { PageLoadingState } from "@/components/shared/page-loading-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pause, Play, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router";

import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import {
  getAutomationOptions,
  getAutomationRule,
  toggleAutomationRule,
  updateAutomationRule,
} from "@/services/automation.service";
import type {
  AutomationEdge,
  AutomationGraphData,
  AutomationNode,
  AutomationNodeData,
} from "../automation.types";
import { AutomationBuilderCanvas } from "./automation-builder-canvas";
import { AutomationTestRunDialog } from "./builder/automation-test-run-dialog";
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
  const initializedRuleId = useRef<string | null>(null);
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (!isDirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  const ruleQuery = useQuery({
    queryKey: ["automations", "detail", id],
    queryFn: () => getAutomationRule(id!, auth.accessToken!),
    enabled: !!id,
  });

  const optionsQuery = useQuery({
    queryKey: [
      "automations",
      "options",
      ruleQuery.data?.institutionProgramId ?? "global",
    ],
    queryFn: () =>
      getAutomationOptions(
        auth.accessToken!,
        ruleQuery.data?.institutionProgramId ?? undefined,
      ),
    enabled: Boolean(auth.accessToken && ruleQuery.data),
  });

  useEffect(() => {
    if (!ruleQuery.data || initializedRuleId.current === ruleQuery.data.id)
      return;
    const graphData = ruleQuery.data.graphData as AutomationGraphData;
    setNodes(
      (graphData?.nodes ?? []).map((node) =>
        node.type === "trigger"
          ? {
              ...node,
              data: { ...node.data, triggerType: ruleQuery.data.triggerType },
            }
          : node,
      ),
    );
    setEdges(graphData?.edges ?? []);
    initializedRuleId.current = ruleQuery.data.id;
  }, [ruleQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAutomationRule(
        id!,
        {
          graphData: {
            nodes: nodes.map((node) =>
              node.type === "action_assign_pool" &&
              node.data.assigneeIds?.length
                ? { ...node, data: { ...node.data, departmentId: undefined } }
                : node,
            ),
            edges,
          },
        },
        auth.accessToken!,
      ),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      queryClient.invalidateQueries({
        queryKey: ["automations", "detail", id],
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      toggleAutomationRule(id!, isActive, auth.accessToken!),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["automations", "detail", id],
      }),
  });

  const handleNodesChange = useCallback((next: AutomationNode[], markDirty = true) => {
    setNodes(next);
    if (markDirty) setIsDirty(true);
  }, []);

  const handleEdgesChange = useCallback((next: AutomationEdge[]) => {
    setEdges(next);
    setIsDirty(true);
  }, []);

  const handleNodeUpdate = useCallback(
    (nodeId: string, data: Partial<AutomationNodeData>) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === nodeId) {
            return { ...n, data: { ...n.data, ...data } };
          }
          return n;
        }),
      );
      setIsDirty(true);
    },
    [],
  );

  const handleNodeDelete = useCallback((nodeId: string) => {
    setNodes((previousNodes) =>
      previousNodes.filter((node) => node.id !== nodeId),
    );
    setEdges((previousEdges) =>
      previousEdges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      ),
    );
    setSelectedNodeId((currentNodeId) =>
      currentNodeId === nodeId ? null : currentNodeId,
    );
    setIsDirty(true);
  }, []);

  const rule = ruleQuery.data;
  const mutationError = saveMutation.error ?? toggleMutation.error;
  const canTestRun = [
    "lead.view_all",
    "lead.view_department",
    "lead.view_assigned",
  ].some(auth.can);

  if (ruleQuery.isLoading || optionsQuery.isLoading) return <PageLoadingState variant="builder" label="Đang tải trình thiết kế automation" />;

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

  const triggerLabel =
    optionsQuery.data?.registry.triggers.find(
      (trigger) => trigger.code === rule.triggerType,
    )?.label ?? rule.triggerType;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Toolbar */}
      <AutomationBuilderToolbar
        navigate={navigate}
        rule={rule}
        triggerLabel={triggerLabel}
        mutationError={mutationError}
        isDirty={isDirty}
        canTestRun={canTestRun}
        id={id}
        auth={auth}
        saveMutation={saveMutation}
        toggleMutation={toggleMutation}
      />

      {/* Canvas & Properties Panel */}
      <div
        className="relative flex min-h-0 flex-1 overflow-hidden"
        inert={saveMutation.isPending || toggleMutation.isPending}
      >
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <AutomationBuilderCanvas
            nodes={nodes}
            edges={edges}
            nodeDefinitions={optionsQuery.data?.registry.nodes ?? []}
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
            options={optionsQuery.data}
            isLoadingOptions={optionsQuery.isLoading}
            onNodeUpdate={handleNodeUpdate}
            onNodeDelete={handleNodeDelete}
            onSave={() => saveMutation.mutate()}
            isSaving={saveMutation.isPending}
            isDirty={isDirty}
            isRuleActive={rule.isActive}
            isBusy={toggleMutation.isPending}
            saveError={
              saveMutation.error instanceof ApiError
                ? saveMutation.error.message
                : saveMutation.isError
                  ? "Không thể lưu rule. Vui lòng thử lại."
                  : undefined
            }
            isSaveSuccessful={saveMutation.isSuccess && !isDirty}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      <UnsavedAutomationDialog blocker={blocker} />
    </div>
  );
}

type AutomationBuilderToolbarProps = {
  navigate: import("react-router").NavigateFunction;
  rule: NoInfer<import("../automation.types").AutomationRuleDetail>;
  triggerLabel: string;
  mutationError: Error | null;
  isDirty: boolean;
  canTestRun: boolean;
  id: string | undefined;
  auth: {
    accessToken: string | null;
    user: import("../../../types/auth").AuthUser | null;
    isRestoring: boolean;
    restoreError: string | null;
    retryRestore: () => void;
    signIn: (input: import("../../../types/auth").LoginInput) => Promise<void>;
    signOut: () => Promise<void>;
    can: (permission: string) => boolean;
  };
  saveMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string; name: string; isActive: boolean; version: number },
    Error,
    void,
    unknown
  >;
  toggleMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string; name: string; isActive: boolean },
    Error,
    boolean,
    unknown
  >;
};

function AutomationBuilderToolbar({
  navigate,
  rule,
  triggerLabel,
  mutationError,
  isDirty,
  canTestRun,
  id,
  auth,
  saveMutation,
  toggleMutation,
}: AutomationBuilderToolbarProps) {
  return (
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
            {triggerLabel} · v{rule.version}
          </p>
        </div>
        <Badge
          variant={rule.isActive ? "default" : "secondary"}
          className="ml-1"
        >
          {rule.isActive ? "Đang chạy" : "Tắt"}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        {mutationError && (
          <p role="alert" className="max-w-80 text-sm text-destructive">
            {mutationError instanceof ApiError
              ? mutationError.message
              : "Không thể cập nhật rule. Vui lòng thử lại."}
          </p>
        )}
        {isDirty && (
          <span className="text-xs text-muted-foreground">Chưa lưu</span>
        )}
        {canTestRun && id && auth.accessToken && (
          <AutomationTestRunDialog
            ruleId={id}
            accessToken={auth.accessToken}
            disabled={
              isDirty || saveMutation.isPending || toggleMutation.isPending
            }
          />
        )}
        <SaveAutomationButton
          saveMutation={saveMutation}
          toggleMutation={toggleMutation}
          isDirty={isDirty}
          rule={rule}
        />
        <ToggleAutomationButton
          rule={rule}
          toggleMutation={toggleMutation}
          saveMutation={saveMutation}
          isDirty={isDirty}
        />
      </div>
    </header>
  );
}

function UnsavedAutomationDialog({
  blocker,
}: {
  blocker: import("react-router").Blocker;
}) {
  return (
    <Dialog
      open={blocker.state === "blocked"}
      onOpenChange={(open) => {
        if (!open && blocker.state === "blocked") blocker.reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rời trang khi chưa lưu?</DialogTitle>
          <DialogDescription>
            Các thay đổi trong sơ đồ automation chưa được lưu và sẽ bị mất nếu
            bạn rời trang.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => blocker.state === "blocked" && blocker.reset()}
          >
            Ở lại
          </Button>
          <Button
            variant="destructive"
            onClick={() => blocker.state === "blocked" && blocker.proceed()}
          >
            Rời trang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ToggleAutomationButtonProps = {
  rule: import("../automation.types").AutomationRuleDetail;
  toggleMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string; name: string; isActive: boolean },
    Error,
    boolean,
    unknown
  >;
  saveMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string; name: string; isActive: boolean; version: number },
    Error,
    void,
    unknown
  >;
  isDirty: boolean;
};

function ToggleAutomationButton({
  rule,
  toggleMutation,
  saveMutation,
  isDirty,
}: ToggleAutomationButtonProps) {
  return (
    <Button
      id="toggle-rule-btn"
      size="sm"
      variant={rule.isActive ? "secondary" : "default"}
      onClick={() => toggleMutation.mutate(!rule.isActive)}
      disabled={
        toggleMutation.isPending ||
        saveMutation.isPending ||
        (isDirty && !rule.isActive)
      }
      title={
        isDirty && !rule.isActive
          ? "Lưu thay đổi trước khi bật rule"
          : undefined
      }
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
  );
}

type SaveAutomationButtonProps = {
  saveMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string; name: string; isActive: boolean; version: number },
    Error,
    void,
    unknown
  >;
  toggleMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string; name: string; isActive: boolean },
    Error,
    boolean,
    unknown
  >;
  isDirty: boolean;
  rule: import("../automation.types").AutomationRuleDetail;
};

function SaveAutomationButton({
  saveMutation,
  toggleMutation,
  isDirty,
  rule,
}: SaveAutomationButtonProps) {
  return (
    <Button
      id="save-rule-btn"
      size="sm"
      variant="outline"
      onClick={() => saveMutation.mutate()}
      disabled={
        saveMutation.isPending ||
        toggleMutation.isPending ||
        !isDirty ||
        rule.isActive
      }
      title={rule.isActive ? "Dừng rule trước khi lưu thay đổi" : undefined}
    >
      {saveMutation.isPending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Save className="mr-1.5 h-3.5 w-3.5" />
      )}
      Lưu
    </Button>
  );
}
