import type { Request } from "express";
import { z } from "zod";

const programIdSchema = z.uuid();

export function getInstitutionProgramScope(request: Request) {
  const parsed = programIdSchema.safeParse(request.header("x-institution-program-id"));
  return parsed.success ? parsed.data : undefined;
}
