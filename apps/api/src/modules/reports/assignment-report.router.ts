import { Router } from "express";
import { assignmentReportPermissions } from "@admission-crm/shared/assignment-report";
import { requireAuthentication, requireAnyPermission } from "../../middlewares/auth.middleware";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import { assignmentOptionQuerySchema, assignmentReportQuerySchema } from "./assignment-report-query";
import { getAssignmentEventDetails, getAssignmentFilterOptions, getAssignmentReport } from "./assignment-report.service";

export const assignmentReportRouter = Router();
assignmentReportRouter.use(requireAuthentication, requireAnyPermission(...assignmentReportPermissions));
assignmentReportRouter.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });
assignmentReportRouter.get("/options", async (request, response) => {
  const parsed = assignmentOptionQuerySchema.safeParse(request.query);
  if (!parsed.success) return response.status(400).json({ message: "Bộ lọc báo cáo không hợp lệ." });
  const programId = getInstitutionProgramScope(request);
  if (!programId) return response.status(403).json({ message: "Bạn chưa được cấp phạm vi chương trình tuyển sinh." });
  return response.json(await getAssignmentFilterOptions(request.authUser!, programId, parsed.data));
});
for (const [path, execute] of [["/", getAssignmentReport], ["/events", getAssignmentEventDetails]] as const) {
  assignmentReportRouter.get(path, async (request, response) => {
    const parsed = assignmentReportQuerySchema.safeParse(request.query);
    if (!parsed.success) return response.status(400).json({ message: "Bộ lọc, khoảng ngày hoặc phân trang báo cáo không hợp lệ." });
    const programId = getInstitutionProgramScope(request);
    if (!programId) return response.status(403).json({ message: "Bạn chưa được cấp phạm vi chương trình tuyển sinh." });
    return response.json(await execute(request.authUser!, programId, parsed.data));
  });
}
