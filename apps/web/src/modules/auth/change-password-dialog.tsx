import { changePasswordSchema, passwordMaxLength, passwordMinLength } from "@admission-crm/shared/password-policy";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/services/api";
import { changePassword } from "@/services/auth.service";

type ChangePasswordFormValues = { currentPassword: string; newPassword: string; confirmPassword: string };

export function ChangePasswordDialog({ open, onOpenChange, accessToken, email }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  email: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md motion-reduce:animate-none">
        {/* Content unmounts on close, so every opening starts with an empty form. */}
        <ChangePasswordForm accessToken={accessToken} email={email} />
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordForm({ accessToken, email }: { accessToken: string; email: string }) {
  const [showPasswords, setShowPasswords] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ChangePasswordFormValues>({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const submit = handleSubmit(async (values) => {
    const parsed = changePasswordSchema.safeParse(values);
    let hasError = false;
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "currentPassword" || field === "newPassword") { setError(field, { message: issue.message }); hasError = true; }
      }
    }
    if (!values.confirmPassword) { setError("confirmPassword", { message: "Vui lòng nhập lại mật khẩu mới." }); hasError = true; }
    else if (values.confirmPassword !== values.newPassword) { setError("confirmPassword", { message: "Mật khẩu nhập lại không khớp." }); hasError = true; }
    if (hasError || !parsed.success) return;

    try {
      const result = await changePassword(parsed.data, accessToken);
      setSuccessMessage(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể đổi mật khẩu. Vui lòng thử lại.";
      const field = error instanceof ApiError && (error.details as { field?: string } | undefined)?.field;
      setError(field === "currentPassword" ? "currentPassword" : "root", { message });
    }
  });

  if (successMessage) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleCheck aria-hidden="true" className="size-5 text-emerald-600" />
            Đổi mật khẩu thành công
          </DialogTitle>
          <DialogDescription>{successMessage} Lần đăng nhập sau, hãy dùng mật khẩu mới.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" className="min-h-11" autoFocus>Đóng</Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  const inputType = showPasswords ? "text" : "password";
  return (
    <>
      <DialogHeader>
        <DialogTitle>Đổi mật khẩu</DialogTitle>
        <DialogDescription>Sau khi đổi, tài khoản sẽ được đăng xuất khỏi các thiết bị khác.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate>
        {/* Lets password managers associate the new password with this account. */}
        <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
        <FieldGroup>
          <Field data-invalid={Boolean(errors.currentPassword)}>
            <FieldLabel htmlFor="change-password-current">Mật khẩu hiện tại</FieldLabel>
            <Input id="change-password-current" type={inputType} autoComplete="current-password" autoFocus maxLength={passwordMaxLength}
              aria-invalid={Boolean(errors.currentPassword)} className="min-h-11" {...register("currentPassword")} />
            <FieldError errors={[errors.currentPassword]} />
          </Field>
          <Field data-invalid={Boolean(errors.newPassword)}>
            <FieldLabel htmlFor="change-password-new">Mật khẩu mới</FieldLabel>
            <Input id="change-password-new" type={inputType} autoComplete="new-password" maxLength={passwordMaxLength}
              aria-invalid={Boolean(errors.newPassword)} aria-describedby="change-password-new-hint" className="min-h-11" {...register("newPassword")} />
            <FieldDescription id="change-password-new-hint">Tối thiểu {passwordMinLength} ký tự, khác mật khẩu hiện tại.</FieldDescription>
            <FieldError errors={[errors.newPassword]} />
          </Field>
          <Field data-invalid={Boolean(errors.confirmPassword)}>
            <FieldLabel htmlFor="change-password-confirm">Nhập lại mật khẩu mới</FieldLabel>
            <Input id="change-password-confirm" type={inputType} autoComplete="new-password" maxLength={passwordMaxLength}
              aria-invalid={Boolean(errors.confirmPassword)} className="min-h-11" {...register("confirmPassword")} />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>
          <Field orientation="horizontal" className="min-h-11">
            <Checkbox id="change-password-show" checked={showPasswords} onCheckedChange={(checked) => setShowPasswords(checked === true)} />
            <FieldLabel htmlFor="change-password-show">Hiện mật khẩu</FieldLabel>
          </Field>
          <FieldError errors={[errors.root]} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11" disabled={isSubmitting}>Hủy</Button>
            </DialogClose>
            <Button type="submit" className="min-h-11" disabled={isSubmitting}>
              {isSubmitting && <Spinner aria-label="Đang lưu mật khẩu" />}
              Lưu mật khẩu
            </Button>
          </DialogFooter>
        </FieldGroup>
      </form>
    </>
  );
}
