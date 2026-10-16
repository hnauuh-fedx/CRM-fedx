import { vietnamProvinceByCode } from "@/lib/vietnam-provinces";
import type { LeadCustomField, LeadCustomFieldFileValue, LeadCustomFieldValue } from "./lead.types";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

export function isLeadCustomFieldFileValue(value: unknown): value is LeadCustomFieldFileValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && "name" in value && typeof value.name === "string"
    && "size" in value && typeof value.size === "number"
    && "type" in value && typeof value.type === "string"
    && "lastModified" in value && typeof value.lastModified === "number";
}

export function isLeadCustomFieldStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function formatLeadCustomFieldValue(field: LeadCustomField, value: LeadCustomFieldValue) {
  if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) return "Chưa cập nhật";
  if (field.dataType === "BOOLEAN") return value ? "Có" : "Không";
  if (field.dataType === "DATE" && typeof value === "string") return dateFormatter.format(new Date(value));
  if (field.dataType === "DATETIME" && typeof value === "string") return dateTimeFormatter.format(new Date(value));
  if (field.dataType === "PROVINCE" && typeof value === "string") return vietnamProvinceByCode.get(value) ?? value;
  if (field.dataType === "FILE") {
    if (Array.isArray(value)) {
      const names = value
        .filter(isLeadCustomFieldFileValue)
        .map((item) => item.name);
      return names.length > 0 ? names.join(", ") : "Chưa cập nhật";
    }
    return isLeadCustomFieldFileValue(value) ? value.name : "Chưa cập nhật";
  }

  const labels = new Map((field.options ?? []).map((option) => [option.code, option.label]));
  if (field.dataType === "MULTI_SELECT") return isLeadCustomFieldStringArray(value) ? value.map((item) => labels.get(item) ?? item).join(", ") : "Chưa cập nhật";
  if (field.dataType === "SELECT" && typeof value === "string") return labels.get(value) ?? value;
  return String(value);
}
