import cors from "cors";
import express, { type ErrorRequestHandler } from "express";

import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.router";
import { admissionsRouter } from "./modules/admissions/admissions.router";
import { majorsRouter } from "./modules/admissions/majors.router";
import { auditLogsRouter } from "./modules/audit/audit-logs.router";
import { campaignsRouter } from "./modules/campaigns/campaigns.router";
import { formFieldsRouter, formsRouter } from "./modules/campaigns/forms.router";
import {
  leadSourcesRouter,
  marketingFormsRouter,
  publicMarketingFormsRouter,
  utmTrackingsRouter,
} from "./modules/campaigns/marketing-reference.router";
import { dashboardRouter } from "./modules/dashboard/dashboard.router";
import { departmentsRouter } from "./modules/departments/departments.router";
import { institutionProgramsRouter } from "./modules/institutions/institution-programs.router";
import { InstitutionProgramScopeError } from "./modules/institutions/institution-program-scope";
import { leadsRouter } from "./modules/leads/leads.router";
import { saleOverviewRouter } from "./modules/leads/sale-overview.router";
import { personalNotificationsRouter } from "./modules/notifications/personal-notifications.router";
import { permissionsRouter } from "./modules/permissions/permissions.router";
import { pipelinesRouter } from "./modules/pipelines/pipelines.router";
import { reportsRouter } from "./modules/reports/reports.router";
import { rolesRouter } from "./modules/roles/roles.router";
import { studentsRouter } from "./modules/students/students.router";
import { systemRouter } from "./modules/system/system.router";
import { automationsRouter } from "./modules/automations/automations.router";
import "./modules/automations/automation-engine.service"; // Initialize BullMQ Worker
import { usersRouter } from "./modules/users/users.router";
import { customFieldsRouter } from "./modules/custom-fields/custom-fields.router";

export const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: env.WEB_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/admissions", admissionsRouter);
app.use("/api/majors", majorsRouter);
app.use("/api/audit-logs", auditLogsRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/forms", formsRouter);
app.use("/api/form-fields", formFieldsRouter);
app.use("/api/lead-sources", leadSourcesRouter);
app.use("/api/marketing-forms", marketingFormsRouter);
app.use("/api/public", publicMarketingFormsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/institution-programs", institutionProgramsRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/sale", saleOverviewRouter);
app.use("/api/notifications", personalNotificationsRouter);
app.use("/api/permissions", permissionsRouter);
app.use("/api/pipelines", pipelinesRouter);
app.use("/api/students", studentsRouter);
app.use("/api/system", systemRouter);
app.use("/api/automations", automationsRouter);
app.use("/api/utm-trackings", utmTrackingsRouter);
app.use("/api/users", usersRouter);
app.use("/api/custom-fields", customFieldsRouter);

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof InstitutionProgramScopeError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  console.error(error);
  response.status(500).json({
    message: "Đã xảy ra lỗi máy chủ. Vui lòng thử lại.",
  });
};

app.use(errorHandler);
