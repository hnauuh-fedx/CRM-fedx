import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AutomationNode, AutomationNodeData } from "../../automation.types";

export type NodePropertiesPanelProps = {
  selectedNodeId: string | null;
  nodes: AutomationNode[];
  onNodeUpdate: (nodeId: string, data: Partial<AutomationNodeData>) => void;
  onClose: () => void;
};

export function NodePropertiesPanel({ selectedNodeId, nodes, onNodeUpdate, onClose }: NodePropertiesPanelProps) {
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const [localData, setLocalData] = useState<AutomationNodeData | null>(null);

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

  const handleChange = (key: keyof AutomationNodeData, value: any) => {
    setLocalData((prev) => (prev ? { ...prev, [key]: value } : null));
    onNodeUpdate(selectedNode.id, { [key]: value });
  };

  return (
    <div className="w-80 border-l bg-background flex flex-col h-full shadow-sm z-10 shrink-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold text-sm">Cấu hình thao tác</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
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
          <div className="space-y-2">
            <Label>Loại đối tượng</Label>
            <Select 
              value={localData.triggerType || "lead_created"} 
              onValueChange={(val) => handleChange("triggerType", val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn đối tượng..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead_created">Khách hàng (Lead) mới</SelectItem>
                <SelectItem value="lead_updated">Cập nhật Lead</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedNode.type === "condition" && (
          <div className="space-y-4 border rounded-md p-3 bg-muted/30">
            <h4 className="text-sm font-medium">Bộ lọc điều kiện</h4>
            <div className="space-y-2">
              <Label className="text-xs">Trường dữ liệu (Field)</Label>
              <Select 
                value={localData.field || ""} 
                onValueChange={(val) => handleChange("field", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn trường..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="source_id">Nguồn (Source)</SelectItem>
                  <SelectItem value="pipeline_stage_id">Giai đoạn (Pipeline Stage)</SelectItem>
                  <SelectItem value="status">Trạng thái Lead (Status)</SelectItem>
                  <SelectItem value="assigned_to">Người phụ trách (Assignee)</SelectItem>
                  <SelectItem value="gender">Giới tính (Gender)</SelectItem>
                </SelectContent>
              </Select>
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
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Giá trị so sánh (Value)</Label>
              <Input 
                placeholder="VD: new, 123..." 
                value={localData.value || ""} 
                onChange={(e) => handleChange("value", e.target.value)}
              />
            </div>
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
                <SelectItem value="user-1">Nguyễn Văn A (Sale)</SelectItem>
                <SelectItem value="user-2">Trần Thị B (CSKH)</SelectItem>
                <SelectItem value="user-3">Lê Văn C (Manager)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              (Dữ liệu nhân sự mẫu)
            </p>
          </div>
        )}

        {selectedNode.type === "action_notification" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tiêu đề thông báo</Label>
              <Input 
                placeholder="VD: Bạn có lead mới..." 
                value={localData.title || ""} 
                onChange={(e) => handleChange("title", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nội dung thông báo</Label>
              <Textarea 
                placeholder="VD: Lead {{lead.full_name}} vừa được tạo..." 
                value={localData.content || ""} 
                onChange={(e) => handleChange("content", e.target.value)}
              />
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
                <SelectItem value="stage-new">Khách hàng mới</SelectItem>
                <SelectItem value="stage-contacted">Đã liên hệ</SelectItem>
                <SelectItem value="stage-interested">Quan tâm</SelectItem>
                <SelectItem value="stage-won">Chốt Sale</SelectItem>
              </SelectContent>
            </Select>
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
