import { Router, type RequestHandler } from "express";
import { z } from "zod";
import {
  requireAuthentication,
  requireAnyPermission,
} from "../../middlewares/auth.middleware";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import {
  DisplayLayoutError,
  layoutDraftShape,
  layoutScreenSchema,
  layoutWriteSchema,
  personalLayoutWriteSchema,
  listLayoutScreenSchema,
} from "./display-layout.validation";
import {
  createLayout,
  effectiveLayout,
  layoutDetail,
  layoutTargetOptions,
  listLayouts,
  previewLayout,
  publishLayout,
  restoreLayout,
  saveLayout,
} from "./display-layout.service";
import {
  savePersonalLayout,
  resetPersonalLayout,
} from "./personal-display-layout.service";

export const displayLayoutsRouter = Router();
displayLayoutsRouter.use(requireAuthentication);
const handle =
  (
    action: (
      request: Parameters<RequestHandler>[0],
      programId: string,
    ) => Promise<unknown>,
  ): RequestHandler =>
  async (req, res, next) => {
    try {
      const programId = getInstitutionProgramScope(req);
      if (!programId)
        throw new DisplayLayoutError(
          400,
          "Vui lòng chọn chương trình làm việc.",
        );
      res.json(await action(req, programId));
    } catch (error) {
      if (error instanceof DisplayLayoutError) {
        res.status(error.status).json({ message: error.message });
        return;
      }
      if (error instanceof z.ZodError) {
        res.status(400).json({
          message: "Dữ liệu cấu hình không hợp lệ.",
          issues: error.issues,
        });
        return;
      }
      next(error);
    }
  };
const id = (value: unknown) => z.uuid().parse(value);
const page = (value: unknown) =>
  z.coerce.number().int().min(1).max(100000).default(1).parse(value);
const search = (value: unknown) =>
  z.string().trim().max(120).default("").parse(value);
const revisionSchema = z.object({ revision: z.number().int().min(1) }).strict();

displayLayoutsRouter.get(
  "/effective",
  requireAnyPermission(
    "lead.view_all",
    "lead.view_department",
    "lead.view_assigned",
    "lead.create",
  ),
  handle((req, programId) =>
    effectiveLayout(
      req.authUser!,
      programId,
      undefined,
      layoutScreenSchema.parse(req.query.screen),
    ),
  ),
);
const personalPermission = requireAnyPermission(
  "lead.view_all",
  "lead.view_department",
  "lead.view_assigned",
);
displayLayoutsRouter.put(
  "/personal",
  personalPermission,
  handle((req, programId) =>
    savePersonalLayout(
      req.authUser!,
      programId,
      personalLayoutWriteSchema.parse(req.body),
      req.ip,
      listLayoutScreenSchema.parse(req.query.screen),
    ),
  ),
);
displayLayoutsRouter.post(
  "/personal/reset",
  personalPermission,
  handle((req, programId) =>
    resetPersonalLayout(
      req.authUser!,
      programId,
      z
        .object({ revision: z.number().int().min(0) })
        .strict()
        .parse(req.body).revision,
      req.ip,
      listLayoutScreenSchema.parse(req.query.screen),
    ),
  ),
);
displayLayoutsRouter.use(requireAnyPermission("system.manage"));
displayLayoutsRouter.get(
  "/",
  handle((req, programId) =>
    listLayouts(
      req.authUser!,
      programId,
      page(req.query.page),
      search(req.query.search),
      layoutScreenSchema.parse(req.query.screen),
    ),
  ),
);
displayLayoutsRouter.get(
  "/targets",
  handle((req, programId) =>
    layoutTargetOptions(
      req.authUser!,
      programId,
      z.enum(["USER", "DEPARTMENT"]).parse(req.query.type),
      search(req.query.search),
      page(req.query.page),
      req.query.departmentId ? id(req.query.departmentId) : undefined,
    ),
  ),
);
displayLayoutsRouter.post(
  "/",
  handle((req, programId) => {
    const body = z
      .object({
        draft: layoutDraftShape,
        screen: layoutScreenSchema,
        managementDepartmentId: z.uuid().nullable(),
      })
      .strict()
      .parse(req.body);
    return createLayout(
      req.authUser!,
      programId,
      body.managementDepartmentId,
      body.draft,
      req.ip,
      body.screen,
    );
  }),
);
displayLayoutsRouter.get(
  "/:id",
  handle((req, programId) =>
    layoutDetail(
      req.authUser!,
      programId,
      id(req.params.id),
      page(req.query.page),
    ),
  ),
);
displayLayoutsRouter.put(
  "/:id/draft",
  handle((req, programId) => {
    const body = layoutWriteSchema.parse(req.body);
    return saveLayout(
      req.authUser!,
      programId,
      id(req.params.id),
      body.revision,
      body.draft,
      req.ip,
    );
  }),
);
displayLayoutsRouter.post(
  "/:id/preview",
  handle((req, programId) =>
    previewLayout(
      req.authUser!,
      programId,
      id(req.params.id),
      revisionSchema.parse(req.body).revision,
    ),
  ),
);
displayLayoutsRouter.post(
  "/:id/publish",
  handle((req, programId) => {
    const body = revisionSchema
      .extend({ assignmentRevision: z.number().int().min(0) })
      .parse(req.body);
    return publishLayout(
      req.authUser!,
      programId,
      id(req.params.id),
      body.revision,
      body.assignmentRevision,
      req.ip,
    );
  }),
);
displayLayoutsRouter.post(
  "/:id/restore",
  handle((req, programId) => {
    const body = revisionSchema
      .extend({ version: z.number().int().min(1) })
      .parse(req.body);
    return restoreLayout(
      req.authUser!,
      programId,
      id(req.params.id),
      body.revision,
      body.version,
      req.ip,
    );
  }),
);
