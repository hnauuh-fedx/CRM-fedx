import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import {
  Check,
  Clipboard,
  Eye,
  FileJson,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { ApiError } from "@/services/api";
import type {
  WebhookDetail,
  WebhookField,
  WebhookInput,
  WebhookLog,
  WebhookLogDetail,
  WebhookRequestStatus,
  WebhookSummary,
} from "../webhook.types";
import {
  createWebhook,
  deleteWebhook,
  getAbsoluteWebhookUrl,
  getWebhook,
  getWebhookLog,
  getWebhookLogs,
  getWebhookMetadata,
  getWebhooks,
  regenerateWebhookSecret,
  reprocessWebhookRequest,
  testWebhook,
  updateWebhook,
  updateWebhookStatus,
} from "@/services/webhook.service";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});
const defaultMappings = [
  {
    incomingKey: "name",
    crmField: "fullName",
    isRequired: true,
    defaultValue: null,
  },
  {
    incomingKey: "phone",
    crmField: "phone",
    isRequired: true,
    defaultValue: null,
  },
  {
    incomingKey: "email",
    crmField: "email",
    isRequired: false,
    defaultValue: null,
  },
  {
    incomingKey: "form_name",
    crmField: "source",
    isRequired: true,
    defaultValue: null,
  },
  {
    incomingKey: "utm_url",
    crmField: "sourceGroupUrl",
    isRequired: true,
    defaultValue: null,
  },
];
const emptyWebhook: WebhookInput = {
  name: "",
  targetModule: "LEAD",
  status: "ACTIVE",
  duplicatePolicy: "UPDATE_EXISTING",
  mappings: defaultMappings,
};
const samplePayload = JSON.stringify(
  {
    name: "Test Customer",
    phone: "0901234567",
    email: "test@example.com",
    form_name: "Form Facebook",
    utm_url: "https://landing.example.vn/dang-ky?utm_source=facebook",
  },
  null,
  2,
);

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "Chưa bao giờ";
}

const duplicatePolicyLabels = {
  CREATE_NEW: "Gộp vào Lead hiện có",
  UPDATE_EXISTING: "Cập nhật Lead hiện có",
  REJECT: "Từ chối nếu trùng",
} as const;

const webhookActionLabels = {
  CREATED: "Đã tạo",
  UPDATED: "Đã cập nhật",
  REJECTED: "Từ chối do trùng",
  FAILED: "Thất bại",
} as const;

const webhookRequestStatusLabels: Record<WebhookRequestStatus, string> = {
  RECEIVED: "Đã nhận",
  QUEUED: "Đang chờ",
  PROCESSING: "Đang xử lý",
  RETRYING: "Đang thử lại",
  SUCCEEDED: "Thành công",
  FAILED: "Thất bại",
  DEAD_LETTER: "Cần xử lý thủ công",
  QUEUE_FAILED: "Lỗi hàng đợi",
};

function webhookStatusVariant(status: WebhookRequestStatus) {
  if (status === "SUCCEEDED") return "default" as const;
  if (["FAILED", "DEAD_LETTER", "QUEUE_FAILED"].includes(status)) return "destructive" as const;
  if (["PROCESSING", "RETRYING"].includes(status)) return "secondary" as const;
  return "outline" as const;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Không thể thực hiện thao tác.";
}

function duplicateRecordFromError(error: unknown) {
  if (
    !(error instanceof ApiError) ||
    !error.details ||
    typeof error.details !== "object"
  )
    return null;
  const detail = error.details as {
    error?: { code?: string; duplicate_record_id?: string };
  };
  return detail.error?.code === "DUPLICATE_RECORD"
    ? (detail.error.duplicate_record_id ?? null)
    : null;
}

