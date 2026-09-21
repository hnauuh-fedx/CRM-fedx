import { useForm } from "react-hook-form";
import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { LeadFilterOptions } from "@/modules/leads/lead.types";
import {
  createCustomerListSchema,
  CustomerListFilterBuilder,
  type CreateCustomerListFormValues,
} from "./customer-list-filter-builder";

type CustomerListFormDialogProps = {
  mode: "create" | "edit";
  initialValues: CreateCustomerListFormValues;
  options?: LeadFilterOptions;
  pending: boolean;
  errorMessage?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateCustomerListFormValues) => void;
};

export function CustomerListFormDialog({
  mode,
  initialValues,
  options,
  pending,
  errorMessage,
  onOpenChange,
  onSubmit,
}: CustomerListFormDialogProps) {
  const form = useForm<CreateCustomerListFormValues>({
    defaultValues: {
      name: initialValues.name,
      filters: {
        combinator: initialValues.filters.combinator,
        conditions: initialValues.filters.conditions.map((condition) => ({ ...condition })),
      },
    },
  });
  const isEdit = mode === "edit";
  const initiallyDynamic = initialValues.filters.conditions.length > 0;
  const removesFilter = initiallyDynamic && form.watch("filters.conditions").length === 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!pending) onOpenChange(open); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Chỉnh sửa danh sách khách hàng" : "Tạo danh sách khách hàng"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Đổi tên hoặc cập nhật bộ lọc. Khi thay đổi bộ lọc, danh sách sẽ được tính lại theo các điều kiện mới."
              : "Chỉ nhập tên để tạo danh sách trống, hoặc thiết lập bộ lọc để tự động lấy Lead phù hợp."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((values) => {
          form.clearErrors();
          const parsed = createCustomerListSchema.safeParse(values);
          if (!parsed.success) {
            const issue = parsed.error.issues[0];
            if (issue.path[0] === "name") form.setError("name", { message: issue.message });
            else form.setError("root", { message: issue.message });
            return;
          }
          onSubmit(parsed.data);
        })}>
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.name)}>
              <FieldLabel htmlFor={`customer-list-name-${mode}`}>Tên danh sách</FieldLabel>
              <Input
                id={`customer-list-name-${mode}`}
                placeholder="Ví dụ: Khách hàng quan tâm ngành Luật"
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register("name")}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <CustomerListFilterBuilder form={form} options={options} />

            {isEdit && removesFilter && (
              <Alert>
                <Info aria-hidden="true" />
                <AlertTitle>Các khách hàng hiện tại sẽ được giữ lại</AlertTitle>
                <AlertDescription>
                  Khi lưu mà không còn điều kiện lọc, các Lead đang thuộc danh sách theo bộ lọc cũ sẽ được chuyển thành thành viên tĩnh.
                </AlertDescription>
              </Alert>
            )}

            {form.formState.errors.root?.message && (
              <p role="alert" className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            )}
            {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
                {isEdit ? (pending ? "Đang lưu…" : "Lưu thay đổi") : (pending ? "Đang tạo…" : "Tạo danh sách")}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
