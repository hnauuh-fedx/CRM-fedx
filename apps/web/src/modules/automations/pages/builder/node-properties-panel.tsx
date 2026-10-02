import { useMemo } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const insertFieldToken = (key: "title" | "content" | "activityContent", field: AutomationDataField) => {
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
    <div className="w-80 border-l bg-background flex flex-col h-full shadow-sm z-10 shrink-0">
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

        {!['trigger', 'condition'].includes(selectedNode.type) && (
          <RegistryNodeFields
            nodeType={selectedNode.type}
            data={localData}
            options={options}
            dataFields={dataFields}
            isLoading={isLoadingOptions}
            onChange={handleChange}
            onInsertToken={insertFieldToken}
          />
        )}

      </div>
    </div>
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
  onInsertToken: (key: "title" | "content" | "activityContent", field: AutomationDataField) => void;
}) {
  const definition = options?.registry.nodes.find((node) => node.type === nodeType);
  if (!definition) {
    return <p className="text-sm text-muted-foreground">{isLoading ? "Đang tải cấu hình..." : "Không tìm thấy cấu hình cho block này."}</p>;
  }

  const getSelectOptions = (field: AutomationConfigField) => {
    if (field.options) return field.options;
    if (field.optionsSource === "assignees") return (options?.assignees ?? []).map((item) => ({ code: item.id, label: item.fullName }));
    if (field.optionsSource === "pipelineStages") return (options?.pipelineStages ?? []).map((item) => ({ code: item.id, label: item.pipelineName ? `${item.pipelineName} — ${item.name}` : item.name }));
    if (field.optionsSource === "targetRoles") return (options?.targetRoles ?? []).map((item) => ({ code: item.code, label: item.name }));
    return [];
  };

  return (
    <div className="space-y-4">
      {definition.configFields.filter((field) => field.control !== "condition_group").map((field) => {
        const value = data[field.key];
        const canInsertToken = field.key === "title" || field.key === "content" || field.key === "activityContent";

        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={`node-field-${field.key}`}>
              {field.label}{field.required ? <span className="text-destructive"> *</span> : null}
            </Label>
            {field.control === "select" ? (
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
              <AutomationFieldPicker
                fields={dataFields}
                placeholder={`Chèn trường vào ${field.label.toLocaleLowerCase()}`}
                onSelect={(selectedField) => onInsertToken(field.key, selectedField)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
