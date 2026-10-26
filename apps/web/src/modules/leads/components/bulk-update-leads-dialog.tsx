import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import { bulkUpdateLeads, getLeadBulkUpdateOptions } from "@/services/lead.service";
import type { LeadBulkUpdateField, LeadBulkUpdateResult, LeadFilterOptions } from "../lead.types";

const NOTE_MAX_LENGTH = 4000;
const fieldLabels: Record<LeadBulkUpdateField, string> = {
  pipelineStageId: "Tiến trình",
  sourceId: "Nguồn học viên",
  originId: "Nhóm nguồn",
  monthlyRevenue: "Doanh số tháng",
  note: "Ghi chú",
};
const fieldOrder: LeadBulkUpdateField[] = ["pipelineStageId", "sourceId", "originId", "monthlyRevenue", "note"];
const fieldConsequences: Record<LeadBulkUpdateField, string> = {
  pipelineStageId: "Mỗi bản ghi được chuyển tiến trình và ghi lịch sử như khi đổi tiến trình thủ công. Bản ghi đang ở trạng thái Fail sẽ không được chuyển.",
  sourceId: "Nguồn học viên hiện tại của các bản ghi sẽ được thay bằng giá trị mới.",
  originId: "Nhóm nguồn hiện tại của các bản ghi sẽ được thay bằng giá trị mới.",
  monthlyRevenue: "Doanh số tháng hiện tại của các bản ghi sẽ được thay bằng giá trị mới.",
  note: "Mỗi bản ghi được thêm một ghi chú chăm sóc mới; các ghi chú cũ vẫn được giữ nguyên.",
};
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

type Step = "edit" | "confirm" | "result";

