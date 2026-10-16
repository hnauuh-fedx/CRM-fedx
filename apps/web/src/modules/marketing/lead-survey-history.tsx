import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { apiRequest } from "@/services/api";
import {
  describeMarketingFormAnswers,
  type MarketingFormSnapshot,
} from "@admission-crm/shared/marketing-form-snapshot";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  marketingFormQueryKey,
  marketingFormRequestOptions,
} from "./marketing-form-query-scope";

type HistoryResponse = {
  data: Array<{
    id: string;
    formName: string;
    answers: unknown;
    configurationSnapshot: MarketingFormSnapshot | null;
    source: string | null;
    createdAt: string | null;
    utm: {
      source: string | null;
      medium: string | null;
      campaign: string | null;
    };
  }>;
  pagination: { page: number; totalPages: number; total: number };
};
export function LeadSurveyHistory({ leadId }: { leadId: string }) {
  const { selectedProgramId } = useInstitutionProgram();
  return (
    <ProgramLeadSurveyHistory
      key={`${selectedProgramId}:${leadId}`}
      leadId={leadId}
      programId={selectedProgramId}
    />
  );
}
function ProgramLeadSurveyHistory({
  leadId,
  programId,
}: {
  leadId: string;
  programId: string | null;
}) {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: marketingFormQueryKey(programId, "lead-history", leadId, page),
    queryFn: ({ signal }) =>
      apiRequest<HistoryResponse>(
        `/forms/lead-history/${leadId}?page=${page}&limit=20`,
        marketingFormRequestOptions(programId!, signal),
        auth.accessToken!,
      ),
    enabled: Boolean(programId && auth.accessToken),
  });
  if (!programId)
    return (
      <EmptyState
        title="Chưa chọn chương trình"
        description="Chọn chương trình để xem lịch sử khảo sát."
      />
    );
  if (query.isLoading)
    return <TableLoadingState label="Đang tải lịch sử khảo sát" />;
  if (query.isError)
    return (
      <ErrorState
        title="Không thể xem lịch sử khảo sát"
        description="Cần quyền xem phản hồi, thông tin Lead và phạm vi phù hợp."
        onReload={() => query.refetch()}
      />
    );
  const rows = query.data?.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {!rows.length && (
        <EmptyState
          title="Chưa có khảo sát được liên kết"
          description="Khảo sát chỉ lưu câu trả lời không tự liên kết vào Lead bằng số điện thoại."
        />
      )}
      <ol className="flex flex-col gap-4">
        {rows.map((row) => (
          <li key={row.id} className="min-w-0 rounded-lg border p-4">
            <h3 className="font-medium">
              {row.configurationSnapshot?.formName ?? row.formName}
            </h3>
            <p className="text-xs text-muted-foreground">
              {row.createdAt
                ? displayDateFormatter.format(new Date(row.createdAt))
                : "Không rõ thời gian"}{" "}
              ·{" "}
              {row.source === "public_form"
                ? "Form công khai"
                : row.source === "webhook"
                  ? "Webhook"
                  : "Không rõ nguồn"}
            </p>
            {!row.configurationSnapshot && (
              <p className="mt-2 text-xs text-muted-foreground">
                Phản hồi cũ — không có snapshot; hiển thị mã câu hỏi/giá trị
                gốc.
              </p>
            )}
            <dl className="mt-3 flex flex-col gap-2 break-words">
              {describeMarketingFormAnswers(
                row.answers,
                row.configurationSnapshot,
              ).map((answer) => (
                <div key={answer.fieldKey}>
                  <dt className="font-medium">{answer.label}</dt>
                  <dd>{answer.answer}</dd>
                </div>
              ))}
            </dl>
            {(row.utm.source || row.utm.medium || row.utm.campaign) && (
              <p className="mt-3 text-xs text-muted-foreground">
                UTM:{" "}
                {[row.utm.source, row.utm.medium, row.utm.campaign]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ol>
      {query.data && query.data.pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>
            Trang {page}/{query.data.pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((value) => value - 1)}
            >
              Trang trước
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                page >= query.data.pagination.totalPages || query.isFetching
              }
              onClick={() => setPage((value) => value + 1)}
            >
              Trang sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const displayDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});
