import type { FilterConditionState } from "./filter-fields";
import { NO_VALUE_OPERATORS } from "./filter-operators";

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

/** Lỗi của 1 dòng điều kiện (rỗng nếu hợp lệ). Dùng để chặn nút "Áp dụng". */
export function validateCondition(condition: FilterConditionState): string[] {
  if (!condition.field) return ["Vui lòng chọn trường lọc."];
  if (!condition.operator) return ["Vui lòng chọn điều kiện."];
  if (NO_VALUE_OPERATORS.has(condition.operator)) return [];
  if (condition.operator === "IS_X_DAYS_AGO" || condition.operator === "COUNT_EQUALS") {
    const label = condition.operator === "COUNT_EQUALS" ? "số lượng" : "số ngày";
    return condition.numberValue === null || !Number.isInteger(condition.numberValue) || condition.numberValue < 0
      ? [`Vui lòng nhập ${label} (số nguyên từ 0).`]
      : [];
  }
  if (condition.operator === "BETWEEN") {
    return isEmpty(condition.value) || isEmpty(condition.valueTo) ? ["Vui lòng nhập đủ giá trị bắt đầu và kết thúc."] : [];
  }
  if (typeof condition.value === "string" ? !condition.value.trim() : isEmpty(condition.value)) {
    return ["Vui lòng nhập giá trị."];
  }
  return [];
}

export function validateConditions(conditions: FilterConditionState[]): string[] {
  return conditions.flatMap((condition, index) => validateCondition(condition).map((error) => `Dòng ${index + 1}: ${error}`));
}

export function isConditionValid(condition: FilterConditionState): boolean {
  return validateCondition(condition).length === 0;
}
