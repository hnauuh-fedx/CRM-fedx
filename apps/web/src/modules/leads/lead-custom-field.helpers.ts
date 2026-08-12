import { vietnamProvinceByCode } from "@/lib/vietnam-provinces";
import type { LeadCustomField, LeadCustomFieldValue } from "./lead.types";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

export function formatLeadCustomFieldValue(field: LeadCustomField, value: LeadCustomFieldValue) {
  if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) return "Chưa cập nhật";
  if (field.dataType === "BOOLEAN") return value ? "Có" : "Không";
  if (field.dataType === "DATE" && typeof value === "string") return dateFormatter.format(new Date(value));
  if (field.dataType === "DATETIME" && typeof value === "string") return dateTimeFormatter.format(new Date(value));
  if (field.dataType === "PROVINCE" && typeof value === "string") return vietnamProvinceByCode.get(value) ?? value;
  if (field.dataType === "FILE") {
    if (Array.isArray(value)) {
      const names = value
        .filter((item): item is { name: string } => typeof item === "object" && item !== null && "name" in item && typeof item.name === "string")
        .map((item) => item.name);
      return names.length > 0 ? names.join(", ") : "Chưa cập nhật";
    }
    if (typeof value === "object" && value !== null && "name" in value) return String(value.name);
  }

  const labels = new Map((field.options ?? []).map((option) => [option.code, option.label]));
  if (field.dataType === "MULTI_SELECT" && Array.isArray(value)) return value.map((item) => labels.get(item) ?? item).join(", ");
  if (field.dataType === "SELECT" && typeof value === "string") return labels.get(value) ?? value;
  return String(value);
}
