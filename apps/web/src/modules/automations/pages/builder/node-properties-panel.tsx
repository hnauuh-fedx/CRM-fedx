import { useMemo } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/modules/auth/auth-context";
import { buildAutomationDataFields, normalizeAutomationFieldReference } from "../../automation-data-fields";
import type {
  AutomationCondition,
  AutomationConfigField,
  AutomationDataField,
  AutomationNode,
  AutomationNodeData,
  AutomationNodeType,
  AutomationOptions,
} from "../../automation.types";
import { AutomationFieldPicker } from "./automation-field-picker";

type TemplateFieldKey = "title" | "content" | "activityContent" | "reminderTitle" | "reminderContent" | "messageSubject" | "messageContent" | "webhookPayload";

type ReassignmentPolicy = NonNullable<AutomationNodeData["reassignmentPolicy"]>;
const reassignmentMonitorAvailable = false;

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
  warningContent: "Bạn có Lead mới chưa được mở. Vui lòng vào tư vấn trước khi hệ thống chuyển cho nhân viên khác.",
  notifyOnRemoval: true,
};

export type NodePropertiesPanelProps = {
  selectedNodeId: string | null;
  nodes: AutomationNode[];
  options?: AutomationOptions;
  isLoadingOptions: boolean;
  onNodeUpdate: (nodeId: string, data: Partial<AutomationNodeData>) => void;
  onClose: () => void;
};

