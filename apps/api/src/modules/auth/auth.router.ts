import { changePasswordSchema } from "@admission-crm/shared/password-policy";
import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../../middlewares/auth.middleware";
import { getAuthUser, loginWithPassword } from "./auth.service";
import { changeOwnPassword, logoutAuthSession, refreshAuthSession } from "./auth-session.service";
import { clearRefreshCookie, protectAuthMutation, readRefreshCookie, writeRefreshCookie } from "./auth-cookie";
import { createLoginRateLimitMiddleware } from "./login-rate-limit";

const loginSchema = z.object({
  email: z.string().trim().max(254).email(),
  password: z.string().min(1).max(100),
  rememberDevice: z.boolean().default(false),
});

export const authRouter = Router();
authRouter.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });

authRouter.post("/login", protectAuthMutation, createLoginRateLimitMiddleware(), async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Email hoặc mật khẩu không hợp lệ." });
      return;
    }

    const session = await loginWithPassword(
      parsed.data.email,
      parsed.data.password,
      request.ip,
      z.uuid().safeParse(request.header("x-institution-program-id")).data,
      parsed.data.rememberDevice,
    );
    if (!session) {
      response.status(401).json({ message: "Email hoặc mật khẩu không chính xác." });
      return;
    }

    await logoutAuthSession(readRefreshCookie(request), false, request.ip);
    writeRefreshCookie(response, session.refreshToken, session.rememberDevice);
    response.json({ accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user, sessionId: session.sessionId, rememberDevice: session.rememberDevice });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", protectAuthMutation, async (request, response) => {
  const session = await refreshAuthSession(readRefreshCookie(request), request.ip);
  if (!session) {
    clearRefreshCookie(response);
    response.status(401).json({ message: "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại." });
    return;
  }
  // Refresh is identity-only; business APIs still enforce the selected program.
  const user = await getAuthUser(session.userId, z.uuid().safeParse(request.header("x-institution-program-id")).data);
  if (!user) {
    clearRefreshCookie(response);
    response.status(401).json({ message: "Tài khoản không còn quyền truy cập." });
    return;
  }
  writeRefreshCookie(response, session.refreshToken, session.rememberDevice);
  response.json({ accessToken: session.accessToken, expiresIn: session.expiresIn, user, sessionId: session.sessionId, rememberDevice: session.rememberDevice });
});

for (const [path, all] of [["/logout", false], ["/logout-all", true]] as const) {
  authRouter.post(path, protectAuthMutation, async (request, response) => {
    await logoutAuthSession(readRefreshCookie(request), all, request.ip);
    clearRefreshCookie(response);
    response.json({ message: all ? "Đã đăng xuất khỏi tất cả thiết bị." : "Đã đăng xuất." });
  });
}

authRouter.get("/me", requireAuthentication, (request, response) => {
  response.json({ user: request.authUser });
});

// Bearer-authenticated, so it is not exposed to cookie-based cross-site requests.
authRouter.post("/change-password", requireAuthentication, async (request, response, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu đổi mật khẩu không hợp lệ." });
      return;
    }
    // 400, not 401: a wrong current password must not trigger the re-login flow.
    const result = await changeOwnPassword(request.authUser!.id, request.authSessionId!, parsed.data.currentPassword, parsed.data.newPassword, request.ip);
    if (!result.ok) {
      response.status(400).json({ message: "Mật khẩu hiện tại không chính xác.", field: "currentPassword" });
      return;
    }
    response.json({ message: "Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất." });
  } catch (error) {
    next(error);
  }
});
