import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { BadgeCheck, GraduationCap, ShieldCheck } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

import { loginSchema, type LoginFormValues } from "@/modules/auth/login.schema";

type LoginFormProps = {
  onLogin: (values: LoginFormValues) => Promise<void>;
};

const LoginForm = ({ onLogin }: LoginFormProps) => {
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<LoginFormValues>({
    defaultValues: {
      email: "",
      password: "",
      rememberDevice: true,
    },
  });

  async function submit(values: LoginFormValues) {
    clearErrors();
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email" || field === "password" || field === "rememberDevice") {
          setError(field, { message: issue.message });
        }
      }
      return;
    }

    try {
      await onLogin(parsed.data);
    } catch (error) {
      setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "Không thể đăng nhập lúc này. Vui lòng thử lại.",
      });
    }
  }

  return (
    <section className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <div className="hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary-foreground/12">
            <GraduationCap aria-hidden="true" />
          </span>
          <div>
            <p className="text-base font-semibold">Admission CRM</p>
            <p className="text-sm text-primary-foreground/75">Nền tảng quản lý tuyển sinh</p>
          </div>
        </div>
        <div className="flex max-w-lg flex-col gap-6">
          <p className="text-4xl font-semibold leading-tight tracking-tight">
            Điều hành hành trình tuyển sinh trên một không gian làm việc.
          </p>
          <div className="grid gap-4 text-sm text-primary-foreground/85">
            <p className="flex items-center gap-3">
              <ShieldCheck aria-hidden="true" />
              Truy cập theo vai trò và phạm vi dữ liệu được cấp
            </p>
            <p className="flex items-center gap-3">
              <BadgeCheck aria-hidden="true" />
              Theo dõi lead, hồ sơ và sinh viên nhất quán
            </p>
          </div>
        </div>
        <p className="text-sm text-primary-foreground/70">
          Hệ thống nội bộ dành cho đội ngũ tuyển sinh.
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <Card className="w-full max-w-md gap-7 border-border/70 px-6 py-8 shadow-lg shadow-primary/5 sm:p-10">
          <CardHeader className="gap-6 p-0">
            <div className="lg:hidden">
              <a
                href="/"
                aria-label="Trang chủ Admission CRM"
                className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
              >
                <GraduationCap aria-hidden="true" />
              </a>
            </div>
            <div className="flex flex-col gap-1">
              <CardTitle className="text-2xl font-semibold tracking-tight text-card-foreground">
                Đăng nhập
              </CardTitle>
              <CardDescription className="text-sm font-normal text-muted-foreground">
                Nhập thông tin tài khoản để tiếp tục vào Admission CRM.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <form onSubmit={handleSubmit(submit)} noValidate>
              <FieldGroup className="gap-6">
                <div className="flex flex-col gap-5">
                  <Field className="gap-2" data-invalid={Boolean(errors.email)}>
                    <FieldLabel
                      htmlFor="email"
                      className="text-sm font-medium"
                    >
                      Email <span aria-hidden="true">*</span>
                    </FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="tenban@truong.edu.vn"
                      autoComplete="username"
                      required
                      aria-invalid={Boolean(errors.email)}
                      className="h-11"
                      {...register("email")}
                    />
                    <FieldError errors={[errors.email]} />
                  </Field>
                  <Field className="gap-2" data-invalid={Boolean(errors.password)}>
                    <FieldLabel
                      htmlFor="password"
                      className="text-sm font-medium"
                    >
                      Mật khẩu <span aria-hidden="true">*</span>
                    </FieldLabel>

                    <Input
                      id="password"
                      type="password"
                      placeholder="Nhập mật khẩu"
                      autoComplete="current-password"
                      required
                      aria-invalid={Boolean(errors.password)}
                      className="h-11"
                      {...register("password")}
                    />
                    <FieldError errors={[errors.password]} />
                  </Field>
                </div>

                <Field orientation="horizontal" className="justify-between">
                  <div className="flex items-center gap-3">
                    <Controller
                      control={control}
                      name="rememberDevice"
                      render={({ field }) => (
                        <Checkbox
                          id="remember-device"
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                          className="cursor-pointer"
                        />
                      )}
                    />
                    <FieldLabel htmlFor="remember-device" className="cursor-pointer text-sm font-normal">
                      Ghi nhớ thiết bị này
                    </FieldLabel>
                  </div>
                  <span className="text-end text-sm text-muted-foreground">Quên mật khẩu?</span>
                </Field>

                <Field className="gap-4">
                  <FieldError errors={[errors.root]} />
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting}
                    className="h-11"
                  >
                    {isSubmitting && <Spinner data-icon="inline-start" aria-label="Đang đăng nhập" />}
                    {isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}
                  </Button>
                  <FieldDescription className="text-center text-sm font-normal text-muted-foreground">
                    Vui lòng liên hệ quản trị viên nếu bạn cần cấp tài khoản hoặc đặt lại mật khẩu.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default LoginForm;
