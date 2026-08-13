import type { SystemFormField, SystemFormFieldGroup } from "./form-field-catalog.types";

const field = (
  key: string,
  label: string,
  dataType: SystemFormField["dataType"],
  storage: string,
  config: Omit<SystemFormField, "key" | "label" | "dataType" | "storage"> = {},
): SystemFormField => ({ key, label, dataType, storage, ...config });

export const marketingCampaignFormFieldCatalog: SystemFormFieldGroup[] = [
  {
    id: "basic",
    label: "Thông tin chiến dịch",
    description: "C\u00e1c tr\u01b0\u1eddng hi\u1ec7n c\u00f3 tr\u00ean form th\u00eam v\u00e0 ch\u1ec9nh s\u1eeda chi\u1ebfn d\u1ecbch Marketing.",
    fields: [
      field("name", "T\u00ean chi\u1ebfn d\u1ecbch", "TEXT", "campaigns.name", { isRequired: true }),
      field("type", "Lo\u1ea1i chi\u1ebfn d\u1ecbch", "TEXT", "campaigns.type"),
      field("status", "Tr\u1ea1ng th\u00e1i", "SELECT", "campaigns.status", { isRequired: true, optionSource: "Danh s\u00e1ch tr\u1ea1ng th\u00e1i chi\u1ebfn d\u1ecbch" }),
      field("startDate", "Ng\u00e0y b\u1eaft \u0111\u1ea7u", "DATE", "campaigns.start_date"),
      field("endDate", "Ng\u00e0y k\u1ebft th\u00fac", "DATE", "campaigns.end_date"),
      field("budget", "Ng\u00e2n s\u00e1ch (VND)", "NUMBER", "campaigns.budget", { isRequired: true }),
      field("institutionProgramId", "Ch\u01b0\u01a1ng tr\u00ecnh", "SELECT", "campaigns.institution_program_id", { optionSource: "Ch\u01b0\u01a1ng tr\u00ecnh tuy\u1ec3n sinh" }),
    ],
  },
  { id: "additional", label: "Th\u00f4ng tin b\u1ed5 sung", description: "C\u00e1c tr\u01b0\u1eddng t\u1ef1 c\u1ea5u h\u00ecnh cho form chi\u1ebfn d\u1ecbch Marketing.", fields: [] },
];

export const marketingSurveyFormFieldCatalog: SystemFormFieldGroup[] = [
  {
    id: "basic",
    label: "Th\u00f4ng tin bi\u1ec3u m\u1eabu",
    description: "C\u00e1c tr\u01b0\u1eddng hi\u1ec7n c\u00f3 tr\u00ean form th\u00eam v\u00e0 ch\u1ec9nh s\u1eeda Form & Survey.",
    fields: [
      field("name", "T\u00ean bi\u1ec3u m\u1eabu", "TEXT", "marketing_forms.name", { isRequired: true }),
      field("formType", "Lo\u1ea1i bi\u1ec3u m\u1eabu", "SELECT", "marketing_forms.form_type", { isRequired: true, optionSource: "Danh s\u00e1ch lo\u1ea1i bi\u1ec3u m\u1eabu" }),
      field("status", "Tr\u1ea1ng th\u00e1i", "SELECT", "marketing_forms.status", { isRequired: true, optionSource: "Danh s\u00e1ch tr\u1ea1ng th\u00e1i bi\u1ec3u m\u1eabu" }),
      field("title", "Ti\u00eau \u0111\u1ec1 public form", "TEXT", "marketing_forms.title", { isRequired: true }),
      field("subtitle", "Ph\u1ee5 \u0111\u1ec1", "TEXT", "marketing_forms.subtitle"),
      field("description", "M\u00f4 t\u1ea3", "TEXTAREA", "marketing_forms.description"),
      field("submitButtonLabel", "Nh\u00e3n n\u00fat g\u1eedi", "TEXT", "marketing_forms.submit_button_label", { isRequired: true }),
    ],
  },
  {
    id: "advanced",
    label: "C\u00e0i \u0111\u1eb7t n\u00e2ng cao",
    description: "C\u00e1c tr\u01b0\u1eddng hi\u1ec7n c\u00f3 trong ph\u1ea7n C\u00e0i \u0111\u1eb7t n\u00e2ng cao.",
    fields: [
      field("slug", "Slug public", "TEXT", "marketing_forms.slug"),
      field("platform", "N\u1ec1n t\u1ea3ng", "TEXT", "marketing_forms.platform"),
      field("formCode", "M\u00e3 bi\u1ec3u m\u1eabu", "TEXT", "marketing_forms.form_code"),
      field("campaignId", "Chi\u1ebfn d\u1ecbch li\u00ean k\u1ebft", "SELECT", "marketing_forms.campaign_id", { optionSource: "Chi\u1ebfn d\u1ecbch Marketing" }),
      field("templateId", "Template giao di\u1ec7n", "SELECT", "marketing_forms.template_id", { optionSource: "Template Form & Survey" }),
      field("webhookEnabled", "B\u1eadt webhook URL", "BOOLEAN", "marketing_forms.webhook_enabled"),
      field("primaryColor", "M\u00e0u ch\u00ednh", "TEXT", "marketing_forms.primary_color"),
      field("backgroundColor", "M\u00e0u n\u1ec1n", "TEXT", "marketing_forms.background_color"),
    ],
  },
  { id: "additional", label: "Th\u00f4ng tin b\u1ed5 sung", description: "C\u00e1c tr\u01b0\u1eddng t\u1ef1 c\u1ea5u h\u00ecnh cho Form & Survey.", fields: [] },
];
