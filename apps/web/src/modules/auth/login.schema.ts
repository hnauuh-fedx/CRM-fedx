import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Vui lòng nhập email.").email("Email không đúng định dạng."),
  password: z.string().min(1, "Vui lòng nhập mật khẩu."),
  rememberDevice: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
