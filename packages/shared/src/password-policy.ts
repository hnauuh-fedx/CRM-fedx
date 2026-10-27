import { z } from "zod";

// Same limits as the password an administrator sets when creating a user.
export const passwordMinLength = 8;
export const passwordMaxLength = 100;

export const newPasswordSchema = z
  .string({ error: "Vui lòng nhập mật khẩu mới." })
  .min(passwordMinLength, `Mật khẩu mới phải có tối thiểu ${passwordMinLength} ký tự.`)
  .max(passwordMaxLength, `Mật khẩu mới không được vượt quá ${passwordMaxLength} ký tự.`);

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ error: "Vui lòng nhập mật khẩu hiện tại." }).min(1, "Vui lòng nhập mật khẩu hiện tại.").max(passwordMaxLength, "Mật khẩu hiện tại không chính xác."),
    newPassword: newPasswordSchema,
  })
  .refine((input) => input.newPassword !== input.currentPassword, {
    path: ["newPassword"],
    message: "Mật khẩu mới phải khác mật khẩu hiện tại.",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
