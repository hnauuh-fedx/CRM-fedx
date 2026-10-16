import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/modules/auth/auth-context";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo } from "react";
import {
  buildAutomationDataFields,
  normalizeAutomationFieldReference,
} from "../../automation-data-fields";
import type {
  AutomationCondition,
  AutomationConfigField,
  AutomationDataField,
  AutomationNode,
  AutomationNodeData,
  AutomationNodeType,
  AutomationOptions,
} from "../../automation.types";
import { AutomationAssigneePicker } from "./automation-assignee-picker";
import { AutomationFieldPicker } from "./automation-field-picker";
import { ResizableNodePanel } from "./resizable-node-panel";

type TemplateFieldKey =
  | "title"
  | "content"
  | "activityContent"
  | "reminderTitle"
  | "reminderContent"
  | "messageSubject"
  | "messageContent"
  | "webhookPayload";

type ReassignmentPolicy = NonNullable<AutomationNodeData["reassignmentPolicy"]>;
const reassignmentMonitorAvailable = true;

const defaultReassignmentPolicy: ReassignmentPolicy = {
  enabled: false,
  interactionCriterion: "not_opened_since_assignment",
  timeoutMinutes: 60,
  assignToAnotherSale: true,
  excludeCurrentAssignee: true,
  maxReassignments: 3,
  recyclePool: false,
  maxPoolCycles: 1,
  warningEnabled: true,
  warningBeforeMinutes: 30,
  warningContent:
    "Bạn có Lead mới chưa được mở. Vui lòng vào tư vấn trước khi hệ thống chuyển cho nhân viên khác.",
  warningEmailEnabled: false,
  secondWarningEnabled: false,
  secondWarningBeforeMinutes: 10,
  secondWarningContent:
    "Lead sắp được chuyển cho nhân viên khác. Vui lòng chăm sóc ngay.",
  secondWarningEmailEnabled: false,
  notifyOnRemoval: true,
};

export type NodePropertiesPanelProps = {
  selectedNodeId: string | null;
  nodes: AutomationNode[];
  options?: AutomationOptions;
  isLoadingOptions: boolean;
  onNodeUpdate: (nodeId: string, data: Partial<AutomationNodeData>) => void;
  onNodeDelete: (nodeId: string) => void;
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
  isRuleActive: boolean;
  isBusy: boolean;
  saveError?: string;
  isSaveSuccessful: boolean;
  onClose: () => void;
};

export function NodePropertiesPanel({
  selectedNodeId,
  nodes,
  options,
  isLoadingOptions,
  onNodeUpdate,
  onNodeDelete,
  onSave,
  isSaving,
  isDirty,
  isRuleActive,
  isBusy,
  saveError,
  isSaveSuccessful,
  onClose,
}: NodePropertiesPanelProps) {
  const auth = useAuth();
  const canViewSensitiveLeadData = auth.can("lead.sensitive.view");
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const localData = selectedNode?.data ?? null;
  const dataFields = useMemo(
    () =>
      buildSelectableAutomationFields({ options, canViewSensitiveLeadData }),
    [canViewSensitiveLeadData, options],
  );

  if (!selectedNode || !localData) {
    return null;
  }

  const handleChange = (key: keyof AutomationNodeData, value: unknown) => {
    onNodeUpdate(selectedNode.id, { [key]: value });
  };

  const insertFieldToken = (
    key: TemplateFieldKey,
    field: AutomationDataField,
  ) => {
    const current = String(localData[key] ?? "");
    const separator = current.length > 0 && !/\s$/.test(current) ? " " : "";
    handleChange(key, `${current}${separator}{{${field.reference}}}`);
  };

  const conditions: AutomationCondition[] = localData.conditions?.length
    ? localData.conditions
    : [
        {
          id: "legacy-condition",
          field: localData.field ?? "",
          operator: localData.operator ?? "equals",
          value: localData.value ?? "",
        },
      ];

  const updateConditions = (nextConditions: AutomationCondition[]) => {
    const nextData: Partial<AutomationNodeData> = {
      conditions: nextConditions,
      field: undefined,
      operator: undefined,
      value: undefined,
    };
    onNodeUpdate(selectedNode.id, nextData);
  };

  const updateCondition = (
    index: number,
    patch: Partial<AutomationCondition>,
  ) => {
    updateConditions(
      conditions.map((condition, conditionIndex) =>
        conditionIndex === index ? { ...condition, ...patch } : condition,
      ),
    );
  };

  return (
    <ResizableNodePanel>
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold text-sm">Cấu hình thao tác</h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={onClose}
          aria-label="Đóng bảng cấu hình node"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div
        id="node-properties-content"
        className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4"
      >
        {/* Common fields */}
        <div className="space-y-2">
          <Label>Tên khối (Node name)</Label>
          <Input
            value={localData.label || ""}
            onChange={(e) => handleChange("label", e.target.value)}
          />
        </div>

        {/* Dynamic fields based on node type */}
        {selectedNode.type === "trigger" && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            Sự kiện kích hoạt được cấu hình ở cấp rule. Node này chỉ đóng vai
            trò điểm bắt đầu của luồng.
          </div>
        )}

        <ConditionNodeFields
          selectedNode={selectedNode}
          localData={localData}
          handleChange={handleChange}
          conditions={conditions}
          dataFields={dataFields}
          options={options}
          updateConditions={updateConditions}
          isLoadingOptions={isLoadingOptions}
          updateCondition={updateCondition}
        />

        <NodeActionFields
          selectedNode={selectedNode}
          localData={localData}
          options={options}
          dataFields={dataFields}
          isLoadingOptions={isLoadingOptions}
          handleChange={handleChange}
          insertFieldToken={insertFieldToken}
          onNodeUpdate={onNodeUpdate}
        />
      </div>
      <NodeActionFooter
        isSaving={isSaving}
        isRuleActive={isRuleActive}
        isSaveSuccessful={isSaveSuccessful}
        isDirty={isDirty}
        saveError={saveError}
        onSave={onSave}
        isBusy={isBusy}
        localData={localData}
        onNodeDelete={onNodeDelete}
        selectedNode={selectedNode}
      />
    </ResizableNodePanel>
  );
}