type BulkUpdateLeadsDialogProps = {
  open: boolean;
  leadIds: string[];
  stages: LeadFilterOptions["stages"];
  canUpdateInformation: boolean;
  canAddNote: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function BulkUpdateLeadsDialog({
  open,
  leadIds,
  stages,
  canUpdateInformation,
  canAddNote,
  onOpenChange,
  onSuccess,
}: BulkUpdateLeadsDialogProps) {
  const auth = useAuth();
  const [step, setStep] = useState<Step>("edit");
  const [field, setField] = useState<LeadBulkUpdateField | "">("");
  const [value, setValue] = useState("");
  const optionsQuery = useQuery({
    queryKey: ["leads", "bulk-update-options"],
    queryFn: () => getLeadBulkUpdateOptions(auth.accessToken!),
    enabled: open && canUpdateInformation,
  });
  const updateMutation = useMutation({
    mutationFn: () => bulkUpdateLeads(leadIds, field as LeadBulkUpdateField, value.trim(), auth.accessToken!),
    onSuccess: (result) => {
      setStep("result");
      if (result.updatedCount > 0) onSuccess();
    },
  });

  const fieldAvailability = (key: LeadBulkUpdateField): string | null => {
    if (key === "note") return canAddNote ? null : "Bạn không có quyền thêm ghi chú.";
    if (!canUpdateInformation) return "Bạn không có quyền cập nhật lead.";
    if (key === "pipelineStageId") return null;
    return optionsQuery.data?.[key].readOnlyReason ?? null;
  };
  const selectOptions = field === "pipelineStageId"
    ? stages.map((stage) => ({ id: stage.id, name: stage.name }))
    : field === "sourceId" || field === "originId"
      ? optionsQuery.data?.[field].options ?? []
      : [];
  const valueLabel = field === "monthlyRevenue"
    ? (value ? dateFormatter.format(new Date(`${value}T00:00:00.000Z`)) : "")
    : field === "note"
      ? value.trim()
      : selectOptions.find((option) => option.id === value)?.name ?? "";
  const isValueValid = Boolean(field) && Boolean(value.trim()) && (field !== "note" || value.trim().length <= NOTE_MAX_LENGTH)
    && (field === "note" || field === "monthlyRevenue" || Boolean(valueLabel));
  const isFieldBlocked = Boolean(field) && Boolean(fieldAvailability(field as LeadBulkUpdateField));

  const reset = () => {
    setStep("edit");
    setField("");
    setValue("");
    updateMutation.reset();
  };
  const setOpen = (next: boolean) => {
    if (updateMutation.isPending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {step === "edit" && (
          <>
            <DialogHeader>
              <DialogTitle>Cập nhật hàng loạt</DialogTitle>
              <DialogDescription>
                Chọn một trường và giá trị mới để áp dụng cho {leadIds.length} bản ghi đang được chọn.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (isValueValid && !isFieldBlocked) setStep("confirm");
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="bulk-update-field">Trường cần cập nhật</FieldLabel>
                  <Select
                    value={field}
                    onValueChange={(next) => {
                      setField(next as LeadBulkUpdateField);
                      setValue("");
                    }}
                  >
                    <SelectTrigger id="bulk-update-field" className="w-full">
                      <SelectValue placeholder="Chọn trường cần cập nhật" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {fieldOrder.map((key) => (
                          <SelectItem key={key} value={key} disabled={Boolean(fieldAvailability(key))}>
                            {fieldLabels[key]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {field && fieldAvailability(field) && (
                    <FieldDescription role="alert">{fieldAvailability(field)}</FieldDescription>
                  )}
                </Field>
                {field && !isFieldBlocked && (
                  <BulkUpdateValueInput
                    field={field}
                    value={value}
                    options={selectOptions}
                    optionsLoading={field !== "pipelineStageId" && optionsQuery.isLoading}
                    optionsError={field !== "pipelineStageId" && optionsQuery.isError}
                    onChange={setValue}
                  />
                )}
              </FieldGroup>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Hủy
                </Button>
                <Button type="submit" disabled={!isValueValid || isFieldBlocked || leadIds.length === 0}>
                  Cập nhật
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === "confirm" && field && (
          <>
            <DialogHeader>
              <DialogTitle>Xác nhận cập nhật hàng loạt</DialogTitle>
              <DialogDescription>
                Kiểm tra lại thông tin trước khi áp dụng. Thao tác sẽ được ghi vào lịch sử của từng bản ghi.
              </DialogDescription>
            </DialogHeader>
            <dl className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground">Số bản ghi áp dụng</dt>
                <dd className="font-semibold tabular-nums">{leadIds.length} bản ghi</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground">Trường cập nhật</dt>
                <dd className="font-semibold">{fieldLabels[field]}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground">{field === "note" ? "Nội dung ghi chú mới" : "Giá trị mới"}</dt>
                <dd className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-semibold">{valueLabel}</dd>
              </div>
            </dl>
            <p className="flex gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>
                {field === "note"
                  ? `Thêm ghi chú trên vào ${leadIds.length} bản ghi. `
                  : `Cập nhật ${fieldLabels[field]} thành “${valueLabel}” cho ${leadIds.length} bản ghi. `}
                {fieldConsequences[field]}
              </span>
            </p>
            {updateMutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {updateMutation.error instanceof ApiError
                  ? updateMutation.error.message
                  : "Không thể cập nhật hàng loạt. Vui lòng thử lại."}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={updateMutation.isPending} onClick={() => setStep("edit")}>
                Quay lại
              </Button>
              <Button type="button" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
                {updateMutation.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
                {updateMutation.isPending ? "Đang cập nhật…" : `Xác nhận cập nhật ${leadIds.length} bản ghi`}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "result" && updateMutation.data && (
          <BulkUpdateResultView result={updateMutation.data} onClose={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BulkUpdateValueInput({
  field,
  value,
  options,
  optionsLoading,
  optionsError,
  onChange,
}: {
  field: LeadBulkUpdateField;
  value: string;
  options: Array<{ id: string; name: string }>;
  optionsLoading: boolean;
  optionsError: boolean;
  onChange: (value: string) => void;
}) {
  const label = field === "note" ? "Nội dung ghi chú" : `${fieldLabels[field]} mới`;
  if (field === "note") {
    return (
      <Field>
        <FieldLabel htmlFor="bulk-update-value">{label}</FieldLabel>
        <Textarea
          id="bulk-update-value"
          rows={4}
          value={value}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Nội dung cuộc gọi, nhu cầu hoặc bước tiếp theo…"
          onChange={(event) => onChange(event.target.value)}
        />
        <FieldDescription>{value.trim().length}/{NOTE_MAX_LENGTH} ký tự</FieldDescription>
      </Field>
    );
  }
  if (field === "monthlyRevenue") {
    return (
      <Field>
        <FieldLabel htmlFor="bulk-update-value">{label}</FieldLabel>
        <Input id="bulk-update-value" type="date" value={value} onChange={(event) => onChange(event.target.value)} />
      </Field>
    );
  }
  return (
    <Field>
      <FieldLabel htmlFor="bulk-update-value">{label}</FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={optionsLoading || optionsError || options.length === 0}>
        <SelectTrigger id="bulk-update-value" className="w-full">
          <SelectValue placeholder={optionsLoading ? "Đang tải lựa chọn…" : `Chọn ${fieldLabels[field].toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {optionsError && (
        <FieldDescription role="alert" className="text-destructive">
          Không thể tải danh sách lựa chọn. Vui lòng đóng cửa sổ và thử lại.
        </FieldDescription>
      )}
      {!optionsLoading && !optionsError && options.length === 0 && (
        <FieldDescription role="status">
          {field === "originId"
            ? "Chưa có nhóm nguồn nào trong chương trình đang làm việc."
            : "Chưa có lựa chọn nào khả dụng."}
        </FieldDescription>
      )}
    </Field>
  );
}

function BulkUpdateResultView({ result, onClose }: { result: LeadBulkUpdateResult; onClose: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Kết quả cập nhật hàng loạt</DialogTitle>
        <DialogDescription>
          {fieldLabels[result.field]} · {result.totalCount} bản ghi đã xử lý.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-2" role="status">
        <ResultMetric label="Đã cập nhật" value={result.updatedCount} />
        <ResultMetric label="Không thay đổi" value={result.unchangedCount} />
        <ResultMetric label="Lỗi" value={result.failedCount} />
      </div>
      {result.failedCount === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
          Đã hoàn tất cập nhật cho tất cả bản ghi.
        </p>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Các bản ghi chưa được cập nhật</p>
          <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
            {result.failures.map((failure) => (
              <li key={failure.leadId} className="grid gap-0.5 px-3 py-2">
                <span className="font-medium">
                  {failure.fullName}
                  {failure.leadCode && <span className="text-muted-foreground"> · {failure.leadCode}</span>}
                </span>
                <span className="text-destructive">{failure.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Đóng
        </Button>
      </DialogFooter>
    </>
  );
}

function ResultMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
