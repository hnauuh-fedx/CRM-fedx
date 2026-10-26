import { useForm, useWatch } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  defaultWorkCalendar,
  saleWorkScheduleSchema,
  type SaleWorkSchedule,
  type SaleWorkScheduleInput,
} from "@admission-crm/shared/sale-work-schedule";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { saveWorkSchedule } from "@/services/sale-work-schedule.service";
import { ScheduleSalePicker } from "./schedule-sale-picker";
import { WorkWeekEditor } from "./work-week-editor";

export function SaleWorkScheduleDialog({
  schedule,
  token,
  programId,
  readOnly,
  onClose,
}: {
  schedule?: Partial<SaleWorkSchedule>;
  token: string;
  programId: string;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<SaleWorkScheduleInput>({
    defaultValues: {
      name: schedule?.name ?? "",
      note: schedule?.note ?? "",
      isActive: schedule?.isActive ?? true,
      calendar: schedule?.calendar ?? defaultWorkCalendar(),
      saleIds: schedule?.saleIds ?? [],
      version: schedule?.version,
      replaceExisting: false,
    },
  });
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const mutation = useMutation({
    mutationFn: (input: SaleWorkScheduleInput) =>
      saveWorkSchedule(token, programId, schedule?.id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["sale-work-schedules", programId],
      });
      onClose();
    },
    onError: (error: Error) =>
      form.setError("root", { message: error.message }),
  });
  const submit = form.handleSubmit((values) => {
    form.clearErrors();
    const result = saleWorkScheduleSchema.safeParse(values);
    if (!result.success) {
      for (const issue of result.error.issues)
        form.setError(issue.path.join(".") as "name", {
          message: issue.message,
        });
      form.setError("root", { message: result.error.issues[0]?.message });
      return;
    }
    mutation.mutate(result.data);
  });
  const title = readOnly
    ? "Chi tiết lịch làm việc"
    : schedule?.id
      ? "Sửa thời gian Sale làm việc"
      : "Thêm thời gian Sale làm việc";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-6xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Thời gian chờ và cảnh báo chỉ cộng trong các ca đã cấu hình khi rule
            bật tính theo giờ làm việc.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-6">
          <FieldSet disabled={readOnly || mutation.isPending}>
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.name)}>
                <FieldLabel htmlFor="schedule-name">Tên lịch</FieldLabel>
                <Input
                  id="schedule-name"
                  {...form.register("name")}
                  aria-invalid={Boolean(form.formState.errors.name)}
                  autoComplete="off"
                />
                <FieldError>{form.formState.errors.name?.message}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="schedule-timezone">Múi giờ</FieldLabel>
                <Input
                  id="schedule-timezone"
                  value="Việt Nam (Asia/Ho_Chi_Minh, UTC+7)"
                  readOnly
                />
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="schedule-active"
                  checked={isActive}
                  onCheckedChange={(checked) =>
                    form.setValue("isActive", checked === true, {
                      shouldDirty: true,
                    })
                  }
                />
                <FieldLabel htmlFor="schedule-active">Đang áp dụng</FieldLabel>
              </Field>
              <ScheduleSalePicker
                form={form}
                initialSales={schedule?.sales ?? []}
                token={token}
                programId={programId}
                readOnly={readOnly}
              />
              <WorkWeekEditor form={form} />
              <Field>
                <FieldLabel htmlFor="schedule-note">Ghi chú</FieldLabel>
                <Textarea id="schedule-note" {...form.register("note")} />
                <FieldDescription>
                  Ghi chú không thay đổi ca làm việc. Ngày lễ và nghỉ phép riêng
                  chưa được cấu hình tại đây.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>
          {form.formState.errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.root.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              {readOnly ? "Đóng" : "Hủy"}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Đang lưu…" : "Lưu lịch làm việc"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