type AssignmentPoolFieldsProps = {
  data: AutomationNodeData;
  assignees: AutomationOptions["assignmentPoolAssignees"];
  knownAssignees: AutomationOptions["assignees"];
  isLoading: boolean;
  onChange: (patch: Partial<AutomationNodeData>) => void;
};

function AssignmentPoolFields({
  data,
  assignees,
  knownAssignees,
  isLoading,
  onChange,
}: AssignmentPoolFieldsProps) {
  const selectedIds = [...new Set(data.assigneeIds ?? [])];
  const poolAssigneeById = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.id, assignee])),
    [assignees],
  );
  const assigneeById = useMemo(
    () =>
      new Map(
        assignees
          .filter((assignee) => assignee.canReceiveLead)
          .map((assignee) => [assignee.id, assignee]),
      ),
    [assignees],
  );
  const knownAssigneeById = useMemo(
    () => new Map(knownAssignees.map((assignee) => [assignee.id, assignee])),
    [knownAssignees],
  );
  const weightByAssignee = new Map(
    (data.assigneeWeights ?? []).map((item) => [item.assigneeId, item.weight]),
  );
  const strategy = data.assignmentStrategy ?? "round_robin";

  const updateSelectedIds = (nextIds: string[]) =>
    onChange({
      assigneeIds: nextIds,
      assigneeWeights: nextIds.map((assigneeId) => ({
        assigneeId,
        weight: weightByAssignee.get(assigneeId) ?? 1,
      })),
    });

  const updateWeight = (assigneeId: string, weight: number) =>
    onChange({
      assigneeWeights: selectedIds.map((selectedId) => ({
        assigneeId: selectedId,
        weight:
          selectedId === assigneeId
            ? Math.min(100, Math.max(1, Math.round(weight) || 1))
            : (weightByAssignee.get(selectedId) ?? 1),
      })),
    });

  return (
    <FieldSet className="gap-4 rounded-lg border bg-muted/20 p-3">
      <FieldLegend id="assignment-pool-heading" variant="label">
        Cách chia Sale
      </FieldLegend>
      <FieldGroup className="gap-4">
        <Field className="gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={strategy === "least_loaded" ? "" : strategy}
            className="grid w-full grid-cols-2"
            aria-label="Cách chia Sale"
            onValueChange={(value) => {
              if (value === "weighted" || value === "round_robin") {
                onChange({ assignmentStrategy: value });
              }
            }}
          >
            <ToggleGroupItem value="weighted" className="min-h-11 w-full">
              Theo trọng số
            </ToggleGroupItem>
            <ToggleGroupItem value="round_robin" className="min-h-11 w-full">
              Chia đều
            </ToggleGroupItem>
          </ToggleGroup>
          {strategy === "least_loaded" ? (
            <FieldDescription>
              Rule cũ đang dùng chế độ “Ít Lead nhất”. Chọn một chế độ phía trên
              để thay đổi.
            </FieldDescription>
          ) : null}
        </Field>

        <Field className="gap-2">
          <FieldLabel>Thêm Sale vào danh sách</FieldLabel>
          <AutomationAssigneePicker
            assignees={assignees}
            selectedIds={selectedIds}
            isLoading={isLoading}
            onSelect={(assigneeId) =>
              updateSelectedIds([...selectedIds, assigneeId])
            }
          />
          <FieldDescription>
            Hiển thị toàn bộ nhân viên đang hoạt động trong chương trình làm
            việc, không lọc theo team/phòng ban đã chọn.
          </FieldDescription>
        </Field>

        <Field className="gap-2">
          <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2.75rem] items-end gap-2 px-1 text-xs font-medium text-muted-foreground">
            <span>Sale</span>
            <span>Trọng số</span>
            <span>Đã gán</span>
            <span className="sr-only">Thao tác</span>
          </div>
          {selectedIds.length === 0 ? (
            <Empty className="border bg-background p-4">
              <EmptyHeader>
                <EmptyDescription>
                  Chưa có Sale trong danh sách phân công.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            selectedIds.map((assigneeId) => {
              const assignee = assigneeById.get(assigneeId);
              const poolAssignee = poolAssigneeById.get(assigneeId);
              const knownAssignee = knownAssigneeById.get(assigneeId);
              const assigneeName =
                assignee?.fullName ??
                poolAssignee?.fullName ??
                knownAssignee?.fullName ??
                "Người dùng không còn hoạt động";
              const unavailableReason = assignee
                ? null
                : poolAssignee || knownAssignee
                  ? "Không đủ quyền nhận Lead hoặc nằm ngoài phạm vi phân công"
                  : "Tài khoản không còn khả dụng";
              return (
                <Field
                  key={assigneeId}
                  orientation="horizontal"
                  className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2.75rem] items-center gap-2 rounded-md border bg-background p-1"
                >
                  <span
                    className="min-w-0 px-2 text-sm"
                    title={unavailableReason ?? assigneeName}
                  >
                    <span className="block break-words">{assigneeName}</span>
                    {unavailableReason ? (
                      <span className="block break-words text-xs text-destructive">
                        {unavailableReason}
                      </span>
                    ) : null}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    inputMode="numeric"
                    className="min-h-11"
                    value={weightByAssignee.get(assigneeId) ?? 1}
                    aria-label={`Trọng số của ${assigneeName}`}
                    onChange={(event) =>
                      updateWeight(assigneeId, Number(event.target.value))
                    }
                  />
                  <output
                    className="flex h-9 items-center rounded-md border bg-muted px-2 text-sm tabular-nums"
                    aria-label={`Số Lead đã gán cho ${assigneeName}`}
                  >
                    {assignee?.assignedCount ??
                      poolAssignee?.assignedCount ??
                      knownAssignee?.assignedCount ??
                      0}
                  </output>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="size-11"
                    aria-label={`Xóa ${assigneeName} khỏi danh sách`}
                    onClick={() =>
                      updateSelectedIds(
                        selectedIds.filter((id) => id !== assigneeId),
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </Field>
              );
            })
          )}
          <FieldDescription>
            “Đã gán” là số Lead hiện đang do Sale phụ trách trong chương trình
            làm việc.
          </FieldDescription>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}

