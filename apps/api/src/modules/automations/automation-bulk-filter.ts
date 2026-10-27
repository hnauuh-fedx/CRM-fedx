import { z } from "zod";
import { filterConditionsParamSchema } from "../leads/lead-filter.service";

const optionalId = z.uuid().optional().or(z.literal("")).transform((value) => value || undefined);
const optionalDate = z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined);
const audience = z.enum(["candidates", "students", "all"]).default("candidates");
const listFilters = z.object({
  audience,
  search: z.string().trim().max(100).optional(),
  pipelineStageId: optionalId,
  status: z.enum(["ACTIVE", "FAIL", ""]).optional().transform((value) => value || undefined),
  sourceId: optionalId,
  majorId: optionalId,
  assigneeId: optionalId,
  fromDate: optionalDate,
  toDate: optionalDate,
  filterConditions: filterConditionsParamSchema,
}).strict().refine((value) => !value.fromDate || !value.toDate || value.fromDate <= value.toDate, { message: "Khoảng ngày tạo không hợp lệ." });

export const leadAutomationTargetSchema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("selected"), leadIds: z.array(z.uuid()).min(1).max(20_000).transform((ids) => [...new Set(ids)]), audience, customerListId: z.uuid().optional() }).strict(),
  z.object({ target: z.literal("filtered"), filters: listFilters, customerListId: z.uuid().optional() }).strict(),
]);
export type LeadAutomationTarget = z.infer<typeof leadAutomationTargetSchema>;
export const automationBulkFilterSchema = z.union([
  leadAutomationTargetSchema,
  z.object({ customerListId: z.uuid() }).strict(),
]);
