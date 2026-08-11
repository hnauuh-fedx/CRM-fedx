export type BusinessRecord = {
  id: string;
  [key: string]: string | number | null;
};

export type BusinessRecordListResponse<TSort extends string> = {
  data: BusinessRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  sort: { sortBy: TSort; sortOrder: "asc" | "desc" };
};

export type BusinessRecordListParams<TSort extends string> = {
  page: number;
  limit: number;
  search: string;
  sortBy: TSort;
  sortOrder: "asc" | "desc";
  status?: string;
  type?: string;
};

const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const moneyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function formatDateCell(value: string | number | null) {
  return typeof value === "string" && value ? dateFormatter.format(new Date(value)) : "-";
}

export function formatMoneyCell(value: string | number | null) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? moneyFormatter.format(numericValue) : "-";
}
