import type { CookieOptions, NextFunction, Request, Response } from "express";
import { env } from "../../config/env";

const cookieName = "admission-crm.refresh";
const secure = env.NODE_ENV === "production" || new URL(env.WEB_ORIGIN).protocol === "https:";
if (env.AUTH_COOKIE_SAME_SITE === "none" && !secure) throw new Error("Cross-site auth cookies require HTTPS.");

const options: CookieOptions = { httpOnly: true, secure, sameSite: env.AUTH_COOKIE_SAME_SITE, path: "/api/auth" };

export function readRefreshCookie(request: Request) {
  const entry = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  if (!entry) return "";
  try { return decodeURIComponent(entry.slice(cookieName.length + 1)); } catch { return ""; }
}

export function writeRefreshCookie(response: Response, token: string, rememberDevice: boolean) {
  response.cookie(cookieName, token, { ...options, ...(rememberDevice ? { maxAge: 400 * 24 * 60 * 60 * 1000 } : {}) });
}

export function clearRefreshCookie(response: Response) {
  response.clearCookie(cookieName, options);
}

export function protectAuthMutation(request: Request, response: Response, next: NextFunction) {
  const origin = request.header("origin");
  if ((origin && origin !== new URL(env.WEB_ORIGIN).origin) || (request.path !== "/login" && request.header("x-crm-auth") !== "1") || (origin && request.header("x-crm-auth") !== "1")) {
    response.status(403).json({ message: "Yêu cầu xác thực không hợp lệ." });
    return;
  }
  response.setHeader("Cache-Control", "no-store");
  next();
}
