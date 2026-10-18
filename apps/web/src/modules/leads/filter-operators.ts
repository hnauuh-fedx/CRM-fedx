import type { FilterDataType, FilterFieldDefinition, FilterOperator } from "./filter-fields";

/** Toán tử khả dụng theo kiểu dữ liệu của trường. Mirror backend `lead-filter.service.ts`. */
export const OPERATORS_BY_DATA_TYPE: Record<FilterDataType, FilterOperator[]> = {
  text: ["CONTAINS", "NOT_CONTAINS", "EQUALS", "NOT_EQUALS", "STARTS_WITH", "ENDS_WITH", "HAS_VALUE", "HAS_NO_VALUE"],
  number: ["EQUALS", "NOT_EQUALS", "GT", "GTE", "LT", "LTE", "BETWEEN", "HAS_VALUE", "HAS_NO_VALUE"],
  date: [
    "EQUALS", "NOT_EQUALS", "GT", "GTE", "LT", "LTE", "BETWEEN",
    "IS_TODAY", "IS_YESTERDAY", "IS_THIS_WEEK", "IS_LAST_WEEK", "IS_THIS_MONTH", "IS_LAST_MONTH",
    "IS_QUARTER_1", "IS_QUARTER_2", "IS_QUARTER_3", "IS_QUARTER_4", "IS_X_DAYS_AGO",
    "HAS_VALUE", "HAS_NO_VALUE",
  ],
  enum: ["EQUALS", "NOT_EQUALS", "HAS_VALUE", "HAS_NO_VALUE"],
  boolean: ["EQUALS", "NOT_EQUALS", "HAS_VALUE", "HAS_NO_VALUE"],
  file: ["HAS_VALUE", "HAS_NO_VALUE"],
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  CONTAINS: "Chứa",
  NOT_CONTAINS: "Không chứa",
  EQUALS: "Là",
  NOT_EQUALS: "Không phải",
  STARTS_WITH: "Bắt đầu bằng",
  ENDS_WITH: "Kết thúc bằng",
  GT: ">",
  GTE: ">=",
  LT: "<",
  LTE: "<=",
  BETWEEN: "Trong khoảng",
  IS_TODAY: "Hôm nay",
  IS_YESTERDAY: "Hôm qua",
  IS_THIS_WEEK: "Tuần này",
  IS_LAST_WEEK: "Tuần trước",
  IS_THIS_MONTH: "Tháng này",
  IS_LAST_MONTH: "Tháng trước",
  IS_QUARTER_1: "Quý 1",
  IS_QUARTER_2: "Quý 2",
  IS_QUARTER_3: "Quý 3",
  IS_QUARTER_4: "Quý 4",
  IS_X_DAYS_AGO: "X ngày trước",
  HAS_VALUE: "Có giá trị",
  HAS_NO_VALUE: "Không có giá trị",
  COUNT_EQUALS: "Số lượng là",
};

/** Toán tử của 1 trường: theo kiểu dữ liệu, cộng "Số lượng là" cho trường nhiều giá trị. */
export function getFieldOperators(fieldDef: FilterFieldDefinition | undefined): FilterOperator[] {
  if (!fieldDef) return [];
  const operators = OPERATORS_BY_DATA_TYPE[fieldDef.dataType];
  return fieldDef.maxCount ? [...operators, "COUNT_EQUALS"] : operators;
}

/** Toán tử nhập 1 số nguyên vào `numberValue` thay vì `value`. */
export const INTEGER_VALUE_OPERATORS = new Set<FilterOperator>(["IS_X_DAYS_AGO", "COUNT_EQUALS"]);

/** Trường ngày/số dùng ký hiệu so sánh như yêu cầu nghiệp vụ. */
const COMPARISON_LABELS: Partial<Record<FilterOperator, string>> = { EQUALS: "=", NOT_EQUALS: "!=" };

export function getOperatorLabel(operator: FilterOperator, dataType?: FilterDataType) {
  return ((dataType === "date" || dataType === "number") && COMPARISON_LABELS[operator]) || OPERATOR_LABELS[operator];
}

/** Toán tử không cần nhập giá trị (mốc thời gian, có/không có giá trị). */
export const NO_VALUE_OPERATORS = new Set<FilterOperator>([
  "IS_TODAY", "IS_YESTERDAY", "IS_THIS_WEEK", "IS_LAST_WEEK", "IS_THIS_MONTH", "IS_LAST_MONTH",
  "IS_QUARTER_1", "IS_QUARTER_2", "IS_QUARTER_3", "IS_QUARTER_4",
  "HAS_VALUE", "HAS_NO_VALUE",
]);

export function operatorNeedsValueInput(operator: FilterOperator | null): boolean {
  return Boolean(operator) && !NO_VALUE_OPERATORS.has(operator!);
}
