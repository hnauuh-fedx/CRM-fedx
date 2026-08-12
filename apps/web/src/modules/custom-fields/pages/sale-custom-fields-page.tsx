import { CustomFieldsManagementPage } from "./custom-fields-management-page";
import { leadFormFieldCatalog } from "../lead-form-field-catalog";

export function SaleCustomFieldsPage() {
  return (
    <CustomFieldsManagementPage
      config={{
        entityType: "LEAD",
        eyebrow: "CRM Sale",
        title: "Cấu hình trường dữ liệu",
        description: "Xem toàn bộ cấu trúc form lead và quản lý các trường thông tin bổ sung.",
        subjectLabel: "Form lead",
        systemFieldGroups: leadFormFieldCatalog,
        customFieldGroupId: "additional",
      }}
    />
  );
}
