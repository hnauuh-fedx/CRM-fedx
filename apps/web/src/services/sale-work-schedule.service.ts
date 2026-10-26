import type {
  SaleWorkSchedule,
  SaleWorkScheduleInput,
} from "@admission-crm/shared/sale-work-schedule";
import { apiRequest } from "./api";
export type ScheduleList = {
  data: SaleWorkSchedule[];
  pagination: { page: number; total: number; totalPages: number };
};
export function listWorkSchedules(
  token: string,
  programId: string,
  page: number,
  search: string,
  status: string,
) {
  const query = new URLSearchParams({
    page: String(page),
    limit: "20",
    search,
  });
  if (status) query.set("isActive", status);
  return apiRequest<ScheduleList>(
    `/sale-work-schedules?${query}`,
    { headers: { "X-Institution-Program-Id": programId } },
    token,
  );
}
export function searchScheduleSales(
  token: string,
  programId: string,
  search: string,
  page: number,
) {
  return apiRequest<{
    data: { id: string; fullName: string }[];
    hasMore: boolean;
  }>(
    `/sale-work-schedules/sales?${new URLSearchParams({ search, page: String(page) })}`,
    { headers: { "X-Institution-Program-Id": programId } },
    token,
  );
}
export function saveWorkSchedule(
  token: string,
  programId: string,
  id: string | undefined,
  input: SaleWorkScheduleInput,
) {
  return apiRequest<SaleWorkSchedule>(
    `/sale-work-schedules${id ? `/${id}` : ""}`,
    {
      method: id ? "PUT" : "POST",
      headers: { "X-Institution-Program-Id": programId },
      body: JSON.stringify(input),
    },
    token,
  );
}
