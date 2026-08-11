import { Router } from "express";

import {
  requireAnyPermission,
  requireAuthentication,
} from "../../middlewares/auth.middleware";
import { getDirectorDashboard } from "./director-dashboard.service";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/director",
  requireAuthentication,
  requireAnyPermission("dashboard.view_all"),
  async (request, response, next) => {
    try {
      response.json(await getDirectorDashboard(getInstitutionProgramScope(request)));
    } catch (error) {
      next(error);
    }
  },
);