function durationParts(minutes: number) {
  if (minutes >= 1_440 && minutes % 1_440 === 0)
    return { value: minutes / 1_440, unit: "days" as const };
  if (minutes >= 60 && minutes % 60 === 0)
    return { value: minutes / 60, unit: "hours" as const };
  return { value: minutes, unit: "minutes" as const };
}

function DurationInput({
  id,
  minutes,
  minMinutes = 1,
  maxMinutes,
  onChange,
}: {
  id: string;
  minutes: number;
  minMinutes?: number;
  maxMinutes: number;
  onChange: (minutes: number) => void;
}) {
  const parts = durationParts(minutes);
  const multipliers = { minutes: 1, hours: 60, days: 1_440 } as const;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
      <Input
        id={id}
        type="number"
        min={Math.max(1, Math.ceil(minMinutes / multipliers[parts.unit]))}
        max={Math.max(1, Math.floor(maxMinutes / multipliers[parts.unit]))}
        value={parts.value}
        onChange={(event) =>
          onChange(
            Math.min(
              maxMinutes,
              Math.max(
                minMinutes,
                (Number(event.target.value) || 1) * multipliers[parts.unit],
              ),
            ),
          )
        }
      />
      <Select
        value={parts.unit}
        onValueChange={(unit) =>
          onChange(
            Math.min(
              maxMinutes,
              Math.max(
                minMinutes,
                parts.value * multipliers[unit as keyof typeof multipliers],
              ),
            ),
          )
        }
      >
        <SelectTrigger aria-label="Đơn vị thời gian">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">Phút</SelectItem>
          <SelectItem value="hours">Giờ</SelectItem>
          <SelectItem value="days">Ngày</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ReassignmentPolicyFields({
  policy: storedPolicy,
  emailProviderAvailable,
  onChange,
}: {
  policy: ReassignmentPolicy;
  emailProviderAvailable: boolean;
  onChange: (policy: ReassignmentPolicy) => void;
}) {
  const policy = { ...defaultReassignmentPolicy, ...storedPolicy };
  const patchPolicy = (patch: Partial<ReassignmentPolicy>) =>
    onChange({ ...policy, ...patch });
  return (
    <section
      className="space-y-4 rounded-lg border bg-muted/20 p-3"
      aria-labelledby="reassignment-policy-heading"
    >
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox
          id="reassignment-policy-enabled"
          checked={policy.enabled}
          disabled={!reassignmentMonitorAvailable}
          onCheckedChange={(checked) =>
            patchPolicy({ enabled: checked === true })
          }
        />
        <span
          id="reassignment-policy-heading"
          className="text-sm font-semibold"
        >
          Chuyển sale không tương tác với khách hàng
        </span>
      </label>

      {!reassignmentMonitorAvailable ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Đây là bản xem trước cấu hình. Có thể bật sau khi bộ giám sát và job
          chuyển sale ở Giai đoạn C hoàn tất.
        </p>
      ) : null}

      {policy.enabled || !reassignmentMonitorAvailable ? (
        <fieldset
          disabled={!reassignmentMonitorAvailable}
          className="space-y-5 border-l-2 border-primary/20 pl-3"
        >
          <div
            className="space-y-2"
            role="radiogroup"
            aria-labelledby="interaction-criterion-label"
          >
            <p id="interaction-criterion-label" className="text-sm font-medium">
              Chọn điều kiện tương tác
            </p>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="interaction-criterion"
                checked={
                  policy.interactionCriterion ===
                  "no_care_activity_since_assignment"
                }
                onChange={() =>
                  patchPolicy({
                    interactionCriterion: "no_care_activity_since_assignment",
                  })
                }
              />{" "}
              Không ghi chú/chăm sóc kể từ thời điểm gán
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="interaction-criterion"
                checked={
                  policy.interactionCriterion ===
                  "no_data_update_since_assignment"
                }
                onChange={() =>
                  patchPolicy({
                    interactionCriterion: "no_data_update_since_assignment",
                  })
                }
              />{" "}
              Không cập nhật trường dữ liệu kể từ thời điểm gán
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="interaction-criterion"
                checked={
                  policy.interactionCriterion === "not_opened_since_assignment"
                }
                onChange={() =>
                  patchPolicy({
                    interactionCriterion: "not_opened_since_assignment",
                  })
                }
              />{" "}
              Không mở bản ghi kể từ thời điểm gán
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reassignment-timeout">
              Loại bỏ sale nếu không tương tác sau
            </Label>
            <DurationInput
              id="reassignment-timeout"
              minutes={policy.timeoutMinutes}
              minMinutes={
                policy.secondWarningEnabled ? 3 : policy.warningEnabled ? 2 : 1
              }
              maxMinutes={43_200}
              onChange={(timeoutMinutes) =>
                patchPolicy({
                  timeoutMinutes,
                  warningBeforeMinutes: Math.min(
                    policy.warningBeforeMinutes,
                    Math.max(1, timeoutMinutes - 1),
                  ),
                  secondWarningBeforeMinutes: Math.min(
                    policy.secondWarningBeforeMinutes ?? 1,
                    Math.max(1, timeoutMinutes - 2),
                  ),
                })
              }
            />
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox
              checked={policy.assignToAnotherSale}
              onCheckedChange={(checked) =>
                patchPolicy({ assignToAnotherSale: checked === true })
              }
            />
            <span className="text-sm">
              Gán cho nhân viên khác sau khi loại bỏ sale
            </span>
          </label>
          {policy.assignToAnotherSale ? (
            <div className="space-y-2 pl-7">
              <Label htmlFor="max-reassignments">Số lần gán lại tối đa</Label>
              <Input
                id="max-reassignments"
                type="number"
                min={1}
                max={100}
                value={policy.maxReassignments}
                onChange={(event) =>
                  patchPolicy({
                    maxReassignments: Math.min(
                      100,
                      Math.max(1, Number(event.target.value) || 1),
                    ),
                  })
                }
              />
            </div>
          ) : null}

          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox
              checked={policy.recyclePool}
              onCheckedChange={(checked) =>
                patchPolicy({ recyclePool: checked === true })
              }
            />
            <span className="text-sm">Cho phép chia lại khi hết danh sách</span>
          </label>
          {policy.recyclePool ? (
            <div className="space-y-2 pl-7">
              <Label htmlFor="max-pool-cycles">Số vòng chia lại tối đa</Label>
              <Input
                id="max-pool-cycles"
                type="number"
                min={1}
                max={100}
                value={policy.maxPoolCycles}
                onChange={(event) =>
                  patchPolicy({
                    maxPoolCycles: Math.min(
                      100,
                      Math.max(1, Number(event.target.value) || 1),
                    ),
                  })
                }
              />
            </div>
          ) : null}

          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox
              checked={policy.warningEnabled}
              onCheckedChange={(checked) =>
                patchPolicy({
                  warningEnabled: checked === true,
                  secondWarningEnabled:
                    checked === true ? policy.secondWarningEnabled : false,
                  timeoutMinutes:
                    checked === true
                      ? Math.max(2, policy.timeoutMinutes)
                      : policy.timeoutMinutes,
                })
              }
            />
            <span className="text-sm">
              Gửi cảnh báo cho nhân viên không tương tác
            </span>
          </label>
          <ReassignmentWarningFields
            policy={policy}
            patchPolicy={patchPolicy}
            emailProviderAvailable={emailProviderAvailable}
          />

          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox
              checked={policy.notifyOnRemoval}
              onCheckedChange={(checked) =>
                patchPolicy({ notifyOnRemoval: checked === true })
              }
            />
            <span className="text-sm">
              Gửi thông báo khi nhân viên bị loại khỏi bản ghi
            </span>
          </label>
        </fieldset>
      ) : (
        <p className="text-xs text-muted-foreground">
          Bật tùy chọn để theo dõi thời gian sale chưa mở Lead sau khi được gán.
        </p>
      )}
    </section>
  );
}

