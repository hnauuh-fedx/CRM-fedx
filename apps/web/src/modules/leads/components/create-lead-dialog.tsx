import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/modules/auth/auth-context";
import { LeadForm } from "@/modules/leads/components/lead-form";
import { emptyLeadForm } from "@/modules/leads/lead.schema";
import type { LeadFormInput } from "@/modules/leads/lead.types";
import { ApiError } from "@/services/api";
import {
  createLead,
  getLeadActionOptions,
} from "@/services/lead.service";
import type { UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
export function CreateLeadDialog({
  actionOptionsQuery,
  detailBasePath,
}: {
  actionOptionsQuery: UseQueryResult<
    Awaited<ReturnType<typeof getLeadActionOptions>>
  >;
  detailBasePath: string;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: (input: LeadFormInput) => createLead(input, auth.accessToken!),
    onSuccess: (createdLead) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      if (createdLead.canOpen !== false) navigate(`${detailBasePath}/${createdLead.id}`);
    },
  });

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          createMutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <Plus data-icon="inline-start" aria-hidden="true" />
          Thêm ứng viên
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)] xl:max-w-368">
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-14">
          <DialogTitle>Thêm thông tin ứng viên</DialogTitle>
          <DialogDescription>
            Nhập thông tin cơ bản trước; có thể bổ sung học vấn, hồ sơ tuyển
            sinh và người thân ngay trong lần tạo.
          </DialogDescription>
        </DialogHeader>
        {createMutation.isError && (
          <p role="alert" className="mx-6 mt-4 text-sm text-destructive">
            {createMutation.error instanceof ApiError
              ? createMutation.error.message
              : "Không thể tạo lead. Vui lòng thử lại."}
          </p>
        )}
        {createMutation.isSuccess && createMutation.data.canOpen === false ? <div className="flex flex-col gap-4 p-6"><p role="status">Đã tạo ứng viên thành công. Lead chưa thuộc phạm vi xem của bạn; hệ thống sẽ áp dụng rule chia Sale đang bật.</p><DialogClose asChild><Button type="button" className="self-end">Đóng</Button></DialogClose></div> : <CreateLeadEntryForm query={actionOptionsQuery} detailBasePath={detailBasePath} isPending={createMutation.isPending} onSubmit={values => createMutation.mutate(values)} />}
      </DialogContent>
    </Dialog>
  );
}


type LeadActionOptionsQuery = UseQueryResult<Awaited<ReturnType<typeof getLeadActionOptions>>>;
function CreateLeadEntryForm({ query, detailBasePath, isPending, onSubmit }: { query: LeadActionOptionsQuery; detailBasePath: string; isPending: boolean; onSubmit: (values: LeadFormInput) => void }) {
  if (query.isLoading) return <p role="status" className="px-6 py-5 text-sm text-muted-foreground">Đang tải thông tin tạo lead…</p>;
  if (query.isError || !query.data) return <p role="alert" className="px-6 py-5 text-sm text-destructive">Không thể tải nguồn lead. Vui lòng đóng cửa sổ và thử lại.</p>;
  return <>
    <ManualAssignmentNotice policy={query.data.manualAssignment} />
    <LeadForm useDisplayLayout={detailBasePath === "/sale/leads"} defaultValues={emptyLeadForm} options={query.data} submitLabel="Lưu ứng viên" isPending={isPending} dialogLayout onSubmit={onSubmit} />
  </>;
}
function ManualAssignmentNotice({ policy }: { policy: Awaited<ReturnType<typeof getLeadActionOptions>>["manualAssignment"] }) {
  if (!policy) return null;
  if (policy.keepUnassigned) return <p role="status" className="mx-6 mt-4 text-sm text-muted-foreground">Nếu không chọn Sale, lead sẽ được để trống nhân viên phụ trách để rule chia Sale xử lý.{!policy.automationEnabled && " Tự phân công cho nguồn Nhập tay hiện đang tắt; lead sẽ chờ phân công."}</p>;
  if (policy.defaultAssigneeId) return <p className="mx-6 mt-4 text-sm text-muted-foreground">Nếu không chọn Sale, bạn sẽ là nhân viên phụ trách lead này.</p>;
  return null;
}
