import type { Request } from "express";
import { z } from "zod";

const programIdSchema = z.uuid();

export class InstitutionProgramScopeError extends Error {
  constructor(
    public readonly statusCode: 400 | 403,
    message: string,
  ) {
    super(message);
    this.name = "InstitutionProgramScopeError";
  }
}

export function getInstitutionProgramScope(request: Request) {
  const rawProgramId = request.header("x-institution-program-id");
  if (!rawProgramId) {
    return request.authUser?.institutionProgramIds[0];
  }

  const parsed = programIdSchema.safeParse(rawProgramId);
  if (!parsed.success) {
    throw new InstitutionProgramScopeError(400, "Chương trình đang làm việc không hợp lệ.");
  }
  if (!request.authUser?.institutionProgramIds.includes(parsed.data)) {
    throw new InstitutionProgramScopeError(403, "Bạn không được phân quyền truy cập chương trình này.");
  }
  return parsed.data;
}
