import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { getAuthUser, verifyAccessToken } from "../modules/auth/auth.service";
import type { AuthUser } from "../modules/auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export async function requireAuthentication(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  const payload = token ? verifyAccessToken(token) : null;

  if (!payload) {
    response.status(401).json({ message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    return;
  }

  const rawProgramId = request.header("x-institution-program-id");
  const parsedProgramId = rawProgramId ? z.uuid().safeParse(rawProgramId) : null;
  if (parsedProgramId && !parsedProgramId.success) {
    response.status(400).json({ message: "Chương trình đang làm việc không hợp lệ." });
    return;
  }
  const user = await getAuthUser(payload.sub, parsedProgramId?.data);
  if (!user) {
    response.status(401).json({ message: "Tài khoản không còn quyền truy cập." });
    return;
  }
  if (parsedProgramId?.success && !user.institutionProgramIds.includes(parsedProgramId.data)) {
    response.status(403).json({ message: "Bạn không được phân quyền truy cập chương trình này." });
    return;
  }

  request.authUser = user;
  next();
}

export function requireAnyPermission(...permissions: string[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    const grantedPermissions = new Set(request.authUser?.permissions ?? []);
    if (!permissions.some((permission) => grantedPermissions.has(permission))) {
      response.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này." });
      return;
    }

    next();
  };
}
