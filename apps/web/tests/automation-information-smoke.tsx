import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { AutomationInformationUpdate, AutomationWritableField } from "@admission-crm/shared/automation-information-update";
import { InformationUpdateFields } from "../src/modules/automations/pages/builder/information-update-fields";
import { Button } from "../src/components/ui/button";
import "../src/index.css";

const basic = { description: null, groupKey: "lead", groupLabel: "Thông tin Lead", source: "system" as const, isSensitive: false, options: [] };
const fields: AutomationWritableField[] = [
  { ...basic, reference: "system:pipelineStageId", key: "pipelineStageId", label: "Quy trình Telesale", dataType: "SELECT", canClear: false, readOnlyReason: "Dùng node Cập nhật Pipeline để giữ lịch sử giai đoạn." },
  { ...basic, reference: "system:tags", key: "tags", label: "Nhãn phân loại", dataType: "STRING_LIST", canClear: true },
  { ...basic, reference: "custom:file", key: "file", label: "Tệp đính kèm", dataType: "FILE", canClear: true },
  { ...basic, reference: "custom:datetime", key: "datetime", label: "Ngày giờ", dataType: "DATETIME", canClear: true },
  { ...basic, reference: "custom:province", key: "province", label: "Tỉnh tùy chỉnh", dataType: "PROVINCE", canClear: true, options: [{ code: "da_nang", label: "Đà Nẵng" }] },
  { ...basic, reference: "system:fullName", key: "fullName", label: "Họ và tên", dataType: "TEXT", canClear: false },
  { ...basic, reference: "system:note", key: "note", label: "Ghi chú", dataType: "TEXTAREA", canClear: true },
  { ...basic, reference: "system:dateOfBirth", key: "dateOfBirth", label: "Ngày sinh", dataType: "DATE", canClear: true },
  { ...basic, source: "custom", groupKey: "custom", groupLabel: "Trường tùy chỉnh", reference: "custom:score", key: "score", label: "Điểm", dataType: "NUMBER", canClear: true },
  { ...basic, source: "custom", groupKey: "custom", groupLabel: "Trường tùy chỉnh", reference: "custom:consent", key: "consent", label: "Đồng ý", dataType: "BOOLEAN", canClear: true },
  { ...basic, source: "custom", groupKey: "custom", groupLabel: "Trường tùy chỉnh", reference: "custom:interests", key: "interests", label: "Quan tâm", dataType: "MULTI_SELECT", canClear: true, options: [{ code: "a", label: "Lựa chọn A" }, { code: "b", label: "Lựa chọn B" }] },
];
function Harness() {
  const [updates, setUpdates] = useState<AutomationInformationUpdate[]>(() => JSON.parse(localStorage.getItem("information-smoke") ?? '[{"id":"first","field":"","operation":"set"}]'));
  return <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4">
    <h1>Cập nhật thông tin</h1>
    <InformationUpdateFields updates={updates} fields={fields} isLoading={false} onChange={setUpdates} />
    <Button type="button" onClick={() => localStorage.setItem("information-smoke", JSON.stringify(updates))}>Lưu cấu hình kiểm thử</Button>
    <output data-updates className="sr-only">{JSON.stringify(updates)}</output>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
