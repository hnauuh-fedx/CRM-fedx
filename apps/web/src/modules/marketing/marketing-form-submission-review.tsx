import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import { apiRequest } from "@/services/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  marketingFormQueryKey,
  marketingFormRequestOptions,
} from "./marketing-form-query-scope";

type Candidates = {
  data: Array<{
    id: string;
    fullName: string;
    leadCode: string | null;
    phone: string;
  }>;
  pagination: { totalPages: number; total: number };
};
type ReviewInput = {
  action: "link" | "ignore";
  leadId: string;
  reason: string;
};
const reviewSchema = z
  .object({
    action: z.enum(["link", "ignore"]),
    leadId: z.string(),
    reason: z
      .string()
      .trim()
      .min(1, "Nhập lý do xử lý.")
      .max(500, "Lý do tối đa 500 ký tự."),
  })
  .superRefine((value, ctx) => {
    if (value.action === "link" && !z.uuid().safeParse(value.leadId).success)
      ctx.addIssue({
        code: "custom",
        path: ["leadId"],
        message: "Chọn Lead phù hợp để liên kết.",
      });
  });

export function MarketingFormSubmissionReview({
  formId,
  submissionId,
  programId,
  onClose,
}: {
  formId: string;
  submissionId: string;
  programId: string;
  onClose: () => void;
}) {
  const auth = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const form = useForm<ReviewInput>({
    defaultValues: { action: "link", leadId: "", reason: "" },
  });
  const action = form.watch("action");
  const leadId = form.watch("leadId");
  const path = `/forms/${formId}/submissions/${submissionId}`;
  const query = useQuery({
    queryKey: marketingFormQueryKey(
      programId,
      "review-candidates",
      formId,
      submissionId,
      page,
      search,
    ),
    queryFn: ({ signal }) =>
      apiRequest<Candidates>(
        `${path}/candidates?${new URLSearchParams({ page: String(page), limit: "20", search })}`,
        marketingFormRequestOptions(programId, signal),
        auth.accessToken!,
      ),
    enabled: Boolean(auth.accessToken && action === "link"),
  });
  const mutation = useMutation({
    mutationFn: (input: ReviewInput) =>
      apiRequest<{ status: string }>(
        `${path}/resolve`,
        {
          ...marketingFormRequestOptions(programId),
          method: "POST",
          body: JSON.stringify(
            input.action === "link"
              ? input
              : { action: input.action, reason: input.reason },
          ),
        },
        auth.accessToken!,
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: marketingFormQueryKey(programId, "submissions", formId),
        }),
        client.invalidateQueries({
          queryKey: marketingFormQueryKey(programId, "lead-history"),
        }),
      ]);
      onClose();
    },
  });
  function submit(input: ReviewInput) {
    form.clearErrors();
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        form.setError(
          issue.path[0] as keyof ReviewInput,
          { message: issue.message },
          { shouldFocus: true },
        );
      return;
    }
    mutation.mutate(parsed.data);
  }
  function applySearch() {
    setSearch(draftSearch.trim());
    setPage(1);
    form.setValue("leadId", "");
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        showCloseButton={!mutation.isPending}
      >
        <DialogHeader>
          <DialogTitle>Xử lý phản hồi trùng</DialogTitle>
          <DialogDescription>
            Chỉ liên kết phản hồi, không ghi đè thông tin hoặc thay đổi Sale. Bỏ
            qua liên kết vẫn giữ nguyên câu trả lời.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(submit)}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="review-action">Cách xử lý</FieldLabel>
              <Select
                value={action}
                disabled={mutation.isPending}
                onValueChange={(value) => {
                  form.setValue("action", value as ReviewInput["action"]);
                  mutation.reset();
                }}
              >
                <SelectTrigger id="review-action" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="link">Liên kết vào Lead</SelectItem>
                    <SelectItem value="ignore">Bỏ qua liên kết</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <ReviewLeadPicker
              action={action}
              draftSearch={draftSearch}
              mutation={mutation}
              setDraftSearch={setDraftSearch}
              applySearch={applySearch}
              form={form}
              query={query}
              leadId={leadId}
              page={page}
              setPage={setPage}
            />
            <Field data-invalid={Boolean(form.formState.errors.reason)}>
              <FieldLabel htmlFor="review-reason">Lý do xử lý</FieldLabel>
              <Textarea
                id="review-reason"
                {...form.register("reason")}
                maxLength={500}
                disabled={mutation.isPending}
                aria-invalid={Boolean(form.formState.errors.reason)}
                aria-describedby="review-reason-error"
              />
              <FieldError
                id="review-reason-error"
                errors={[form.formState.errors.reason]}
              />
            </Field>
          </FieldGroup>
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message} Nếu phản hồi đã được xử lý, đóng cửa sổ
              và tải lại danh sách.
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              Đóng
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                (action === "link" && (query.isFetching || query.isError))
              }
            >
              {mutation.isPending
                ? "Đang lưu..."
                : action === "link"
                  ? "Liên kết phản hồi"
                  : "Bỏ qua liên kết"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ReviewLeadPickerProps = {
  action: "link" | "ignore";
  draftSearch: string;
  mutation: import("@tanstack/react-query").UseMutationResult<
    { status: string },
    Error,
    ReviewInput,
    unknown
  >;
  setDraftSearch: import("react").Dispatch<
    import("react").SetStateAction<string>
  >;
  applySearch: () => void;
  form: import("react-hook-form").UseFormReturn<ReviewInput, any, ReviewInput>;
  query: import("@tanstack/react-query").UseQueryResult<
    NoInfer<Candidates>,
    Error
  >;
  leadId: string;
  page: number;
  setPage: import("react").Dispatch<import("react").SetStateAction<number>>;
};

function ReviewLeadPicker({
  action,
  draftSearch,
  mutation,
  setDraftSearch,
  applySearch,
  form,
  query,
  leadId,
  page,
  setPage,
}: ReviewLeadPickerProps) {
  return (
    action === "link" && (
      <>
        <Field>
          <FieldLabel htmlFor="review-search">
            Tìm Lead phù hợp theo tên/điện thoại
          </FieldLabel>
          <Input
            id="review-search"
            maxLength={150}
            value={draftSearch}
            disabled={mutation.isPending}
            onChange={(event) => setDraftSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applySearch();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={applySearch}
          >
            Tìm
          </Button>
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.leadId)}>
          <FieldLabel htmlFor="review-lead">Lead nhận phản hồi</FieldLabel>
          <FieldDescription>
            Chỉ hiển thị Lead khớp điện thoại/email, trong chương trình và phạm
            vi được phép cập nhật.
          </FieldDescription>
          {query.isLoading ? (
            <TableLoadingState label="Đang tìm Lead phù hợp" />
          ) : query.isError ? (
            <ErrorState
              title="Không thể tải Lead"
              description="Phản hồi có thể đã được xử lý hoặc bạn không đủ quyền. Hãy tải lại danh sách."
              onReload={() => query.refetch()}
            />
          ) : !query.data?.data.length ? (
            <EmptyState
              title="Không có Lead phù hợp"
              description="Đổi từ khóa tìm kiếm hoặc chọn bỏ qua liên kết."
            />
          ) : (
            <Select
              value={leadId}
              disabled={mutation.isPending}
              onValueChange={(value) => {
                form.setValue("leadId", value);
                form.clearErrors("leadId");
              }}
            >
              <SelectTrigger
                id="review-lead"
                className="w-full"
                aria-invalid={Boolean(form.formState.errors.leadId)}
                aria-describedby="review-lead-error"
              >
                <SelectValue placeholder="Chọn Lead" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {query.data.data.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.fullName} · {lead.phone}
                      {lead.leadCode ? ` · ${lead.leadCode}` : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          <FieldError
            id="review-lead-error"
            errors={[form.formState.errors.leadId]}
          />
          {query.data && query.data.pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1 || query.isFetching || mutation.isPending}
                onClick={() => {
                  setPage(page - 1);
                  form.setValue("leadId", "");
                }}
              >
                Trang trước
              </Button>
              <span>
                Trang {page}/{query.data.pagination.totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={
                  page >= query.data.pagination.totalPages ||
                  query.isFetching ||
                  mutation.isPending
                }
                onClick={() => {
                  setPage(page + 1);
                  form.setValue("leadId", "");
                }}
              >
                Trang sau
              </Button>
            </div>
          )}
        </Field>
      </>
    )
  );
}
