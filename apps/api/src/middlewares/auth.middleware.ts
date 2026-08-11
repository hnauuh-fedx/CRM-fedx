import type { NextFunction, Request, Response } from "express";

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

  const user = await getAuthUser(payload.sub);
  if (!user) {
    response.status(401).json({ message: "Tài khoản không còn quyền truy cập." });
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
