import { useAuth } from "@/modules/auth/auth-context";
import { customFieldPermission } from "../custom-field-permissions";
import { Navigate, useSearchParams } from "react-router-dom";

import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CustomFieldEntityType } from "../custom-field.types";
import { CustomFieldsManagementPage, type CustomFieldsManagementConfig } from "./custom-fields-management-page";
import { admissionDocumentFormFieldCatalog, admissionProfileFormFieldCatalog, admissionStatusFormFieldCatalog } from "../admission-form-field-catalog";

type AdmissionFormConfig = { key: "profile" | "document" | "status"; label: string; entityType: CustomFieldEntityType; description: string; systemFieldGroups: CustomFieldsManagementConfig["systemFieldGroups"] };

const admissionFormConfigs: AdmissionFormConfig[] = [
  { key: "profile", label: "Form hồ sơ tuyển sinh", entityType: "ADMISSION_PROFILE", description: "Xem cấu trúc form hồ sơ tuyển sinh và quản lý các trường thông tin bổ sung.", systemFieldGroups: admissionProfileFormFieldCatalog },
  { key: "document", label: "Form tài liệu hồ sơ", entityType: "ADMISSION_DOCUMENT", description: "Xem cấu trúc form tài liệu hồ sơ và quản lý các trường thông tin bổ sung.", systemFieldGroups: admissionDocumentFormFieldCatalog },
  { key: "status", label: "Form trạng thái hồ sơ", entityType: "ADMISSION_STATUS", description: "Xem cấu trúc form trạng thái hồ sơ và quản lý các trường thông tin bổ sung.", systemFieldGroups: admissionStatusFormFieldCatalog },];

export function AdmissionCustomFieldsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const visibleForms = admissionFormConfigs.filter((form) => auth.can(customFieldPermission(form.entityType, "view")));
  const requestedForm = searchParams.get("form") as AdmissionFormConfig["key"] | null;
  const selectedForm = visibleForms.find((item) => item.key === requestedForm) ?? visibleForms[0];
  if (!selectedForm) return <Navigate to="/khong-co-quyen" replace />;
  const formSelector = (
    <Field className="min-w-48 gap-1"><FieldLabel className="sr-only">Chọn form CRM Tuyển sinh</FieldLabel><Select value={selectedForm.key} onValueChange={(value) => setSearchParams({ form: value })}><SelectTrigger className="h-9 w-60"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{visibleForms.map((form) => <SelectItem key={form.key} value={form.key}>{form.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  );
  return <CustomFieldsManagementPage key={selectedForm.key} config={{ entityType: selectedForm.entityType, eyebrow: "CRM Tuyển sinh", title: "Cấu hình trường dữ liệu", description: selectedForm.description, subjectLabel: selectedForm.label, systemFieldGroups: selectedForm.systemFieldGroups, customFieldGroupId: "additional", inlineCustomFieldGroupKey: "basic", formSelector }} />;
}
