import { Router } from "express";
import { z } from "zod";
import { saleWorkScheduleSchema } from "@admission-crm/shared/sale-work-schedule";
import {
  requireAuthentication,
  requireAnyPermission,
} from "../../middlewares/auth.middleware";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import {
  listWorkSchedules,
  saveWorkSchedule,
  searchScheduleSales,
  WorkScheduleError,
} from "./sale-work-schedule.service";

export const saleWorkSchedulesRouter = Router();
saleWorkSchedulesRouter.use(
  requireAuthentication,
  requireAnyPermission("automation.manage"),
);
const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
  isActive: z.enum(["true", "false"]).optional(),
});
saleWorkSchedulesRouter.get("/", async (req, res, next) => {
  try {
    const programId = getInstitutionProgramScope(req);
    const query = listQuery.safeParse(req.query);
    if (!programId || !query.success) {
      res
        .status(400)
        .json({ message: "Chọn chương trình và kiểm tra bộ lọc danh sách." });
      return;
    }
    res.json(
      await listWorkSchedules(req.authUser!, programId, {
        ...query.data,
        isActive:
          query.data.isActive === undefined
            ? undefined
            : query.data.isActive === "true",
      }),
    );
  } catch (error) {
    next(error);
  }
});
saleWorkSchedulesRouter.get("/sales", async (req, res, next) => {
  try {
    const programId = getInstitutionProgramScope(req);
    const query = listQuery.safeParse(req.query);
    if (!programId || !query.success) {
      res.status(400).json({ message: "Tham số tìm Sale không hợp lệ." });
      return;
    }
    res.json(
      await searchScheduleSales(
        req.authUser!,
        programId,
        query.data.search,
        query.data.page,
      ),
    );
  } catch (error) {
    next(error);
  }
});
saleWorkSchedulesRouter.post("/", async (req, res, next) => {
  try {
    const programId = getInstitutionProgramScope(req);
    const input = saleWorkScheduleSchema.safeParse(req.body);
    if (!programId || !input.success) {
      res
        .status(400)
        .json({
          message: input.success
            ? "Vui lòng chọn chương trình."
            : input.error.issues[0]?.message,
          issues: input.success ? [] : input.error.issues,
        });
      return;
    }
    res
      .status(201)
      .json(
        await saveWorkSchedule(
          req.authUser!,
          programId,
          undefined,
          input.data,
          req.ip,
        ),
      );
  } catch (error) {
    if (error instanceof WorkScheduleError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  }
});
saleWorkSchedulesRouter.put("/:id", async (req, res, next) => {
  try {
    const programId = getInstitutionProgramScope(req);
    const id = z.string().uuid().safeParse(req.params.id);
    const input = saleWorkScheduleSchema.safeParse(req.body);
    if (!programId || !id.success || !input.success) {
      res
        .status(400)
        .json({
          message: !input.success
            ? input.error.issues[0]?.message
            : "Mã lịch hoặc chương trình không hợp lệ.",
        });
      return;
    }
    res.json(
      await saveWorkSchedule(
        req.authUser!,
        programId,
        id.data,
        input.data,
        req.ip,
      ),
    );
  } catch (error) {
    if (error instanceof WorkScheduleError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  }
});
