import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CustomFieldEntityType } from "../custom-field.types";
import { marketingCampaignFormFieldCatalog, marketingSurveyFormFieldCatalog } from "../marketing-form-field-catalog";
import { CustomFieldsManagementPage, type CustomFieldsManagementConfig } from "./custom-fields-management-page";

type MarketingFormConfig = {
  key: "campaign" | "survey";
  label: string;
  entityType: CustomFieldEntityType;
  description: string;
  systemFieldGroups: CustomFieldsManagementConfig["systemFieldGroups"];
};

const marketingFormConfigs: MarketingFormConfig[] = [
  { key: "campaign", label: "Form chi\u1ebfn d\u1ecbch", entityType: "MARKETING_CAMPAIGN", description: "Xem c\u1ea5u tr\u00fac form chi\u1ebfn d\u1ecbch Marketing v\u00e0 qu\u1ea3n l\u00fd c\u00e1c tr\u01b0\u1eddng th\u00f4ng tin b\u1ed5 sung.", systemFieldGroups: marketingCampaignFormFieldCatalog },
  { key: "survey", label: "Form & Survey", entityType: "MARKETING_FORM", description: "Xem c\u1ea5u tr\u00fac Form & Survey v\u00e0 qu\u1ea3n l\u00fd c\u00e1c tr\u01b0\u1eddng th\u00f4ng tin b\u1ed5 sung.", systemFieldGroups: marketingSurveyFormFieldCatalog },
];

export function MarketingCustomFieldsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedForm = searchParams.get("form") as MarketingFormConfig["key"] | null;
  const selectedFormKey = marketingFormConfigs.some((item) => item.key === requestedForm) ? requestedForm! : "campaign";
  const selectedForm = marketingFormConfigs.find((item) => item.key === selectedFormKey) ?? marketingFormConfigs[0];
  const formSelector = useMemo(() => (
    <Field className="min-w-48 gap-1"><FieldLabel className="sr-only">Ch\u1ecdn form CRM Marketing</FieldLabel><Select value={selectedForm.key} onValueChange={(value) => setSearchParams({ form: value })}><SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{marketingFormConfigs.map((form) => <SelectItem key={form.key} value={form.key}>{form.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  ), [selectedForm.key, setSearchParams]);
  return <CustomFieldsManagementPage key={selectedForm.key} config={{ entityType: selectedForm.entityType, eyebrow: "CRM Marketing", title: "C\u1ea5u h\u00ecnh tr\u01b0\u1eddng d\u1eef li\u1ec7u", description: selectedForm.description, subjectLabel: selectedForm.label, systemFieldGroups: selectedForm.systemFieldGroups, customFieldGroupId: "additional", inlineCustomFieldGroupKey: "basic", formSelector }} />;
}