type RegistryNodeFieldsProps = {
  nodeType: AutomationNodeType;
  data: AutomationNodeData;
  options?: AutomationOptions;
  dataFields: AutomationDataField[];
  isLoading: boolean;
  onChange: (key: keyof AutomationNodeData, value: unknown) => void;
  onInsertToken: (key: TemplateFieldKey, field: AutomationDataField) => void;
};

function RegistryNodeFields({
  nodeType,
  data,
  options,
  dataFields,
  isLoading,
  onChange,
  onInsertToken,
}: RegistryNodeFieldsProps) {
  const definition = options?.registry.nodes.find(
    (node) => node.type === nodeType,
  );
  if (!definition) {
    return (
      <p className="text-sm text-muted-foreground">
        {isLoading
          ? "Đang tải cấu hình..."
          : "Không tìm thấy cấu hình cho block này."}
      </p>
    );
  }

  const getSelectOptions = (field: AutomationConfigField) => {
    if (field.options) return field.options;
    if (field.optionsSource === "assignees")
      return (options?.assignees ?? []).map((item) => ({
        code: item.id,
        label: item.fullName,
      }));
    if (field.optionsSource === "departments")
      return (options?.departments ?? []).map((item) => ({
        code: item.id,
        label: item.name,
      }));
    if (field.optionsSource === "pipelineStages")
      return (options?.pipelineStages ?? []).map((item) => ({
        code: item.id,
        label: item.pipelineName
          ? `${item.pipelineName} — ${item.name}`
          : item.name,
      }));
    if (field.optionsSource === "targetRoles")
      return (options?.targetRoles ?? []).map((item) => ({
        code: item.code,
        label: item.name,
      }));
    if (field.optionsSource === "customerLists")
      return (options?.customerLists ?? []).map((item) => ({
        code: item.id,
        label: item.name,
      }));
    if (field.optionsSource === "webhookEndpoints")
      return (options?.webhookEndpoints ?? []).map((item) => ({
        code: item.id,
        label: item.name,
      }));
    if (field.optionsSource === "majors")
      return (options?.majors ?? []).map((item) => ({
        code: item.id,
        label: item.name,
      }));
    if (field.optionsSource === "admissionStatuses")
      return (options?.admissionStatuses ?? []).map((item) => ({
        code: item.id,
        label: item.name,
      }));
    if (field.optionsSource === "admissionClasses")
      return (options?.admissionClasses ?? []).map((item) => ({
        code: item.id,
        label: item.code ? `${item.code} — ${item.name}` : item.name,
      }));
    return [];
  };

  return (
    <div className="space-y-4">
      {definition.configFields
        .filter(
          (field) =>
            field.control !== "condition_group" &&
            !(
              nodeType === "action_assign_pool" &&
              ["assignmentStrategy", "assigneeIds", "departmentId"].includes(
                field.key,
              )
            ) &&
            (!field.visibleForTriggerTypes ||
              field.visibleForTriggerTypes.includes(data.triggerType ?? "")),
        )
        .map((field) => {
          const value = data[field.key];
          const canInsertToken = [
            "title",
            "content",
            "activityContent",
            "reminderTitle",
            "reminderContent",
            "messageSubject",
            "messageContent",
            "webhookPayload",
          ].includes(field.key);

          return (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`node-field-${field.key}`}>
                {field.label}
                {field.required ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </Label>
              {field.control === "multi_select" ? (
                <div
                  className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2"
                  aria-label={field.label}
                >
                  {getSelectOptions(field).map((option) => {
                    const selectedValues = Array.isArray(value)
                      ? value.filter(
                          (item): item is string => typeof item === "string",
                        )
                      : [];
                    const checked = selectedValues.includes(option.code);
                    return (
                      <label
                        key={option.code}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-muted"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(nextChecked) =>
                            onChange(
                              field.key,
                              nextChecked
                                ? [...selectedValues, option.code]
                                : selectedValues.filter(
                                    (item) => item !== option.code,
                                  ),
                            )
                          }
                        />
                        <span className="text-sm">{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : field.control === "select" ? (
                <Select
                  value={typeof value === "string" ? value : ""}
                  onValueChange={(nextValue) => onChange(field.key, nextValue)}
                >
                  <SelectTrigger id={`node-field-${field.key}`}>
                    <SelectValue
                      placeholder={
                        isLoading
                          ? "Đang tải..."
                          : `Chọn ${field.label.toLocaleLowerCase()}...`
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {getSelectOptions(field).map((option) => (
                      <SelectItem key={option.code} value={option.code}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.control === "template_textarea" ? (
                <Textarea
                  id={`node-field-${field.key}`}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
              ) : (
                <Input
                  id={`node-field-${field.key}`}
                  type={field.control === "number" ? "number" : "text"}
                  min={field.min}
                  value={
                    typeof value === "string" || typeof value === "number"
                      ? value
                      : ""
                  }
                  onChange={(event) =>
                    onChange(
                      field.key,
                      field.control === "number"
                        ? Number(event.target.value)
                        : event.target.value,
                    )
                  }
                />
              )}
              {canInsertToken && (
                <>
                  <AutomationFieldPicker
                    fields={dataFields}
                    placeholder={`Chèn trường vào ${field.label.toLocaleLowerCase()}`}
                    onSelect={(selectedField) =>
                      onInsertToken(
                        field.key as TemplateFieldKey,
                        selectedField,
                      )
                    }
                  />
                  <TemplatePreview
                    value={typeof value === "string" ? value : ""}
                    fields={dataFields}
                  />
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}

function TemplatePreview({
  value,
  fields,
}: {
  value: string;
  fields: AutomationDataField[];
}) {
  if (!value.trim()) return null;
  const labels = new Map(fields.map((field) => [field.reference, field.label]));
  const preview = value.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (_token, reference: string) =>
      `[${labels.get(reference.trim()) ?? "Trường không hợp lệ"}]`,
  );
  return (
    <div
      className="rounded-md border bg-muted/30 p-3"
      aria-label="Xem trước mẫu an toàn"
    >
      <p className="mb-1 text-xs font-medium">Xem trước an toàn</p>
      <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {preview}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Bản xem trước chỉ hiển thị tên biến, không tải dữ liệu thật của Lead.
      </p>
    </div>
  );
}

type ConditionNodeFieldsProps = {
  selectedNode: AutomationNode;
  localData: AutomationNodeData;
  handleChange: (key: keyof AutomationNodeData, value: unknown) => void;
  conditions: AutomationCondition[];
  dataFields: AutomationDataField[];
  options: AutomationOptions | undefined;
  updateConditions: (nextConditions: AutomationCondition[]) => void;
  isLoadingOptions: boolean;
  updateCondition: (index: number, patch: Partial<AutomationCondition>) => void;
};

function ConditionNodeFields({
  selectedNode,
  localData,
  handleChange,
  conditions,
  dataFields,
  options,
  updateConditions,
  isLoadingOptions,
  updateCondition,
}: ConditionNodeFieldsProps) {
  return (
    selectedNode.type === "condition" && (
      <div className="space-y-4 border rounded-md p-3 bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Bộ lọc điều kiện</h4>
          <div
            className="inline-flex rounded-md border bg-background p-0.5"
            aria-label="Cách kết hợp điều kiện"
          >
            {(["AND", "OR"] as const).map((combinator) => (
              <Button
                key={combinator}
                type="button"
                size="sm"
                variant={
                  localData.conditionCombinator === combinator ||
                  (!localData.conditionCombinator && combinator === "AND")
                    ? "secondary"
                    : "ghost"
                }
                className="min-h-11 min-w-11 px-2.5"
                aria-pressed={
                  localData.conditionCombinator === combinator ||
                  (!localData.conditionCombinator && combinator === "AND")
                }
                onClick={() => handleChange("conditionCombinator", combinator)}
              >
                {combinator}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {localData.conditionCombinator === "OR"
            ? "Chỉ cần một điều kiện đúng."
            : "Tất cả điều kiện phải đúng."}
        </p>
        {conditions.map((condition, index) => {
          const normalizedReference = normalizeAutomationFieldReference(
            condition.field,
          );
          const selectedField = dataFields.find(
            (field) => field.reference === normalizedReference,
          );
          const operators = (options?.registry.operators ?? []).filter(
            (operator) =>
              !selectedField ||
              operator.dataTypes.includes(selectedField.dataType),
          );
          const selectedOperator = operators.find(
            (operator) => operator.code === condition.operator,
          );

          return (
            <div
              key={
                condition.id ??
                `${condition.field}:${condition.operator}:${condition.value ?? ""}`
              }
              className="space-y-3 rounded-md border bg-background p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">Điều kiện {index + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 text-destructive"
                  disabled={conditions.length === 1}
                  aria-label={`Xóa điều kiện ${index + 1}`}
                  onClick={() =>
                    updateConditions(
                      conditions.filter(
                        (_, conditionIndex) => conditionIndex !== index,
                      ),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Trường dữ liệu</Label>
                <AutomationFieldPicker
                  fields={dataFields}
                  selectedReference={normalizedReference}
                  placeholder={
                    isLoadingOptions
                      ? "Đang tải trường dữ liệu..."
                      : "Chọn trường dữ liệu..."
                  }
                  onSelect={(field) =>
                    updateCondition(index, {
                      field: field.reference,
                      operator: "equals",
                      value: "",
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Toán tử</Label>
                <Select
                  value={condition.operator || "equals"}
                  onValueChange={(operator) =>
                    updateCondition(index, { operator, value: "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn toán tử..." />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((operator) => (
                      <SelectItem key={operator.code} value={operator.code}>
                        {operator.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedOperator?.requiresValue !== false && (
                <div className="space-y-2">
                  <Label className="text-xs">Giá trị so sánh</Label>
                  {["in", "not_in"].includes(condition.operator) ? (
                    <Input
                      placeholder="Nhập các giá trị, phân cách bằng dấu phẩy"
                      value={condition.value || ""}
                      onChange={(event) =>
                        updateCondition(index, { value: event.target.value })
                      }
                    />
                  ) : selectedField?.options.length ? (
                    <Select
                      value={condition.value || ""}
                      onValueChange={(value) =>
                        updateCondition(index, { value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn giá trị..." />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedField.options.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : selectedField?.dataType === "BOOLEAN" ? (
                    <Select
                      value={condition.value || ""}
                      onValueChange={(value) =>
                        updateCondition(index, { value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn giá trị..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Có</SelectItem>
                        <SelectItem value="false">Không</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={
                        selectedField?.dataType === "NUMBER"
                          ? "number"
                          : selectedField?.dataType === "DATE"
                            ? "date"
                            : "text"
                      }
                      placeholder="Nhập giá trị so sánh"
                      value={condition.value || ""}
                      onChange={(event) =>
                        updateCondition(index, { value: event.target.value })
                      }
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() =>
            updateConditions([
              ...conditions,
              {
                id: crypto.randomUUID(),
                field: "",
                operator: "equals",
                value: "",
              },
            ])
          }
        >
          <Plus aria-hidden="true" />
          Thêm điều kiện
        </Button>
        <p className="text-xs text-muted-foreground">
          {dataFields.length} trường dữ liệu đang khả dụng theo quyền truy cập.
        </p>
      </div>
    )
  );
}

type ReassignmentWarningFieldsProps = {
  policy: {
    enabled: boolean;
    interactionCriterion:
      | "not_opened_since_assignment"
      | "no_care_activity_since_assignment"
      | "no_data_update_since_assignment";
    timeoutMinutes: number;
    assignToAnotherSale: boolean;
    excludeCurrentAssignee: true;
    maxReassignments: number;
    recyclePool: boolean;
    maxPoolCycles: number;
    warningEnabled: boolean;
    warningBeforeMinutes: number;
    warningContent: string;
    warningEmailEnabled?: boolean;
    secondWarningEnabled?: boolean;
    secondWarningBeforeMinutes?: number;
    secondWarningContent?: string;
    secondWarningEmailEnabled?: boolean;
    notifyOnRemoval: boolean;
  };
  patchPolicy: (patch: Partial<ReassignmentPolicy>) => void;
  emailProviderAvailable: boolean;
};

function ReassignmentWarningFields({
  policy,
  patchPolicy,
  emailProviderAvailable,
}: ReassignmentWarningFieldsProps) {
  return policy.warningEnabled ? (
    <div className="space-y-4 pl-7">
      <div className="space-y-2">
        <Label htmlFor="warning-before">Cảnh báo trước khi chuyển sale</Label>
        <DurationInput
          id="warning-before"
          minutes={policy.warningBeforeMinutes}
          minMinutes={policy.secondWarningEnabled ? 2 : 1}
          maxMinutes={Math.max(1, policy.timeoutMinutes - 1)}
          onChange={(warningBeforeMinutes) =>
            patchPolicy({
              warningBeforeMinutes,
              secondWarningBeforeMinutes: Math.min(
                policy.secondWarningBeforeMinutes ?? 1,
                Math.max(1, warningBeforeMinutes - 1),
              ),
            })
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Kênh V1: thông báo trong CRM.
      </p>
      <div className="space-y-2">
        <Label htmlFor="warning-content">Nội dung thông báo</Label>
        <Textarea
          id="warning-content"
          rows={4}
          value={policy.warningContent}
          onChange={(event) =>
            patchPolicy({ warningContent: event.target.value })
          }
        />
        <p className="text-xs text-muted-foreground">
          Thông báo được gửi cho sale đang phụ trách bản ghi.
        </p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox
          checked={policy.warningEmailEnabled}
          disabled={!emailProviderAvailable}
          onCheckedChange={(checked) =>
            patchPolicy({ warningEmailEnabled: checked === true })
          }
        />
        <span className="text-sm">Gửi thêm email cho Sale</span>
      </label>
      {!emailProviderAvailable ? (
        <p className="text-xs text-muted-foreground">
          Email chỉ bật được khi provider email đã được cấu hình.
        </p>
      ) : null}

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox
          checked={policy.secondWarningEnabled}
          onCheckedChange={(checked) =>
            patchPolicy(
              checked === true
                ? {
                    secondWarningEnabled: true,
                    timeoutMinutes: Math.max(3, policy.timeoutMinutes),
                    warningBeforeMinutes: Math.max(
                      2,
                      policy.warningBeforeMinutes,
                    ),
                    secondWarningBeforeMinutes: Math.min(
                      policy.secondWarningBeforeMinutes ?? 1,
                      Math.max(1, policy.warningBeforeMinutes - 1),
                    ),
                  }
                : { secondWarningEnabled: false },
            )
          }
        />
        <span className="text-sm">Gửi cảnh báo lần hai</span>
      </label>
      {policy.secondWarningEnabled ? (
        <div className="space-y-4 border-l-2 border-primary/20 pl-4">
          <div className="space-y-2">
            <Label htmlFor="second-warning-before">
              Cảnh báo lần hai trước khi chuyển Sale
            </Label>
            <DurationInput
              id="second-warning-before"
              minutes={policy.secondWarningBeforeMinutes ?? 1}
              maxMinutes={Math.max(1, policy.warningBeforeMinutes - 1)}
              onChange={(secondWarningBeforeMinutes) =>
                patchPolicy({ secondWarningBeforeMinutes })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="second-warning-content">
              Nội dung cảnh báo lần hai
            </Label>
            <Textarea
              id="second-warning-content"
              rows={4}
              value={policy.secondWarningContent ?? ""}
              onChange={(event) =>
                patchPolicy({ secondWarningContent: event.target.value })
              }
            />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox
              checked={policy.secondWarningEmailEnabled}
              disabled={!emailProviderAvailable}
              onCheckedChange={(checked) =>
                patchPolicy({ secondWarningEmailEnabled: checked === true })
              }
            />
            <span className="text-sm">Gửi thêm email ở cảnh báo lần hai</span>
          </label>
        </div>
      ) : null}
    </div>
  ) : null;
}

function buildSelectableAutomationFields({
  options,
  canViewSensitiveLeadData,
}: {
  options: AutomationOptions | undefined;
  canViewSensitiveLeadData: boolean;
}) {
  return buildAutomationDataFields(
    options?.registry.fields ?? [],
    options?.customDataFields ?? [],
    canViewSensitiveLeadData,
    options?.systemFieldOptions,
  ).map((field) => {
    if (field.reference === "system:pipelineStageId") {
      return {
        ...field,
        options: (options?.pipelineStages ?? []).map((stage) => ({
          code: stage.id,
          label: stage.pipelineName
            ? `${stage.pipelineName} — ${stage.name}`
            : stage.name,
        })),
      };
    }
    if (field.reference === "system:assigneeId") {
      return {
        ...field,
        options: (options?.assignees ?? []).map((assignee) => ({
          code: assignee.id,
          label: assignee.fullName,
        })),
      };
    }
    return field;
  });
}

type NodeActionFieldsProps = {
  selectedNode: AutomationNode;
  localData: AutomationNodeData;
  options: AutomationOptions | undefined;
  dataFields: AutomationDataField[];
  isLoadingOptions: boolean;
  handleChange: (key: keyof AutomationNodeData, value: unknown) => void;
  insertFieldToken: (key: TemplateFieldKey, field: AutomationDataField) => void;
  onNodeUpdate: (nodeId: string, data: Partial<AutomationNodeData>) => void;
};

function NodeActionFields({
  selectedNode,
  localData,
  options,
  dataFields,
  isLoadingOptions,
  handleChange,
  insertFieldToken,
  onNodeUpdate,
}: NodeActionFieldsProps) {
  return (
    selectedNode.type !== "condition" && (
      <>
        <RegistryNodeFields
          nodeType={selectedNode.type}
          data={localData}
          options={options}
          dataFields={dataFields}
          isLoading={isLoadingOptions}
          onChange={handleChange}
          onInsertToken={insertFieldToken}
        />
        {selectedNode.type === "action_assign_pool" ? (
          <>
            <AssignmentPoolFields
              data={localData}
              assignees={options?.assignmentPoolAssignees ?? []}
              knownAssignees={options?.assignees ?? []}
              isLoading={isLoadingOptions}
              onChange={(patch) => onNodeUpdate(selectedNode.id, patch)}
            />
            <ReassignmentPolicyFields
              policy={localData.reassignmentPolicy ?? defaultReassignmentPolicy}
              emailProviderAvailable={
                options?.providerCapabilities.email ?? false
              }
              onChange={(reassignmentPolicy) =>
                handleChange("reassignmentPolicy", reassignmentPolicy)
              }
            />
          </>
        ) : null}
      </>
    )
  );
}

type NodeActionFooterProps = {
  isSaving: boolean;
  isRuleActive: boolean;
  isSaveSuccessful: boolean;
  isDirty: boolean;
  saveError: string | undefined;
  onSave: () => void;
  isBusy: boolean;
  localData: AutomationNodeData;
  onNodeDelete: (nodeId: string) => void;
  selectedNode: AutomationNode;
};

function NodeActionFooter({
  isSaving,
  isRuleActive,
  isSaveSuccessful,
  isDirty,
  saveError,
  onSave,
  isBusy,
  localData,
  onNodeDelete,
  selectedNode,
}: NodeActionFooterProps) {
  return (
    <div className="flex shrink-0 flex-col gap-3 border-t p-4">
      <p className="text-xs text-muted-foreground" role="status">
        <NodeSaveStatus
          isSaving={isSaving}
          isRuleActive={isRuleActive}
          isSaveSuccessful={isSaveSuccessful}
          isDirty={isDirty}
        />
      </p>
      {saveError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      ) : null}
      <Button
        type="button"
        className="min-h-11 w-full"
        onClick={onSave}
        disabled={isSaving || isBusy || !isDirty || isRuleActive}
      >
        {isSaving ? (
          <Loader2
            data-icon="inline-start"
            className="animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Save data-icon="inline-start" aria-hidden="true" />
        )}
        {isSaving ? "Đang lưu…" : "Lưu thay đổi"}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 w-full"
            disabled={isSaving || isBusy}
          >
            <Trash2 data-icon="inline-start" aria-hidden="true" />
            Xóa node
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Xóa node “{localData.label || "Chưa đặt tên"}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Node và tất cả kết nối đến node này sẽ bị xóa khỏi sơ đồ. Thay đổi
              chỉ có hiệu lực sau khi bạn lưu rule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={() => onNodeDelete(selectedNode.id)}>
              Xóa node
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NodeSaveStatus({
  isSaving,
  isRuleActive,
  isSaveSuccessful,
  isDirty,
}: {
  isSaving: boolean;
  isRuleActive: boolean;
  isSaveSuccessful: boolean;
  isDirty: boolean;
}) {
  if (isSaving) return "Đang lưu thay đổi…";
  if (isRuleActive) return "Dừng rule trước khi lưu thay đổi.";
  if (isSaveSuccessful) return "Đã lưu thay đổi.";
  if (isDirty) return "Có thay đổi chưa lưu. Nút lưu sẽ lưu toàn bộ sơ đồ.";
  return "Không có thay đổi chưa lưu.";
}
