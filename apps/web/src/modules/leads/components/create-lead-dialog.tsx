import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
  updateLeadCustomFields,
} from "@/services/lead.service";
import type { UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  const [partialCreateLeadId, setPartialCreateLeadId] = useState<string | null>(
    null,
  );
  const createMutation = useMutation({
    mutationFn: async (input: LeadFormInput) => {
      const createdLead = await createLead(input, auth.accessToken!);
      setPartialCreateLeadId(createdLead.id);
      const values = Object.entries(input.customFieldValues).map(
        ([fieldId, value]) => ({ fieldId, value }),
      );
      if (values.length > 0)
        await updateLeadCustomFields(
          createdLead.id,
          { values },
          auth.accessToken!,
        );
      return createdLead;
    },
    onSuccess: (createdLead) => {
      setPartialCreateLeadId(null);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      navigate(`${detailBasePath}/${createdLead.id}`);
    },
  });

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          createMutation.reset();
          setPartialCreateLeadId(null);
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
        {partialCreateLeadId && createMutation.isError && (
          <p className="mx-6 mt-2 text-sm text-muted-foreground">
            Lead đã được tạo nhưng thông tin bổ sung chưa lưu.{" "}
            <Link
              className="font-medium text-primary underline"
              to={`${detailBasePath}/${partialCreateLeadId}`}
            >
              Mở lead để lưu lại
            </Link>
            .
          </p>
        )}
        {actionOptionsQuery.isLoading ? (
          <p role="status" className="px-6 py-5 text-sm text-muted-foreground">
            Đang tải thông tin tạo lead…
          </p>
        ) : actionOptionsQuery.isError ? (
          <p role="alert" className="px-6 py-5 text-sm text-destructive">
            Không thể tải nguồn lead. Vui lòng đóng cửa sổ và thử lại.
          </p>
        ) : (
          <LeadForm
            useDisplayLayout={detailBasePath === "/sale/leads"}
            defaultValues={emptyLeadForm}
            options={{
              sources: actionOptionsQuery.data?.sources ?? [],
              stages: actionOptionsQuery.data?.stages ?? [],
              telesales: actionOptionsQuery.data?.telesales ?? [],
              institutionPrograms:
                actionOptionsQuery.data?.institutionPrograms ?? [],
              majors: actionOptionsQuery.data?.majors ?? [],
              admissionStatuses:
                actionOptionsQuery.data?.admissionStatuses ?? [],
              tags: actionOptionsQuery.data?.tags ?? [],
              systemFieldRequirements: actionOptionsQuery.data
                ?.systemFieldRequirements ?? {
                fullName: true,
                phone: true,
                sourceId: true,
              },
            }}
            submitLabel="Lưu ứng viên"
            isPending={createMutation.isPending}
            dialogLayout
            onSubmit={(values) => createMutation.mutate(values)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
