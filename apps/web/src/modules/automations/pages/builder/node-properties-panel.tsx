import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/modules/auth/auth-context";
import { buildAutomationDataFields, normalizeAutomationFieldReference } from "../../automation-data-fields";
import type { AutomationDataField, AutomationNode, AutomationNodeData, AutomationOptions } from "../../automation.types";
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
  const [localData, setLocalData] = useState<AutomationNodeData | null>(null);
  const dataFields = useMemo(() => buildAutomationDataFields(
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
  }), [canViewSensitiveLeadData, options?.assignees, options?.customDataFields, options?.pipelineStages, options?.systemFieldOptions]);

  // Sync local state when selected node changes
  useEffect(() => {
    if (selectedNode) {
      setLocalData(selectedNode.data);
    } else {
      setLocalData(null);
    }
  }, [selectedNode]);

  if (!selectedNode || !localData) {
    return null;
  }

  const handleChange = (key: keyof AutomationNodeData, value: unknown) => {
    setLocalData((prev) => (prev ? { ...prev, [key]: value } : null));
    onNodeUpdate(selectedNode.id, { [key]: value });
  };

  const insertFieldToken = (key: "title" | "content" | "activityContent", field: AutomationDataField) => {
    const current = String(localData[key] ?? "");
    const separator = current.length > 0 && !/\s$/.test(current) ? " " : "";
    handleChange(key, `${current}${separator}{{${field.reference}}}`);
  };

  const normalizedConditionReference = normalizeAutomationFieldReference(localData.field);
  const selectedConditionField = dataFields.find((field) => field.reference === normalizedConditionReference);

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
            <h4 className="text-sm font-medium">Bộ lọc điều kiện</h4>
            <div className="space-y-2">
              <Label className="text-xs">Trường dữ liệu (Field)</Label>
              <AutomationFieldPicker
                fields={dataFields}
                selectedReference={normalizedConditionReference}
                placeholder={isLoadingOptions ? "Đang tải trường dữ liệu..." : "Chọn trường dữ liệu..."}
                onSelect={(field) => {
                  handleChange("field", field.reference);
                  handleChange("value", "");
                }}
              />
              <p className="text-xs text-muted-foreground">
                {dataFields.length} trường hệ thống và trường tùy chỉnh đang khả dụng theo cấu hình dữ liệu.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Toán tử (Operator)</Label>
              <Select 
                value={localData.operator || "equals"} 
                onValueChange={(val) => handleChange("operator", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Bằng (Equals)</SelectItem>
                  <SelectItem value="not_equals">Khác (Not equals)</SelectItem>
                  <SelectItem value="contains">Chứa (Contains)</SelectItem>
                  <SelectItem value="exists">Có dữ liệu (Exists)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {localData.operator !== "exists" && <div className="space-y-2">
              <Label className="text-xs">Giá trị so sánh (Value)</Label>
              {selectedConditionField?.options.length ? (
                <Select value={localData.value || ""} onValueChange={(value) => handleChange("value", value)}>
                  <SelectTrigger><SelectValue placeholder="Chọn giá trị..." /></SelectTrigger>
                  <SelectContent>{selectedConditionField.options.map((option) => <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : selectedConditionField?.dataType === "BOOLEAN" ? (
                <Select value={localData.value || ""} onValueChange={(value) => handleChange("value", value)}>
                  <SelectTrigger><SelectValue placeholder="Chọn giá trị..." /></SelectTrigger>
                  <SelectContent><SelectItem value="true">Có</SelectItem><SelectItem value="false">Không</SelectItem></SelectContent>
                </Select>
              ) : (
                <Input
                  type={selectedConditionField?.dataType === "NUMBER" ? "number" : selectedConditionField?.dataType === "DATE" ? "date" : "text"}
                  placeholder="Nhập giá trị so sánh"
                  value={localData.value || ""}
                  onChange={(event) => handleChange("value", event.target.value)}
                />
              )}
            </div>}
          </div>
        )}

        {selectedNode.type === "action_assign" && (
          <div className="space-y-2">
            <Label>Nhân viên phụ trách</Label>
            <Select 
              value={localData.assignToUserId || ""} 
              onValueChange={(val) => handleChange("assignToUserId", val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhân viên..." />
              </SelectTrigger>
              <SelectContent>
                {options?.assignees.map((assignee) => (
                  <SelectItem key={assignee.id} value={assignee.id}>{assignee.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoadingOptions
                ? "Đang tải danh sách nhân viên..."
                : options?.assignees.length
                  ? "Chỉ hiển thị nhân viên trong phạm vi quyền phân công."
                  : "Không có nhân viên phù hợp hoặc bạn chưa có quyền phân công lead."}
            </p>
          </div>
        )}

        {selectedNode.type === "action_notification" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Vai trò nhận thông báo</Label>
              <Select value={localData.targetRole || ""} onValueChange={(val) => handleChange("targetRole", val)}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingOptions ? "Đang tải..." : "Chọn vai trò..."} />
                </SelectTrigger>
                <SelectContent>
                  {options?.targetRoles.map((role) => (
                    <SelectItem key={role.id} value={role.code}>{role.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tiêu đề thông báo</Label>
              <Input 
                placeholder="VD: Bạn có lead mới..." 
                value={localData.title || ""} 
                onChange={(e) => handleChange("title", e.target.value)}
              />
              <AutomationFieldPicker fields={dataFields} placeholder="Chèn trường vào tiêu đề" onSelect={(field) => insertFieldToken("title", field)} />
            </div>
            <div className="space-y-2">
              <Label>Nội dung thông báo</Label>
              <Textarea 
                placeholder="VD: Lead {{lead.full_name}} vừa được tạo..." 
                value={localData.content || ""} 
                onChange={(e) => handleChange("content", e.target.value)}
              />
              <AutomationFieldPicker fields={dataFields} placeholder="Chèn trường vào nội dung" onSelect={(field) => insertFieldToken("content", field)} />
              <p className="text-xs text-muted-foreground">Giá trị trường sẽ được thay thế tự động khi rule chạy.</p>
            </div>
          </div>
        )}

        {selectedNode.type === "action_activity" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Loại hoạt động (Type)</Label>
              <Select 
                value={localData.activityType || ""} 
                onValueChange={(val) => handleChange("activityType", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại hoạt động..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Gọi điện thoại (Call)</SelectItem>
                  <SelectItem value="email">Gửi Email</SelectItem>
                  <SelectItem value="meeting">Hẹn gặp (Meeting)</SelectItem>
                  <SelectItem value="note">Ghi chú (Note)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nội dung ghi nhận</Label>
              <Textarea 
                placeholder="VD: Tự động gửi email chào mừng..." 
                value={localData.activityContent || ""} 
                onChange={(e) => handleChange("activityContent", e.target.value)}
              />
              <AutomationFieldPicker fields={dataFields} placeholder="Chèn trường vào nội dung" onSelect={(field) => insertFieldToken("activityContent", field)} />
            </div>
          </div>
        )}

        {selectedNode.type === "action_update_stage" && (
          <div className="space-y-2">
            <Label>Chuyển sang giai đoạn</Label>
            <Select 
              value={localData.stageId || ""} 
              onValueChange={(val) => handleChange("stageId", val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn giai đoạn..." />
              </SelectTrigger>
              <SelectContent>
                {options?.pipelineStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.pipelineName ? `${stage.pipelineName} — ${stage.name}` : stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoadingOptions && !options?.pipelineStages.length && (
              <p className="text-xs text-muted-foreground">Chưa có giai đoạn pipeline để lựa chọn.</p>
            )}
          </div>
        )}

        {selectedNode.type === "delay" && (
          <div className="space-y-2">
            <Label>Thời gian chờ (phút)</Label>
            <Input 
              type="number"
              min="1"
              placeholder="VD: 60" 
              value={localData.delayMinutes || ""} 
              onChange={(e) => handleChange("delayMinutes", parseInt(e.target.value, 10))}
            />
          </div>
        )}

      </div>
    </div>
  );
}
