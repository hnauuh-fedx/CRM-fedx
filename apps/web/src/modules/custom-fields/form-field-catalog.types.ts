import type { CustomFieldDataType } from "./custom-field.types";

export type SystemFormField = {
  key: string;
  label: string;
  dataType: CustomFieldDataType;
  storage: string;
  isRequired?: boolean;
  isSensitive?: boolean;
  optionSource?: string;
  note?: string;
};

export type SystemFormFieldGroup = {
  id: string;
  label: string;
  description: string;
  fields: SystemFormField[];
};
