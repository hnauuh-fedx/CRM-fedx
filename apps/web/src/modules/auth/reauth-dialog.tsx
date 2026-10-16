import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { LoginInput } from "@/types/auth";
import { loginSchema } from "./login.schema";

export function ReauthDialog({ email, rememberDevice, error, onLogin, onSignOut }: {
  email: string;
  rememberDevice: boolean;
  error: string | null;
  onLogin: (input: LoginInput) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [rememberOverride, setRemember] = useState<boolean | null>(null);
  const remember = rememberOverride ?? rememberDevice;
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<{ password: string }>();
  const submit = handleSubmit(async ({ password }) => {
    const parsed = loginSchema.safeParse({ email, password, rememberDevice: remember });
    if (!parsed.success) { setError("password", { message: "Vui lòng nhập mật khẩu." }); return; }
    try { await onLogin(parsed.data); }
    catch (error) { setError("root", { message: error instanceof Error ? error.message : "Không thể đăng nhập. Vui lòng thử lại." }); }
  });
  return (
    <Dialog open>
      <DialogContent showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()} className="max-h-[90dvh] overflow-y-auto motion-reduce:animate-none">
        <DialogHeader>
          <DialogTitle>Đăng nhập lại để tiếp tục</DialogTitle>
          <DialogDescription>Phiên đăng nhập đã kết thúc. Nội dung đang nhập được giữ trên trang này. Sau khi đăng nhập, vui lòng thực hiện lại thao tác chưa hoàn tất.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reauth-email">Email</FieldLabel>
              <Input id="reauth-email" type="email" value={email} readOnly autoComplete="username" className="min-h-11" />
            </Field>
            <Field data-invalid={Boolean(errors.password)}>
              <FieldLabel htmlFor="reauth-password">Mật khẩu</FieldLabel>
              <Input id="reauth-password" type="password" autoComplete="current-password" autoFocus aria-invalid={Boolean(errors.password)} className="min-h-11" {...register("password")} />
              <FieldError errors={[errors.password]} />
            </Field>
            <Field orientation="horizontal" className="min-h-11">
              <Checkbox id="reauth-remember" checked={remember} onCheckedChange={(checked) => setRemember(checked === true)} />
              <FieldLabel htmlFor="reauth-remember">Ghi nhớ thiết bị này</FieldLabel>
            </Field>
            <FieldError errors={[errors.root]} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="min-h-11" disabled={isSubmitting}>{isSubmitting && <Spinner aria-label="Đang đăng nhập" />}Tiếp tục làm việc</Button>
            <Button type="button" variant="outline" className="min-h-11 whitespace-normal" disabled={isSubmitting} onClick={() => void onSignOut()}>Đăng xuất và bỏ nội dung đang nhập</Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
