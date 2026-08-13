import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CustomFieldEntityType } from "../custom-field.types";
import { leadFormFieldCatalog } from "../lead-form-field-catalog";
import { saleActivityFormFieldCatalog, saleReminderFormFieldCatalog } from "../sale-form-field-catalog";
import { CustomFieldsManagementPage, type CustomFieldsManagementConfig } from "./custom-fields-management-page";

type SaleFormConfig = {
  key: "lead" | "activity" | "reminder";
  label: string;
  entityType: CustomFieldEntityType;
  description: string;
  systemFieldGroups: CustomFieldsManagementConfig["systemFieldGroups"];
};

const saleFormConfigs: SaleFormConfig[] = [
  {
    key: "lead",
    label: "Form lead",
    entityType: "LEAD",
    description: "Xem toàn bộ cấu trúc form lead và quản lý các trường thông tin bổ sung.",
    systemFieldGroups: leadFormFieldCatalog,
  },
  {
    key: "activity",
    label: "Form hoạt động",
    entityType: "SALE_ACTIVITY",
    description: "Xem cấu trúc form hoạt động sale và quản lý các trường thông tin bổ sung.",
    systemFieldGroups: saleActivityFormFieldCatalog,
  },
  {
    key: "reminder",
    label: "Form nhắc việc",
    entityType: "SALE_REMINDER",
    description: "Xem cấu trúc form nhắc việc sale và quản lý các trường thông tin bổ sung.",
    systemFieldGroups: saleReminderFormFieldCatalog,
  },
];

export function SaleCustomFieldsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedForm = searchParams.get("form") as SaleFormConfig["key"] | null;
  const selectedFormKey = saleFormConfigs.some((item) => item.key === requestedForm) ? requestedForm! : "lead";
  const selectedForm = saleFormConfigs.find((item) => item.key === selectedFormKey) ?? saleFormConfigs[0];
  const formSelector = useMemo(() => (
    <Field className="min-w-48 gap-1">
      <FieldLabel className="sr-only">Chọn form CRM Sale</FieldLabel>
      <Select value={selectedForm.key} onValueChange={(value) => setSearchParams({ form: value })}>
        <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {saleFormConfigs.map((form) => <SelectItem key={form.key} value={form.key}>{form.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  ), [selectedForm.key, setSearchParams]);

  return (
    <CustomFieldsManagementPage
      key={selectedForm.key}
      config={{
        entityType: selectedForm.entityType,
        eyebrow: "CRM Sale",
        title: "Cấu hình trường dữ liệu",
        description: selectedForm.description,
        subjectLabel: selectedForm.label,
        systemFieldGroups: selectedForm.systemFieldGroups,
        customFieldGroupId: "additional",
        inlineCustomFieldGroupKey: "basic",
        formSelector,
      }}
    />
  );
}
