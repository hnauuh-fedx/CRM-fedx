import { Router } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import { InstitutionProgramScopeError } from "../institutions/institution-program-scope";
import { leadListPermissions, type LeadListQuery } from "../leads/lead-list.service";
import {
  addLeadsToCustomerList,
  createCustomerList,
  customerListViewPermissions,
  getCustomerList,
  listCustomerListLeads,
  listCustomerLists,
} from "./customer-list.service";
import {
  customerListFilterFields,
  customerListFilterOperators,
  customerListRelativeRanges,
  isCustomerListFilterCondition,
} from "./customer-list-filter";

const idSchema = z.uuid();
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
});
const leadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  pipelineStageId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sourceId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  assigneeId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "fullName", "leadCode", "pipelineStage"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
const filterConditionSchema = z.object({
  field: z.enum(customerListFilterFields),
  operator: z.enum(customerListFilterOperators),
  value: z.string().trim().max(255).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  relativeRange: z.enum(customerListRelativeRanges).optional(),
}).superRefine((condition, context) => {
  const emptyOperator = condition.operator === "isEmpty" || condition.operator === "isNotEmpty";
  if (emptyOperator) return;
  if (condition.operator === "between") {
    if (!condition.from || !condition.to) context.addIssue({ code: "custom", message: "Vui lòng chọn đầy đủ khoảng ngày." });
    else if (condition.from > condition.to) context.addIssue({ code: "custom", message: "Ngày bắt đầu không được sau ngày kết thúc." });
    return;
  }
  if (condition.operator === "relative") {
    if (!condition.relativeRange) context.addIssue({ code: "custom", message: "Vui lòng chọn khoảng thời gian tương đối." });
    return;
  }
  if (!condition.value) context.addIssue({ code: "custom", message: "Vui lòng nhập hoặc chọn giá trị lọc." });
}).refine(isCustomerListFilterCondition, { message: "Trường dữ liệu và toán tử lọc không tương thích." });
const filterSchema = z.object({
  combinator: z.enum(["AND", "OR"]),
  conditions: z.array(filterConditionSchema).max(10),
});
const createSchema = z.object({
  name: z.string().trim().min(2).max(255),
  filters: filterSchema.optional(),
});
const addLeadsSchema = z.object({ leadIds: z.array(z.uuid()).min(1).max(100) });

function programId(request: Parameters<typeof getInstitutionProgramScope>[0]) {
  const id = getInstitutionProgramScope(request);
  if (!id) throw new InstitutionProgramScopeError(403, "Tài khoản chưa được phân quyền chương trình tuyển sinh.");
  return id;
}

export const customerListsRouter = Router();
customerListsRouter.use(requireAuthentication);

customerListsRouter.get("/", requireAnyPermission(...customerListViewPermissions), async (request, response, next) => {
  try {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return void response.status(400).json({ message: "Tham số tìm kiếm danh sách không hợp lệ." });
    response.json(await listCustomerLists(request.authUser!, { ...parsed.data, institutionProgramId: programId(request) }));
  } catch (error) { next(error); }
});

customerListsRouter.post("/", requireAnyPermission("customer_list.manage"), async (request, response, next) => {
  try {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ message: "Thông tin danh sách không hợp lệ.", issues: parsed.error.issues });
    const result = await createCustomerList(request.authUser!, { ...parsed.data, institutionProgramId: programId(request) }, request.ip);
    if (!result.ok) {
      const message = result.reason === "duplicate_name"
        ? "Tên danh sách đã tồn tại trong chương trình này."
        : "Bộ lọc có giá trị không tồn tại hoặc nằm ngoài phạm vi bạn được xem.";
      return void response.status(result.reason === "duplicate_name" ? 409 : 400).json({ message });
    }
    response.status(201).json(result.data);
  } catch (error) { next(error); }
});

customerListsRouter.get("/:id", requireAnyPermission(...customerListViewPermissions), async (request, response, next) => {
  try {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) return void response.status(400).json({ message: "Mã danh sách không hợp lệ." });
    const result = await getCustomerList(request.authUser!, id.data, programId(request));
    if (!result) return void response.status(404).json({ message: "Không tìm thấy danh sách khách hàng." });
    response.json(result);
  } catch (error) { next(error); }
});

customerListsRouter.get("/:id/leads", requireAnyPermission(...customerListViewPermissions), requireAnyPermission(...leadListPermissions), async (request, response, next) => {
  try {
    const id = idSchema.safeParse(request.params.id);
    const query = leadQuerySchema.safeParse(request.query);
    if (!id.success || !query.success) return void response.status(400).json({ message: "Tham số danh sách lead không hợp lệ." });
    const result = await listCustomerListLeads(request.authUser!, id.data, programId(request), query.data as LeadListQuery);
    if (!result) return void response.status(404).json({ message: "Không tìm thấy danh sách khách hàng." });
    response.json(result);
  } catch (error) { next(error); }
});

customerListsRouter.post("/:id/leads", requireAnyPermission("customer_list.manage"), requireAnyPermission(...leadListPermissions), async (request, response, next) => {
  try {
    const id = idSchema.safeParse(request.params.id);
    const body = addLeadsSchema.safeParse(request.body);
    if (!id.success || !body.success) return void response.status(400).json({ message: "Danh sách lead được chọn không hợp lệ." });
    const result = await addLeadsToCustomerList(request.authUser!, id.data, [...new Set(body.data.leadIds)], programId(request), request.ip);
    if (!result.ok) {
      const message = result.reason === "lead_not_found" ? "Có lead không tồn tại hoặc nằm ngoài phạm vi bạn được xem." : "Không tìm thấy danh sách khách hàng.";
      return void response.status(result.reason === "lead_not_found" ? 400 : 404).json({ message });
    }
    response.json(result.data);
  } catch (error) { next(error); }
});
