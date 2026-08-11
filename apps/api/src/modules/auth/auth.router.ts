import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../../middlewares/auth.middleware";
import { loginWithPassword } from "./auth.service";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post("/login", async (request, response, next) => {
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
    );
    if (!session) {
      response.status(401).json({ message: "Email hoặc mật khẩu không chính xác." });
      return;
    }

    response.json(session);
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuthentication, (request, response) => {
  response.json({ user: request.authUser });
});