export function WebhooksPage() {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const queryClient = useQueryClient();
  const canManage = auth.can("webhook.manage");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [logStatus, setLogStatus] = useState<"ALL" | WebhookRequestStatus>("ALL");
  const [logRequestId, setLogRequestId] = useState("");
  const [logFrom, setLogFrom] = useState("");
  const [logTo, setLogTo] = useState("");
  const [editor, setEditor] = useState<
    { mode: "create" } | { mode: "edit"; webhook: WebhookDetail } | null
  >(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    type: "delete" | "regenerate";
    webhook: WebhookSummary;
  } | null>(null);
  const [selectedLog, setSelectedLog] = useState<WebhookLogDetail | null>(null);
  const [reprocessTarget, setReprocessTarget] = useState<WebhookLogDetail | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testJson, setTestJson] = useState(samplePayload);
  const [testValidation, setTestValidation] = useState("");

  const listQuery = useQuery({
    queryKey: ["webhooks", page],
    queryFn: () => getWebhooks(page, auth.accessToken!),
  });
  const metadataQuery = useQuery({
    queryKey: ["webhooks", "metadata", selectedProgramId],
    queryFn: () => getWebhookMetadata(auth.accessToken!),
    enabled: Boolean(selectedProgramId && auth.accessToken),
  });
  const detailQuery = useQuery({
    queryKey: ["webhooks", selectedId],
    queryFn: () => getWebhook(selectedId!, auth.accessToken!),
    enabled: Boolean(selectedId),
  });
  const logsQuery = useQuery({
    queryKey: ["webhooks", selectedId, "logs", logPage, logStatus, logRequestId, logFrom, logTo],
    queryFn: () => getWebhookLogs(selectedId!, logPage, auth.accessToken!, {
      ...(logStatus !== "ALL" ? { status: logStatus } : {}),
      ...(logRequestId.trim() ? { requestId: logRequestId.trim() } : {}),
      ...(logFrom ? { from: new Date(`${logFrom}T00:00:00`).toISOString() } : {}),
      ...(logTo ? { to: new Date(`${logTo}T23:59:59.999`).toISOString() } : {}),
    }),
    enabled: Boolean(selectedId),
  });

  const refresh = async (id?: string) => {
    setEditor(null);
    await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    if (id) setSelectedId(id);
  };
  const saveMutation = useMutation({
    mutationFn: (input: WebhookInput) =>
      editor?.mode === "edit"
        ? updateWebhook(editor.webhook.id, input, auth.accessToken!)
        : createWebhook(input, auth.accessToken!),
    onSuccess: (result) => {
      if ("secret" in result && typeof result.secret === "string") setSecret(result.secret);
      void refresh(result.id);
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "ACTIVE" | "DISABLED";
    }) => updateWebhookStatus(id, status, auth.accessToken!),
    onSuccess: (result) => void refresh(result.id),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWebhook(id, auth.accessToken!),
    onSuccess: () => {
      setConfirm(null);
      setSelectedId(null);
      void refresh();
    },
  });
  const regenerateMutation = useMutation({
    mutationFn: (id: string) => regenerateWebhookSecret(id, auth.accessToken!),
    onSuccess: (result, id) => {
      setConfirm(null);
      setSecret(result.secret);
      void refresh(id);
    },
  });
  const logMutation = useMutation({
    mutationFn: ({ webhookId, logId }: { webhookId: string; logId: string }) =>
      getWebhookLog(webhookId, logId, auth.accessToken!),
    onSuccess: setSelectedLog,
  });
  const testMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      testWebhook(selectedId!, payload, auth.accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["webhooks", selectedId, "logs"],
      });
    },
  });
  const reprocessMutation = useMutation({
    mutationFn: (log: WebhookLogDetail) => reprocessWebhookRequest(selectedId!, log.id, auth.accessToken!),
    onSuccess: () => {
      setReprocessTarget(null);
      setSelectedLog(null);
      void queryClient.invalidateQueries({ queryKey: ["webhooks", selectedId, "logs"] });
    },
  });

  const items = listQuery.data?.data ?? [];
  const detail = detailQuery.data;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Cài đặt · Tích hợp"
        title="Inbound Webhooks"
        description="Nhận dữ liệu JSON từ website hoặc ứng dụng bên ngoài và tạo Lead trong đúng chương trình đang làm việc."
      />
      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="flex-row items-start justify-between gap-4 border-b py-5">
          <div className="flex flex-col gap-1">
            <CardTitle>Danh sách webhook</CardTitle>
            <CardDescription>
              Secret chỉ hiển thị một lần khi tạo hoặc cấp lại.
            </CardDescription>
          </div>
          {canManage && (
            <Button
              type="button"
              onClick={() => {
                saveMutation.reset();
                void metadataQuery.refetch();
                setEditor({ mode: "create" });
              }}
            >
              <Plus aria-hidden="true" />
              Webhook mới
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isError ? (
            <ErrorState
              title="Không thể tải webhook"
              description="Vui lòng thử tải lại danh sách."
              onReload={() => listQuery.refetch()}
            />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải webhook" />
          ) : items.length === 0 ? (
            <EmptyState
              title="Chưa có webhook"
              description="Tạo webhook đầu tiên để nhận lead từ hệ thống bên ngoài."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-5">Tên</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Lần nhận cuối</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="px-5 font-medium">
                        {item.name}
                      </TableCell>
                      <TableCell>Lead</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "ACTIVE" ? "default" : "outline"
                          }
                        >
                          {item.status === "ACTIVE" ? "Đang bật" : "Đã tắt"}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(item.lastReceivedAt)}</TableCell>
                      <TableCell>{formatDate(item.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedId(item.id);
                              setLogPage(1);
                              setLogStatus("ALL");
                              setLogRequestId("");
                              setLogFrom("");
                              setLogTo("");
                            }}
                          >
                            <Eye aria-hidden="true" />
                            Chi tiết
                          </Button>
                          {canManage && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={statusMutation.isPending}
                              onClick={() =>
                                statusMutation.mutate({
                                  id: item.id,
                                  status:
                                    item.status === "ACTIVE"
                                      ? "DISABLED"
                                      : "ACTIVE",
                                })
                              }
                            >
                              <Power aria-hidden="true" />
                              {item.status === "ACTIVE" ? "Tắt" : "Bật"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {listQuery.data && listQuery.data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
              <p className="text-sm text-muted-foreground">
                Trang {page}/{listQuery.data.pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Trước
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page >= listQuery.data.pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Sau
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedId &&
        (detailQuery.isLoading ? (
          <TableLoadingState label="Đang tải cấu hình webhook" />
        ) : detailQuery.isError || !detail ? (
          <ErrorState
            title="Không thể tải chi tiết webhook"
            description="Webhook có thể đã bị xóa hoặc nằm ngoài chương trình hiện tại."
            onReload={() => detailQuery.refetch()}
          />
        ) : (
          <WebhookDetails
            webhook={detail}
            canManage={canManage}
            logs={logsQuery.data?.data ?? []}
            logsLoading={logsQuery.isLoading}
            logsError={logsQuery.isError}
            logPage={logPage}
            logTotalPages={logsQuery.data?.pagination.totalPages ?? 1}
            logStatus={logStatus}
            logRequestId={logRequestId}
            logFrom={logFrom}
            logTo={logTo}
            onLogStatus={(value) => { setLogStatus(value); setLogPage(1); }}
            onLogRequestId={(value) => { setLogRequestId(value); setLogPage(1); }}
            onLogFrom={(value) => { setLogFrom(value); setLogPage(1); }}
            onLogTo={(value) => { setLogTo(value); setLogPage(1); }}
            onLogPage={setLogPage}
            onReloadLogs={() => void logsQuery.refetch()}
            onEdit={() => {
              void metadataQuery.refetch();
              setEditor({ mode: "edit", webhook: detail });
            }}
            onTest={() => {
              testMutation.reset();
              setTestValidation("");
              setTestOpen(true);
            }}
            onRegenerate={() =>
              setConfirm({ type: "regenerate", webhook: detail })
            }
            onDelete={() => setConfirm({ type: "delete", webhook: detail })}
            onLog={(logId) =>
              logMutation.mutate({ webhookId: detail.id, logId })
            }
          />
        ))}

      <Dialog
        open={Boolean(editor)}
        onOpenChange={(open) => !open && setEditor(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editor?.mode === "edit"
                ? "Cập nhật webhook"
                : "Tạo inbound webhook"}
            </DialogTitle>
            <DialogDescription>
              Mapping chỉ cho phép các trường Lead trong danh sách an toàn. Test
              webhook sẽ tạo Lead thật.
            </DialogDescription>
          </DialogHeader>
          {editor && metadataQuery.isError && !metadataQuery.data ? (
            <ErrorState
              title="Không thể tải danh sách trường CRM"
              description="Vui lòng tải lại metadata trước khi cấu hình mapping."
              onReload={() => metadataQuery.refetch()}
            />
          ) : editor && metadataQuery.isLoading ? (
            <TableLoadingState label="Đang tải danh sách trường CRM" />
          ) : editor && metadataQuery.data ? (
            <WebhookForm
              key={editor.mode === "edit" ? editor.webhook.id : "new"}
              initialValue={
                editor.mode === "edit"
                  ? {
                      name: editor.webhook.name,
                      targetModule: "LEAD",
                      status: editor.webhook.status,
                      duplicatePolicy: editor.webhook.duplicatePolicy,
                      mappings: editor.webhook.mappings.map(
                        ({
                          incomingKey,
                          crmField,
                          isRequired,
                          defaultValue,
                        }) => ({
                          incomingKey,
                          crmField,
                          isRequired,
                          defaultValue,
                        }),
                      ),
                    }
                  : emptyWebhook
              }
              fields={metadataQuery.data.fields}
              canViewCustomFields={auth.can("custom_field.view")}
              onRefreshFields={() => void metadataQuery.refetch()}
              refreshingFields={metadataQuery.isFetching}
              refreshFieldsError={metadataQuery.isError}
              pending={saveMutation.isPending}
              error={saveMutation.error}
              onSubmit={(value) => saveMutation.mutate(value)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      <ConfirmDialog
        state={confirm}
        pending={deleteMutation.isPending || regenerateMutation.isPending}
        error={deleteMutation.error ?? regenerateMutation.error}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          confirm?.type === "delete"
            ? deleteMutation.mutate(confirm.webhook.id)
            : confirm && regenerateMutation.mutate(confirm.webhook.id)
        }
      />
      <LogDialog
        log={selectedLog}
        canReprocess={canManage && Boolean(selectedLog && ["FAILED", "DEAD_LETTER", "QUEUE_FAILED"].includes(selectedLog.status))}
        onReprocess={() => selectedLog && setReprocessTarget(selectedLog)}
        onClose={() => setSelectedLog(null)}
      />
      <ReprocessDialog
        log={reprocessTarget}
        pending={reprocessMutation.isPending}
        error={reprocessMutation.error}
        onClose={() => setReprocessTarget(null)}
        onConfirm={() => reprocessTarget && reprocessMutation.mutate(reprocessTarget)}
      />
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Test webhook</DialogTitle>
            <DialogDescription>
              Payload này chạy cùng pipeline production và áp dụng chính sách dữ
              liệu trùng thật.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(testValidation)}>
            <FieldLabel htmlFor="test-payload">Payload JSON</FieldLabel>
            <Textarea
              id="test-payload"
              className="min-h-64 font-mono"
              value={testJson}
              aria-invalid={Boolean(testValidation)}
              onChange={(event) => setTestJson(event.target.value)}
            />
            <FieldError>{testValidation}</FieldError>
          </Field>
          {testMutation.isError &&
          duplicateRecordFromError(testMutation.error) ? (
            <Alert variant="destructive">
              <FileJson aria-hidden="true" />
              <AlertTitle>Test bị từ chối</AlertTitle>
              <AlertDescription>
                Đã tồn tại Lead trùng:{" "}
                {duplicateRecordFromError(testMutation.error)}
              </AlertDescription>
            </Alert>
          ) : testMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(testMutation.error)}
            </p>
          ) : null}
          {testMutation.data && (
            <Alert>
              <Check aria-hidden="true" />
              <AlertTitle>Test thành công</AlertTitle>
              <AlertDescription>
                Lead đã được{" "}
                {testMutation.data.data.action === "updated"
                  ? "cập nhật"
                  : "tạo"}
                {testMutation.data.data.record_id
                  ? `: ${testMutation.data.data.record_id}`
                  : "."}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter showCloseButton>
            <Button
              type="button"
              disabled={testMutation.isPending}
              onClick={() => {
                try {
                  const parsed = JSON.parse(testJson);
                  if (
                    !parsed ||
                    Array.isArray(parsed) ||
                    typeof parsed !== "object"
                  )
                    throw new Error();
                  setTestValidation("");
                  testMutation.mutate(parsed);
                } catch {
                  setTestValidation("Payload phải là JSON object hợp lệ.");
                }
              }}
            >
              <Send aria-hidden="true" />
              {testMutation.isPending ? "Đang gửi..." : "Gửi test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WebhookDetails({
  webhook,
  canManage,
  logs,
  logsLoading,
  logsError,
  logPage,
  logTotalPages,
  logStatus,
  logRequestId,
  logFrom,
  logTo,
  onLogStatus,
  onLogRequestId,
  onLogFrom,
  onLogTo,
  onLogPage,
  onReloadLogs,
  onEdit,
  onTest,
  onRegenerate,
  onDelete,
  onLog,
}: {
  webhook: WebhookDetail;
  canManage: boolean;
  logs: WebhookLog[];
  logsLoading: boolean;
  logsError: boolean;
  logPage: number;
  logTotalPages: number;
  logStatus: "ALL" | WebhookRequestStatus;
  logRequestId: string;
  logFrom: string;
  logTo: string;
  onLogStatus: (status: "ALL" | WebhookRequestStatus) => void;
  onLogRequestId: (value: string) => void;
  onLogFrom: (value: string) => void;
  onLogTo: (value: string) => void;
  onLogPage: (page: number) => void;
  onReloadLogs: () => void;
  onEdit: () => void;
  onTest: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  onLog: (id: string) => void;
}) {
  const url = getAbsoluteWebhookUrl(webhook.webhookUrl);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="border-border/70 shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook aria-hidden="true" />
            {webhook.name}
          </CardTitle>
          <CardDescription>
            Gửi POST JSON kèm header X-Webhook-Secret.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field>
            <FieldLabel>Webhook URL</FieldLabel>
            <div className="flex gap-2">
              <Input readOnly value={url} className="font-mono" />
              <CopyButton value={url} label="Sao chép URL" />
            </div>
          </Field>
          <FieldSet>
            <FieldLegend>Field mapping</FieldLegend>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Incoming key</TableHead>
                    <TableHead>Trường CRM</TableHead>
                    <TableHead>Bắt buộc</TableHead>
                    <TableHead>Mặc định</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhook.mappings.map((mapping) => (
                    <TableRow key={mapping.id ?? mapping.incomingKey}>
                      <TableCell className="font-mono">
                        {mapping.incomingKey}
                      </TableCell>
                      <TableCell>{mapping.crmField}</TableCell>
                      <TableCell>
                        {mapping.isRequired ? "Có" : "Không"}
                      </TableCell>
                      <TableCell>{mapping.defaultValue || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </FieldSet>
          <Field>
            <FieldLabel>Xử lý dữ liệu trùng</FieldLabel>
            <p className="text-sm font-medium">
              {duplicatePolicyLabels[webhook.duplicatePolicy]}
            </p>
            <FieldDescription>
              Fedx kiểm tra Lead trùng theo số điện thoại trong chương trình
              này.
            </FieldDescription>
          </Field>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onEdit}>
                <Pencil aria-hidden="true" />
                Chỉnh sửa
              </Button>
              <Button type="button" variant="outline" onClick={onTest}>
                <Send aria-hidden="true" />
                Test webhook
              </Button>
              <Button type="button" variant="outline" onClick={onRegenerate}>
                <RefreshCw aria-hidden="true" />
                Cấp lại secret
              </Button>
              <Button type="button" variant="destructive" onClick={onDelete}>
                <Trash2 aria-hidden="true" />
                Xóa
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="border-b py-5">
          <CardTitle>Nhật ký request</CardTitle>
          <CardDescription>
            Payload đã được che các khóa nhạy cảm trước khi lưu.
          </CardDescription>
          <div className="grid gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-4">
            <Field>
              <FieldLabel>Trạng thái</FieldLabel>
              <Select value={logStatus} onValueChange={(value) => onLogStatus(value as "ALL" | WebhookRequestStatus)}>
                <SelectTrigger className="w-full" aria-label="Lọc trạng thái request"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="ALL">Tất cả</SelectItem>
                    {Object.entries(webhookRequestStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="webhook-request-id-filter">Request ID</FieldLabel>
              <Input id="webhook-request-id-filter" defaultValue={logRequestId} onBlur={(event) => onLogRequestId(event.target.value)} placeholder="UUID request" />
            </Field>
            <Field>
              <FieldLabel htmlFor="webhook-log-from">Từ ngày</FieldLabel>
              <Input id="webhook-log-from" type="date" value={logFrom} onChange={(event) => onLogFrom(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="webhook-log-to">Đến ngày</FieldLabel>
              <Input id="webhook-log-to" type="date" value={logTo} onChange={(event) => onLogTo(event.target.value)} />
            </Field>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logsError ? (
            <ErrorState
              title="Không thể tải nhật ký webhook"
              description="Vui lòng thử tải lại danh sách request."
              onReload={onReloadLogs}
            />
          ) : logsLoading ? (
            <TableLoadingState label="Đang tải nhật ký webhook" />
          ) : logs.length === 0 ? (
            <EmptyState
              title="Chưa nhận request"
              description="Last received: Chưa bao giờ."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-5">Thời gian</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Hành động</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>HTTP</TableHead>
                      <TableHead>Lần thử</TableHead>
                      <TableHead>Xử lý</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="px-5">
                          {formatDate(log.receivedAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              webhookStatusVariant(log.status as WebhookRequestStatus)
                            }
                          >
                            {webhookRequestStatusLabels[log.status as WebhookRequestStatus] ?? log.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {webhookActionLabels[
                              log.action as keyof typeof webhookActionLabels
                            ] ?? "Thất bại"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.recordId ?? "—"}
                        </TableCell>
                        <TableCell>{log.responseCode}</TableCell>
                        <TableCell>{log.attemptCount}/{log.maxAttempts}</TableCell>
                        <TableCell>{log.processingTimeMs} ms</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onLog(log.id)}
                          >
                            Xem JSON
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {logTotalPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
                  <p className="text-sm text-muted-foreground">
                    Trang {logPage}/{logTotalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={logPage === 1}
                      onClick={() => onLogPage(logPage - 1)}
                    >
                      Trước
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={logPage >= logTotalPages}
                      onClick={() => onLogPage(logPage + 1)}
                    >
                      Sau
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WebhookForm({
  initialValue,
  fields,
  canViewCustomFields,
  onRefreshFields,
  refreshingFields,
  refreshFieldsError,
  pending,
  error,
  onSubmit,
}: {
  initialValue: WebhookInput;
  fields: WebhookField[];
  canViewCustomFields: boolean;
  onRefreshFields: () => void;
  refreshingFields: boolean;
  refreshFieldsError: boolean;
  pending: boolean;
  error: Error | null;
  onSubmit: (value: WebhookInput) => void;
}) {
  const form = useForm<WebhookInput>({ defaultValues: initialValue });
  const mappings = useFieldArray({ control: form.control, name: "mappings" });
  const standardFields = fields.filter((field) => field.group === "STANDARD");
  const customFields = fields.filter((field) => field.group === "CUSTOM");
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="webhook-name">Tên webhook *</FieldLabel>
          <Input
            id="webhook-name"
            {...form.register("name", {
              required: "Vui lòng nhập tên webhook.",
              minLength: { value: 2, message: "Tên cần ít nhất 2 ký tự." },
            })}
            aria-invalid={Boolean(form.formState.errors.name)}
          />
          <FieldError>{form.formState.errors.name?.message}</FieldError>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Module đích</FieldLabel>
            <Input readOnly value="Lead" />
          </Field>
          <Field>
            <FieldLabel>Trạng thái</FieldLabel>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    className="w-full"
                    aria-label="Trạng thái webhook"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="ACTIVE">Đang bật</SelectItem>
                      <SelectItem value="DISABLED">Đã tắt</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel>Xử lý dữ liệu trùng</FieldLabel>
          <Controller
            control={form.control}
            name="duplicatePolicy"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  className="w-full"
                  aria-label="Chính sách xử lý Lead trùng"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="UPDATE_EXISTING">
                      Gộp nguồn và cập nhật Lead hiện có
                    </SelectItem>
                    <SelectItem value="REJECT">Từ chối nếu trùng</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          />
          <FieldDescription>
            Khi trùng số điện thoại, hệ thống giữ một Lead và thêm lần phát sinh nguồn mới.
            {form.watch("duplicatePolicy") === "UPDATE_EXISTING"
              ? " Các trường có trong request sẽ cập nhật Lead hiện có; trường không được gửi sẽ được giữ nguyên."
              : ""}
          </FieldDescription>
        </Field>
      </FieldGroup>
      <FieldSet>
        <div className="flex items-center justify-between gap-4">
          <div>
            <FieldLegend>Field mapping</FieldLegend>
            <FieldDescription>
              Default được áp dụng trước khi kiểm tra bắt buộc.
            </FieldDescription>
            {customFields.length === 0 && (
              <FieldDescription>
                Chương trình này chưa có trường Lead tùy chỉnh đang dùng. Tạo trường ở trang cấu hình rồi tải lại danh sách.
              </FieldDescription>
            )}
            {refreshFieldsError && (
              <FieldDescription role="alert">
                Chưa thể tải lại danh sách trường. Vui lòng thử lại.
              </FieldDescription>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canViewCustomFields && (
              <Button type="button" variant="outline" size="sm" asChild>
                <a href="/sale/cau-hinh-truong?form=lead" target="_blank" rel="noopener noreferrer">
                  Quản lý trường Lead
                </a>
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onRefreshFields} disabled={refreshingFields}>
              <RefreshCw aria-hidden="true" data-icon="inline-start" />
              {refreshingFields ? "Đang tải trường..." : "Tải lại trường"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                mappings.append({
                  incomingKey: "",
                  crmField: fields[0]?.key ?? "fullName",
                  isRequired: false,
                  defaultValue: null,
                })
              }
            >
              <Plus aria-hidden="true" data-icon="inline-start" />
              Thêm mapping
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {mappings.fields.map((mapping, index) => (
            <div
              key={mapping.id}
              className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_1fr_9rem_1fr_auto]"
            >
              <Field
                data-invalid={Boolean(
                  form.formState.errors.mappings?.[index]?.incomingKey,
                )}
              >
                <FieldLabel htmlFor={`incoming-${index}`}>
                  Incoming key *
                </FieldLabel>
                <Input
                  id={`incoming-${index}`}
                  {...form.register(`mappings.${index}.incomingKey`, {
                    required: "Bắt buộc",
                  })}
                  aria-invalid={Boolean(
                    form.formState.errors.mappings?.[index]?.incomingKey,
                  )}
                />
                <FieldError>
                  {
                    form.formState.errors.mappings?.[index]?.incomingKey
                      ?.message
                  }
                </FieldError>
              </Field>
              <Field>
                <FieldLabel>Trường CRM</FieldLabel>
                <Controller
                  control={form.control}
                  name={`mappings.${index}.crmField`}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        className="w-full"
                        aria-label={`Trường CRM cho mapping ${index + 1}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Trường hệ thống</SelectLabel>
                          {standardFields.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                {option.label} · {option.type}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Trường tùy chỉnh ({customFields.length})</SelectLabel>
                          {customFields.length === 0 ? (
                            <p className="px-2 py-1.5 text-sm text-muted-foreground">
                              Chưa có trường Lead tùy chỉnh đang dùng.
                            </p>
                          ) : customFields.map((option) => (
                            <SelectItem key={option.key} value={option.key}>
                              {option.label} · {option.type}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel>Bắt buộc</FieldLabel>
                <Controller
                  control={form.control}
                  name={`mappings.${index}.isRequired`}
                  render={({ field }) => (
                    <label className="flex h-9 items-center gap-2">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                      />
                      Có
                    </label>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`default-${index}`}>
                  Giá trị mặc định
                </FieldLabel>
                <Input
                  id={`default-${index}`}
                  {...form.register(`mappings.${index}.defaultValue`)}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Xóa mapping ${index + 1}`}
                  disabled={mappings.fields.length === 1}
                  onClick={() => mappings.remove(index)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </FieldSet>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      )}
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : "Lưu webhook"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SecretDialog({
  secret,
  onClose,
}: {
  secret: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(secret)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lưu webhook secret</DialogTitle>
          <DialogDescription>
            Secret chỉ hiển thị lần này. Hãy sao chép và lưu ở nơi an toàn.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Secret</FieldLabel>
          <div className="flex gap-2">
            <Input readOnly value={secret ?? ""} className="font-mono" />
            <CopyButton value={secret ?? ""} label="Sao chép secret" />
          </div>
        </Field>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Tôi đã lưu secret
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  state,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  state: { type: "delete" | "regenerate"; webhook: WebhookSummary } | null;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state?.type === "delete" ? "Xóa webhook" : "Cấp lại secret"}
          </DialogTitle>
          <DialogDescription>
            {state?.type === "delete"
              ? "Webhook và toàn bộ nhật ký liên quan sẽ bị xóa vĩnh viễn."
              : "Secret hiện tại sẽ mất hiệu lực ngay lập tức."}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        )}
        <DialogFooter showCloseButton>
          <Button
            type="button"
            variant={state?.type === "delete" ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Đang xử lý..." : "Xác nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
      {copied ? "Đã chép" : "Sao chép"}
    </Button>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-4 text-xs leading-5">
      {value == null ? "—" : JSON.stringify(value, null, 2)}
    </pre>
  );
}
function LogDialog({
  log,
  canReprocess,
  onReprocess,
  onClose,
}: {
  log: WebhookLogDetail | null;
  canReprocess: boolean;
  onReprocess: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(log)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chi tiết request</DialogTitle>
          <DialogDescription>Request ID: {log?.requestId}</DialogDescription>
        </DialogHeader>
        {log && (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-5">
              <div>
                <p className="text-sm text-muted-foreground">Thời gian nhận</p>
                <p className="font-medium">{formatDate(log.receivedAt)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Trạng thái</p>
                <Badge variant={webhookStatusVariant(log.status)}>{webhookRequestStatusLabels[log.status]}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hành động</p>
                <p className="font-medium">{webhookActionLabels[log.action]}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">HTTP response</p>
                <p className="font-medium">{log.responseCode ?? "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Lead ID</p>
                <p className="break-all font-mono text-xs">
                  {log.recordId ?? "—"}
                </p>
              </div>
            </div>
            <FieldSet>
              <FieldLegend>Lịch sử xử lý</FieldLegend>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="font-medium">Đã nhận</p>
                    <p className="text-sm text-muted-foreground">{formatDate(log.receivedAt)}</p>
                  </div>
                  <Badge variant="outline">Request</Badge>
                </div>
                {log.attempts.map((attempt) => (
                  <div key={attempt.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">Lần thử {attempt.attemptNumber} · {attempt.status}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(attempt.startedAt)}{attempt.durationMs != null ? ` · ${attempt.durationMs} ms` : ""}
                      </p>
                      {attempt.errorMessage && <p className="text-sm text-destructive">{attempt.errorMessage}</p>}
                    </div>
                    {attempt.errorCategory && <Badge variant="outline">{attempt.errorCategory}</Badge>}
                  </div>
                ))}
              </div>
            </FieldSet>
            {log.duplicateRecordId && (
              <Field>
                <FieldLabel>Lead trùng được phát hiện</FieldLabel>
                <p className="break-all font-mono text-xs">
                  {log.duplicateRecordId}
                </p>
              </Field>
            )}
            <FieldSet>
              <FieldLegend>Payload</FieldLegend>
              <JsonBlock value={log.payload} />
            </FieldSet>
            <FieldSet>
              <FieldLegend>Mapped payload</FieldLegend>
              <JsonBlock value={log.mappedPayload} />
            </FieldSet>
            {log.errorCode && (
              <Alert variant="destructive">
                <FileJson aria-hidden="true" />
                <AlertTitle>{log.errorCode}</AlertTitle>
                <AlertDescription>{log.errorMessage}</AlertDescription>
              </Alert>
            )}
            {canReprocess && (
              <DialogFooter>
                <Button type="button" onClick={onReprocess}>
                  <RotateCcw data-icon="inline-start" aria-hidden="true" />
                  Xử lý lại
                </Button>
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReprocessDialog({
  log,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  log: WebhookLogDetail | null;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(log)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xử lý lại request</DialogTitle>
          <DialogDescription>
            Yêu cầu này sẽ được đưa trở lại hàng đợi. Payload gốc và cấu hình webhook hiện tại sẽ được sử dụng.
          </DialogDescription>
        </DialogHeader>
        {log && <p className="break-all font-mono text-sm">{log.requestId}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{errorMessage(error)}</p>}
        <DialogFooter showCloseButton>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            {pending ? "Đang đưa vào hàng đợi..." : "Xử lý lại"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