export function NodePropertiesPanel({ selectedNodeId, nodes, options, isLoadingOptions, onNodeUpdate, onClose }: NodePropertiesPanelProps) {
  const auth = useAuth();
  const canViewSensitiveLeadData = auth.can("lead.sensitive.view");
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const localData = selectedNode?.data ?? null;
  const dataFields = useMemo(() => buildAutomationDataFields(
    options?.registry.fields ?? [],
    options?.customDataFields ?? [],
    canViewSensitiveLeadData,
    options?.systemFieldOptions,
  ).map((field) => {
    if (field.reference === "system:pipelineStageId") {
      return { ...field, options: (options?.pipelineStages ?? []).map((stage) => ({ code: stage.id, label: stage.pipelineName ? `${stage.pipelineName} — ${stage.name}` : stage.name })) };
    }
    if (field.reference === "system:assigneeId") {
      return { ...field, options: (options?.assignees ?? []).map((assignee) => ({ code: assignee.id, label: assignee.fullName })) };
    }
    return field;
  }), [canViewSensitiveLeadData, options?.assignees, options?.customDataFields, options?.pipelineStages, options?.registry.fields, options?.systemFieldOptions]);

  if (!selectedNode || !localData) {
    return null;
  }

  const handleChange = (key: keyof AutomationNodeData, value: unknown) => {
    onNodeUpdate(selectedNode.id, { [key]: value });
  };

  const insertFieldToken = (key: TemplateFieldKey, field: AutomationDataField) => {
    const current = String(localData[key] ?? "");
    const separator = current.length > 0 && !/\s$/.test(current) ? " " : "";
    handleChange(key, `${current}${separator}{{${field.reference}}}`);
  };

  const conditions: AutomationCondition[] = localData.conditions?.length
    ? localData.conditions
    : [{ id: "legacy-condition", field: localData.field ?? "", operator: localData.operator ?? "equals", value: localData.value ?? "" }];

  const updateConditions = (nextConditions: AutomationCondition[]) => {
    const nextData: Partial<AutomationNodeData> = {
      conditions: nextConditions,
      field: undefined,
      operator: undefined,
      value: undefined,
    };
    onNodeUpdate(selectedNode.id, nextData);
  };

  const updateCondition = (index: number, patch: Partial<AutomationCondition>) => {
    updateConditions(conditions.map((condition, conditionIndex) => (
      conditionIndex === index ? { ...condition, ...patch } : condition
    )));
  };

  return (
    <div className="w-96 max-w-[100vw] border-l bg-background flex flex-col h-full shadow-sm z-10 shrink-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold text-sm">Cấu hình thao tác</h3>
        <Button variant="ghost" size="icon" className="size-11" onClick={onClose} aria-label="Đóng bảng cấu hình node">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
            Sự kiện kích hoạt được cấu hình ở cấp rule. Node này chỉ đóng vai trò điểm bắt đầu của luồng.
          </div>
        )}

        {selectedNode.type === "condition" && (
          <div className="space-y-4 border rounded-md p-3 bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">Bộ lọc điều kiện</h4>
              <div className="inline-flex rounded-md border bg-background p-0.5" aria-label="Cách kết hợp điều kiện">
                {(["AND", "OR"] as const).map((combinator) => (
                  <Button
                    key={combinator}
                    type="button"
                    size="sm"
                    variant={localData.conditionCombinator === combinator || (!localData.conditionCombinator && combinator === "AND") ? "secondary" : "ghost"}
                    className="min-h-11 min-w-11 px-2.5"
                    aria-pressed={localData.conditionCombinator === combinator || (!localData.conditionCombinator && combinator === "AND")}
                    onClick={() => handleChange("conditionCombinator", combinator)}
                  >
                    {combinator}
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {localData.conditionCombinator === "OR" ? "Chỉ cần một điều kiện đúng." : "Tất cả điều kiện phải đúng."}
            </p>
            {conditions.map((condition, index) => {
              const normalizedReference = normalizeAutomationFieldReference(condition.field);
              const selectedField = dataFields.find((field) => field.reference === normalizedReference);
              const operators = (options?.registry.operators ?? []).filter((operator) => (
                !selectedField || operator.dataTypes.includes(selectedField.dataType)
              ));
              const selectedOperator = operators.find((operator) => operator.code === condition.operator);

              return (
                <div key={condition.id ?? `${condition.field}:${condition.operator}:${condition.value ?? ""}`} className="space-y-3 rounded-md border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">Điều kiện {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 text-destructive"
                      disabled={conditions.length === 1}
                      aria-label={`Xóa điều kiện ${index + 1}`}
                      onClick={() => updateConditions(conditions.filter((_, conditionIndex) => conditionIndex !== index))}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Trường dữ liệu</Label>
                    <AutomationFieldPicker
                      fields={dataFields}
                      selectedReference={normalizedReference}
                      placeholder={isLoadingOptions ? "Đang tải trường dữ liệu..." : "Chọn trường dữ liệu..."}
                      onSelect={(field) => updateCondition(index, { field: field.reference, operator: "equals", value: "" })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Toán tử</Label>
                    <Select value={condition.operator || "equals"} onValueChange={(operator) => updateCondition(index, { operator, value: "" })}>
                      <SelectTrigger><SelectValue placeholder="Chọn toán tử..." /></SelectTrigger>
                      <SelectContent>
                        {operators.map((operator) => <SelectItem key={operator.code} value={operator.code}>{operator.label}</SelectItem>)}
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
                          onChange={(event) => updateCondition(index, { value: event.target.value })}
                        />
                      ) : selectedField?.options.length ? (
                        <Select value={condition.value || ""} onValueChange={(value) => updateCondition(index, { value })}>
                          <SelectTrigger><SelectValue placeholder="Chọn giá trị..." /></SelectTrigger>
                          <SelectContent>{selectedField.options.map((option) => <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : selectedField?.dataType === "BOOLEAN" ? (
                        <Select value={condition.value || ""} onValueChange={(value) => updateCondition(index, { value })}>
                          <SelectTrigger><SelectValue placeholder="Chọn giá trị..." /></SelectTrigger>
                          <SelectContent><SelectItem value="true">Có</SelectItem><SelectItem value="false">Không</SelectItem></SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={selectedField?.dataType === "NUMBER" ? "number" : selectedField?.dataType === "DATE" ? "date" : "text"}
                          placeholder="Nhập giá trị so sánh"
                          value={condition.value || ""}
                          onChange={(event) => updateCondition(index, { value: event.target.value })}
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
              onClick={() => updateConditions([...conditions, { id: crypto.randomUUID(), field: "", operator: "equals", value: "" }])}
            >
              <Plus aria-hidden="true" />
              Thêm điều kiện
            </Button>
            <p className="text-xs text-muted-foreground">
              {dataFields.length} trường dữ liệu đang khả dụng theo quyền truy cập.
            </p>
          </div>
        )}

        {selectedNode.type !== 'condition' && (
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
              <ReassignmentPolicyFields
                policy={localData.reassignmentPolicy ?? defaultReassignmentPolicy}
                onChange={(reassignmentPolicy) => handleChange("reassignmentPolicy", reassignmentPolicy)}
              />
            ) : null}
          </>
        )}

      </div>
    </div>
  );
}

function durationParts(minutes: number) {
  if (minutes >= 1_440 && minutes % 1_440 === 0) return { value: minutes / 1_440, unit: "days" as const };
  if (minutes >= 60 && minutes % 60 === 0) return { value: minutes / 60, unit: "hours" as const };
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
        onChange={(event) => onChange(Math.min(maxMinutes, Math.max(minMinutes, (Number(event.target.value) || 1) * multipliers[parts.unit])))}
      />
      <Select
        value={parts.unit}
        onValueChange={(unit) => onChange(Math.min(maxMinutes, Math.max(minMinutes, parts.value * multipliers[unit as keyof typeof multipliers])))}
      >
        <SelectTrigger aria-label="Đơn vị thời gian"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">Phút</SelectItem>
          <SelectItem value="hours">Giờ</SelectItem>
          <SelectItem value="days">Ngày</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ReassignmentPolicyFields({ policy, onChange }: { policy: ReassignmentPolicy; onChange: (policy: ReassignmentPolicy) => void }) {
  const patchPolicy = (patch: Partial<ReassignmentPolicy>) => onChange({ ...policy, ...patch });
  return (
    <section className="space-y-4 rounded-lg border bg-muted/20 p-3" aria-labelledby="reassignment-policy-heading">
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox
          id="reassignment-policy-enabled"
          checked={policy.enabled}
          disabled={!reassignmentMonitorAvailable}
          onCheckedChange={(checked) => patchPolicy({ enabled: checked === true })}
        />
        <span id="reassignment-policy-heading" className="text-sm font-semibold">Chuyển sale không tương tác với khách hàng (đang hoàn thiện)</span>
      </label>

      {!reassignmentMonitorAvailable ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Đây là bản xem trước cấu hình. Có thể bật sau khi bộ giám sát và job chuyển sale ở Giai đoạn C hoàn tất.
        </p>
      ) : null}

      {policy.enabled || !reassignmentMonitorAvailable ? (
        <fieldset disabled={!reassignmentMonitorAvailable} className="space-y-5 border-l-2 border-primary/20 pl-3">
          <div className="space-y-2" role="radiogroup" aria-labelledby="interaction-criterion-label">
            <p id="interaction-criterion-label" className="text-sm font-medium">Chọn điều kiện tương tác</p>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
              <input type="radio" name="interaction-criterion" disabled /> Ghi chú trong bản ghi <span className="text-xs">(sắp hỗ trợ)</span>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
              <input type="radio" name="interaction-criterion" disabled /> Tương tác với trường dữ liệu <span className="text-xs">(sắp hỗ trợ)</span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="radio" checked readOnly name="interaction-criterion" /> Không mở bản ghi kể từ thời điểm gán
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reassignment-timeout">Loại bỏ sale nếu không tương tác sau</Label>
            <DurationInput
              id="reassignment-timeout"
              minutes={policy.timeoutMinutes}
              minMinutes={policy.warningEnabled ? 2 : 1}
              maxMinutes={43_200}
              onChange={(timeoutMinutes) => patchPolicy({
                timeoutMinutes,
                warningBeforeMinutes: Math.min(policy.warningBeforeMinutes, Math.max(1, timeoutMinutes - 1)),
              })}
            />
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={policy.assignToAnotherSale} onCheckedChange={(checked) => patchPolicy({ assignToAnotherSale: checked === true })} />
            <span className="text-sm">Gán cho nhân viên khác sau khi loại bỏ sale</span>
          </label>
          {policy.assignToAnotherSale ? (
            <div className="space-y-2 pl-7">
              <Label htmlFor="max-reassignments">Số lần gán lại tối đa</Label>
              <Input id="max-reassignments" type="number" min={1} max={100} value={policy.maxReassignments} onChange={(event) => patchPolicy({ maxReassignments: Math.min(100, Math.max(1, Number(event.target.value) || 1)) })} />
            </div>
          ) : null}

          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={policy.recyclePool} onCheckedChange={(checked) => patchPolicy({ recyclePool: checked === true })} />
            <span className="text-sm">Cho phép chia lại khi hết danh sách</span>
          </label>
          {policy.recyclePool ? (
            <div className="space-y-2 pl-7">
              <Label htmlFor="max-pool-cycles">Số vòng chia lại tối đa</Label>
              <Input id="max-pool-cycles" type="number" min={1} max={100} value={policy.maxPoolCycles} onChange={(event) => patchPolicy({ maxPoolCycles: Math.min(100, Math.max(1, Number(event.target.value) || 1)) })} />
            </div>
          ) : null}

          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={policy.warningEnabled} onCheckedChange={(checked) => patchPolicy({
              warningEnabled: checked === true,
              timeoutMinutes: checked === true ? Math.max(2, policy.timeoutMinutes) : policy.timeoutMinutes,
            })} />
            <span className="text-sm">Gửi cảnh báo cho nhân viên không tương tác</span>
          </label>
          {policy.warningEnabled ? (
            <div className="space-y-4 pl-7">
              <div className="space-y-2">
                <Label htmlFor="warning-before">Cảnh báo trước khi chuyển sale</Label>
                <DurationInput id="warning-before" minutes={policy.warningBeforeMinutes} maxMinutes={Math.max(1, policy.timeoutMinutes - 1)} onChange={(warningBeforeMinutes) => patchPolicy({ warningBeforeMinutes })} />
              </div>
              <p className="text-xs text-muted-foreground">Kênh V1: thông báo trong CRM.</p>
              <div className="space-y-2">
                <Label htmlFor="warning-content">Nội dung thông báo</Label>
                <Textarea id="warning-content" rows={4} value={policy.warningContent} onChange={(event) => patchPolicy({ warningContent: event.target.value })} />
                <p className="text-xs text-muted-foreground">Thông báo được gửi cho sale đang phụ trách bản ghi.</p>
              </div>
            </div>
          ) : null}

          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={policy.notifyOnRemoval} onCheckedChange={(checked) => patchPolicy({ notifyOnRemoval: checked === true })} />
            <span className="text-sm">Gửi thông báo khi nhân viên bị loại khỏi bản ghi</span>
          </label>
        </fieldset>
      ) : (
        <p className="text-xs text-muted-foreground">Bật tùy chọn để theo dõi thời gian sale chưa mở Lead sau khi được gán.</p>
      )}
    </section>
  );
}

function RegistryNodeFields({
  nodeType,
  data,
  options,
  dataFields,
  isLoading,
  onChange,
  onInsertToken,
}: {
  nodeType: AutomationNodeType;
  data: AutomationNodeData;
  options?: AutomationOptions;
  dataFields: AutomationDataField[];
  isLoading: boolean;
  onChange: (key: keyof AutomationNodeData, value: unknown) => void;
  onInsertToken: (key: TemplateFieldKey, field: AutomationDataField) => void;
}) {
  const definition = options?.registry.nodes.find((node) => node.type === nodeType);
  if (!definition) {
    return <p className="text-sm text-muted-foreground">{isLoading ? "Đang tải cấu hình..." : "Không tìm thấy cấu hình cho block này."}</p>;
  }

  const getSelectOptions = (field: AutomationConfigField) => {
    if (field.options) return field.options;
    if (field.optionsSource === "assignees") return (options?.assignees ?? []).map((item) => ({ code: item.id, label: item.fullName }));
    if (field.optionsSource === "departments") return (options?.departments ?? []).map((item) => ({ code: item.id, label: item.name }));
    if (field.optionsSource === "pipelineStages") return (options?.pipelineStages ?? []).map((item) => ({ code: item.id, label: item.pipelineName ? `${item.pipelineName} — ${item.name}` : item.name }));
    if (field.optionsSource === "targetRoles") return (options?.targetRoles ?? []).map((item) => ({ code: item.code, label: item.name }));
    if (field.optionsSource === "customerLists") return (options?.customerLists ?? []).map((item) => ({ code: item.id, label: item.name }));
    if (field.optionsSource === "webhookEndpoints") return (options?.webhookEndpoints ?? []).map((item) => ({ code: item.id, label: item.name }));
    if (field.optionsSource === "majors") return (options?.majors ?? []).map((item) => ({ code: item.id, label: item.name }));
    if (field.optionsSource === "admissionStatuses") return (options?.admissionStatuses ?? []).map((item) => ({ code: item.id, label: item.name }));
    if (field.optionsSource === "admissionClasses") return (options?.admissionClasses ?? []).map((item) => ({ code: item.id, label: item.code ? `${item.code} — ${item.name}` : item.name }));
    return [];
  };

  return (
    <div className="space-y-4">
      {definition.configFields.filter((field) =>
        field.control !== "condition_group"
        && (!field.visibleForTriggerTypes || field.visibleForTriggerTypes.includes(data.triggerType ?? ""))).map((field) => {
        const value = data[field.key];
        const canInsertToken = ["title", "content", "activityContent", "reminderTitle", "reminderContent", "messageSubject", "messageContent", "webhookPayload"].includes(field.key);

        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={`node-field-${field.key}`}>
              {field.label}{field.required ? <span className="text-destructive"> *</span> : null}
            </Label>
            {field.control === "multi_select" ? (
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2" aria-label={field.label}>
                {getSelectOptions(field).map((option) => {
                  const selectedValues = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
                  const checked = selectedValues.includes(option.code);
                  return (
                    <label key={option.code} className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-muted">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) => onChange(field.key, nextChecked
                          ? [...selectedValues, option.code]
                          : selectedValues.filter((item) => item !== option.code))}
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  );
                })}
              </div>
            ) : field.control === "select" ? (
              <Select value={typeof value === "string" ? value : ""} onValueChange={(nextValue) => onChange(field.key, nextValue)}>
                <SelectTrigger id={`node-field-${field.key}`}><SelectValue placeholder={isLoading ? "Đang tải..." : `Chọn ${field.label.toLocaleLowerCase()}...`} /></SelectTrigger>
                <SelectContent>{getSelectOptions(field).map((option) => <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            ) : field.control === "template_textarea" ? (
              <Textarea id={`node-field-${field.key}`} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.key, event.target.value)} />
            ) : (
              <Input
                id={`node-field-${field.key}`}
                type={field.control === "number" ? "number" : "text"}
                min={field.min}
                value={typeof value === "string" || typeof value === "number" ? value : ""}
                onChange={(event) => onChange(field.key, field.control === "number" ? Number(event.target.value) : event.target.value)}
              />
            )}
            {canInsertToken && (
              <>
                <AutomationFieldPicker
                  fields={dataFields}
                  placeholder={`Chèn trường vào ${field.label.toLocaleLowerCase()}`}
                  onSelect={(selectedField) => onInsertToken(field.key as TemplateFieldKey, selectedField)}
                />
                <TemplatePreview value={typeof value === "string" ? value : ""} fields={dataFields} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TemplatePreview({ value, fields }: { value: string; fields: AutomationDataField[] }) {
  if (!value.trim()) return null;
  const labels = new Map(fields.map((field) => [field.reference, field.label]));
  const preview = value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_token, reference: string) => `[${labels.get(reference.trim()) ?? "Trường không hợp lệ"}]`);
  return (
    <div className="rounded-md border bg-muted/30 p-3" aria-label="Xem trước mẫu an toàn">
      <p className="mb-1 text-xs font-medium">Xem trước an toàn</p>
      <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{preview}</p>
      <p className="mt-2 text-[11px] text-muted-foreground">Bản xem trước chỉ hiển thị tên biến, không tải dữ liệu thật của Lead.</p>
    </div>
  );
}
