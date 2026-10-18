import type { FilterConditionState, FilterOperator } from "./filter-fields";
import { INTEGER_VALUE_OPERATORS, NO_VALUE_OPERATORS, OPERATOR_LABELS } from "./filter-operators";

/**
 * Bộ lọc được lưu trong 1 query param `filters` dạng JSON, dùng chung cho URL trình duyệt
 * (giữ bộ lọc khi tải lại trang) và API `/leads` (backend parse bằng `filterConditionsParamSchema`).
 */
export const FILTER_PARAM = "filters";

type SerializedCondition = {
  combinator?: "AND" | "OR";
  field: string;
  operator: FilterOperator;
  value?: string | number | boolean;
  valueTo?: string | number;
  numberValue?: number;
};

function isPresent<T>(value: T | null | undefined | ""): value is T {
  return value !== null && value !== undefined && value !== "";
}

/** Chuỗi JSON cho các điều kiện đã chọn đủ trường + toán tử, hoặc "" nếu không có điều kiện nào. */
export function serializeConditions(conditions: FilterConditionState[]): string {
  const serialized = conditions
    .filter((condition) => condition.field && condition.operator)
    .map<SerializedCondition>((condition, index) => {
      const base = {
        ...(index > 0 ? { combinator: condition.combinator ?? "AND" } : {}),
        field: condition.field!,
        operator: condition.operator!,
      };
      // Toán tử không cần giá trị: bỏ giá trị cũ còn sót khi người dùng đổi toán tử.
      if (NO_VALUE_OPERATORS.has(condition.operator!)) return base;
      if (INTEGER_VALUE_OPERATORS.has(condition.operator!)) return { ...base, numberValue: condition.numberValue ?? undefined };
      return {
        ...base,
        ...(isPresent(condition.value) ? { value: condition.value } : {}),
        ...(condition.operator === "BETWEEN" && isPresent(condition.valueTo) && typeof condition.valueTo !== "boolean" ? { valueTo: condition.valueTo } : {}),
      };
    });
  return serialized.length > 0 ? JSON.stringify(serialized) : "";
}

let nextId = 0;
export function createConditionId() {
  nextId += 1;
  return `filter-condition-${nextId}`;
}

/** Đọc điều kiện từ URL; bỏ qua dữ liệu hỏng thay vì làm vỡ trang. */
export function decodeConditions(searchParams: URLSearchParams): FilterConditionState[] {
  const raw = searchParams.get(FILTER_PARAM);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SerializedCondition =>
        Boolean(item) && typeof item.field === "string" && typeof item.operator === "string" && item.operator in OPERATOR_LABELS)
      .slice(0, 5)
      .map((item, index) => ({
        id: createConditionId(),
        combinator: index > 0 ? (item.combinator === "OR" ? "OR" : "AND") : undefined,
        field: item.field,
        operator: item.operator,
        value: item.value ?? null,
        valueTo: item.valueTo ?? null,
        numberValue: typeof item.numberValue === "number" ? item.numberValue : null,
      }));
  } catch {
    return [];
  }
}

/** Ghi điều kiện vào URLSearchParams có sẵn (giữ nguyên các param khác). */
export function applyConditionsToParams(
  searchParams: URLSearchParams,
  conditions: FilterConditionState[],
): URLSearchParams {
  const serialized = serializeConditions(conditions);
  if (serialized) searchParams.set(FILTER_PARAM, serialized);
  else searchParams.delete(FILTER_PARAM);
  return searchParams;
}
