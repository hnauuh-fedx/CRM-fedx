import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { canAccessReleases, deploymentRequestSchema, type Deployment, type DeploymentRequest, type Release, type ReleaseEnvironment } from "@admission-crm/shared/releases";
import { PageHeader } from "@/components/shared/page-header";
import { ServerDataTable } from "@/components/shared/server-data-table";
import { TablePagination } from "@/components/shared/table-pagination";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import { getDeploymentEvents, getReleaseOverview, listDeployments, listReleases, requestDeployment } from "@/services/release.service";

const environmentLabel = { staging: "Kiểm thử", production: "Vận hành chính thức" };
const statusLabel = { QUEUED: "Đang chờ", RUNNING: "Đang triển khai", SUCCEEDED: "Thành công", FAILED: "Thất bại", NEEDS_REVIEW: "Cần kiểm tra" };
const date = (value: string) => new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

export function ReleasesPage() {
  const { accessToken, user } = useAuth();
  if (!accessToken || !user) return null;
  if (!canAccessReleases(user, "view")) return <EmptyState title="Không có quyền quản lý phiên bản" description="Tính năng yêu cầu quyền xem phiên bản và phạm vi toàn hệ thống." />;
  return <ReleaseWorkspace key={`${user.id}:${user.workingInstitutionProgramId}`} token={accessToken} canDeploy={canAccessReleases(user, "deploy")} />;
}

function ReleaseWorkspace({ token, canDeploy }: { token: string; canDeploy: boolean }) {
  const client = useQueryClient();
  const [environment, setEnvironment] = useState<ReleaseEnvironment>("staging");
  const [action, setAction] = useState<(DeploymentRequest & { version: string }) | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const overview = useQuery({ queryKey: ["releases", "overview"], queryFn: () => getReleaseOverview(token), refetchInterval: 5000 });
  const enabled = overview.data?.configured === true && !overview.isError;
  const deploy = useMutation({ mutationFn: (input: DeploymentRequest) => requestDeployment(token, deploymentRequestSchema.parse(input)),
    onSuccess: () => { setAction(null); void client.invalidateQueries({ queryKey: ["releases"] }); } });
  const choose = (release: Release, operation: "deploy" | "rollback") => {
    deploy.reset(); setAction({ releaseId: release.id, version: release.version, environment, operation, requestId: crypto.randomUUID(), reason: "" });
  };
  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Hệ thống" title="Phiên bản" scopeLabel="Toàn hệ thống" description="Chọn bản phát hành đã kiểm tra và theo dõi lịch sử triển khai." actions={<Button variant="outline" onClick={() => void client.invalidateQueries({ queryKey: ["releases"] })}>Tải lại</Button>} />
    {overview.isPending && <Skeleton className="h-32 w-full" />}
    {overview.isError && <ErrorState title="Không thể kết nối dịch vụ triển khai" description="Trạng thái phiên bản chưa được xác nhận. Thử tải lại hoặc liên hệ người vận hành." onReload={() => void overview.refetch()} />}
    {overview.data?.configured === false && <Alert><AlertTitle>Chưa kết nối dịch vụ triển khai</AlertTitle><AlertDescription>Người vận hành cần cấu hình dịch vụ triển khai trước khi đăng ký và chọn phiên bản.</AlertDescription></Alert>}
    {enabled && <>
      <EnvironmentCards environments={overview.data!.environments} />
      <ReleaseCatalog token={token} canDeploy={canDeploy} environment={environment} setEnvironment={setEnvironment} state={overview.data!.environments.find(item => item.name === environment)} choose={choose} />
      <DeploymentHistory token={token} onEvents={setEventId} />
    </>}
    {action && <DeploymentDialog key={action.requestId} action={action} pending={deploy.isPending} error={deploy.error?.message} onClose={() => { if (!deploy.isPending) setAction(null); }} onSubmit={input => deploy.mutate(input)} />}
    {eventId && <DeploymentEvents key={eventId} token={token} id={eventId} onClose={() => setEventId(null)} />}
  </div>;
}

type EnvironmentState = import("@admission-crm/shared/releases").EnvironmentState;
function EnvironmentCards({ environments }: { environments: EnvironmentState[] }) {
  return <div className="grid gap-4 md:grid-cols-2">{environments.map(item => <Card key={item.name}><CardHeader><CardTitle>{environmentLabel[item.name]}</CardTitle><CardDescription>{item.blocked ? "Trạng thái thực tế cần được kiểm tra; tạm khóa triển khai." : item.activeDeploymentId ? "Đang có yêu cầu triển khai. Trang tự cập nhật kết quả." : "Sẵn sàng nhận yêu cầu triển khai."}</CardDescription></CardHeader><CardContent><p>{item.blocked ? "Bản xác nhận gần nhất: " : "Phiên bản: "}<strong>{item.version ?? "Chưa triển khai"}</strong></p></CardContent></Card>)}</div>;
}

function ReleaseActions({ release, state, canDeploy, choose }: { release: Release; state?: EnvironmentState; canDeploy: boolean; choose: (release: Release, operation: "deploy" | "rollback") => void }) {
  const incompatible = state?.schemaGeneration !== release.schemaGeneration;
  const disabled = !state || state.blocked || Boolean(state.activeDeploymentId) || state.currentReleaseId === release.id || incompatible;
  return <div className="flex flex-col items-start gap-2"><Badge variant="secondary">Build đã kiểm tra</Badge>
    {state?.currentReleaseId === release.id && !state.blocked && <Badge>Đang sử dụng</Badge>}
    {incompatible && <span className="text-xs text-muted-foreground">Cần migration riêng</span>}
    {canDeploy && <div className="flex flex-wrap gap-2"><Button size="sm" disabled={disabled} onClick={() => choose(release, "deploy")}>Triển khai</Button><Button size="sm" variant="outline" disabled={disabled} onClick={() => choose(release, "rollback")}>Quay về bản này</Button></div>}
  </div>;
}

function ReleaseCatalog({ token, canDeploy, environment, setEnvironment, state, choose }: { token: string; canDeploy: boolean; environment: ReleaseEnvironment; setEnvironment: (value: ReleaseEnvironment) => void; state?: EnvironmentState; choose: (release: Release, operation: "deploy" | "rollback") => void }) {
  const [filters, setFilters] = useState({ page: 1, search: "" });
  const releases = useQuery({ queryKey: ["releases", "list", filters], queryFn: () => listReleases(token, filters.page, filters.search), refetchInterval: 15000 });
  const columns: ColumnDef<Release>[] = [
    { accessorKey: "version", header: "Phiên bản", cell: ({ row }) => <div className="flex flex-col gap-1"><strong>{row.original.version}</strong><code className="text-xs text-muted-foreground">{row.original.commit.slice(0, 12)}</code></div> },
    { accessorKey: "notes", header: "Thay đổi", cell: ({ row }) => <p className="max-w-md whitespace-pre-wrap break-words">{row.original.notes || "Chưa có mô tả."}</p> },
    { accessorKey: "createdAt", header: "Ngày tạo", cell: ({ row }) => date(row.original.createdAt) },
    { id: "actions", header: "Thao tác", cell: ({ row }) => <ReleaseActions release={row.original} state={state} canDeploy={canDeploy} choose={choose} /> },
  ];
  return <Card><CardHeader><CardTitle>Bản phát hành</CardTitle><CardDescription>Kiểm thử tại staging trước khi đưa vào vận hành. Quay về chỉ áp dụng cho bản từng chạy thành công và tương thích dữ liệu.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    <FieldGroup className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="release-search">Tìm phiên bản hoặc commit</FieldLabel><Input id="release-search" maxLength={100} value={filters.search} onChange={event => setFilters({ page: 1, search: event.target.value })} /></Field><Field><FieldLabel htmlFor="release-environment">Môi trường triển khai</FieldLabel><Select value={environment} onValueChange={value => setEnvironment(value as ReleaseEnvironment)}><SelectTrigger id="release-environment"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="staging">Kiểm thử</SelectItem><SelectItem value="production">Vận hành chính thức</SelectItem></SelectGroup></SelectContent></Select></Field></FieldGroup>
    {releases.isPending && <Skeleton className="h-36 w-full" />}
    {releases.isError && <ErrorState title="Không thể tải phiên bản" description="Vui lòng thử tải lại." onReload={() => void releases.refetch()} />}
    {releases.data && !releases.isError && <><ReleaseTable rows={releases.data.data} columns={columns} caption="Danh sách bản phát hành" /><TablePagination page={filters.page} pagination={releases.data.pagination} isFetching={releases.isFetching} onPrevious={() => setFilters(value => ({ ...value, page: value.page - 1 }))} onNext={() => setFilters(value => ({ ...value, page: value.page + 1 }))} /></>}
  </CardContent></Card>;
}

function DeploymentHistory({ token, onEvents }: { token: string; onEvents: (id: string) => void }) {
  const [historyPage, setHistoryPage] = useState(1);
  const history = useQuery({ queryKey: ["releases", "history", historyPage], queryFn: () => listDeployments(token, historyPage), refetchInterval: 5000 });
  const historyColumns: ColumnDef<Deployment>[] = [
    { accessorKey: "version", header: "Phiên bản" },
    { accessorKey: "environment", header: "Môi trường", cell: ({ row }) => environmentLabel[row.original.environment] },
    { accessorKey: "status", header: "Kết quả", cell: ({ row }) => <div className="flex flex-col items-start gap-1"><Badge variant={row.original.status === "NEEDS_REVIEW" || row.original.status === "FAILED" ? "destructive" : "secondary"}>{statusLabel[row.original.status]}</Badge><span className="max-w-xs text-xs">{row.original.message}</span></div> },
    { accessorKey: "actorName", header: "Người thực hiện", cell: ({ row }) => <div>{row.original.actorName}<p className="text-xs text-muted-foreground">{date(row.original.createdAt)}</p></div> },
    { accessorKey: "reason", header: "Lý do", cell: ({ row }) => <div className="max-w-xs break-words">{row.original.operation === "rollback" ? "Khôi phục" : "Triển khai"}: {row.original.reason}</div> },
    { id: "events", header: "Chi tiết", cell: ({ row }) => <Button variant="outline" size="sm" onClick={() => onEvents(row.original.id)}>Xem nhật ký</Button> },
  ];
  return <Card><CardHeader><CardTitle>Lịch sử triển khai</CardTitle><CardDescription>Kết quả, người thực hiện và nhật ký của từng yêu cầu.</CardDescription></CardHeader><CardContent>
        {history.isPending && <Skeleton className="h-36 w-full" />}
        {history.isError && <ErrorState title="Không thể tải lịch sử" description="Vui lòng thử tải lại." onReload={() => void history.refetch()} />}
        {history.data && !history.isError && <><ReleaseTable rows={history.data.data} columns={historyColumns} caption="Lịch sử triển khai" /><TablePagination page={historyPage} pagination={history.data.pagination} isFetching={history.isFetching} onPrevious={() => setHistoryPage(value => value - 1)} onNext={() => setHistoryPage(value => value + 1)} /></>}
  </CardContent></Card>;
}

function ReleaseTable<T>({ rows, columns, caption }: { rows: T[]; columns: ColumnDef<T>[]; caption: string }) {
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, enableSorting: false });
  if (!rows.length) return <EmptyState title="Chưa có dữ liệu" description="Bản phát hành và lịch sử sẽ xuất hiện sau khi hệ thống nhận dữ liệu." />;
  return <div className="max-w-full overflow-x-auto"><ServerDataTable table={table} caption={caption} className="min-w-[640px]" /></div>;
}

function DeploymentDialog({ action, pending, error, onClose, onSubmit }: { action: DeploymentRequest & { version: string }; pending: boolean; error?: string; onClose: () => void; onSubmit: (input: DeploymentRequest) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{action.operation === "rollback" ? "Quay về phiên bản" : "Triển khai phiên bản"} {action.version}</DialogTitle><DialogDescription>Môi trường: {environmentLabel[action.environment]}. Các dịch vụ có thể gián đoạn trong lúc cập nhật. Database sẽ không được tự động khôi phục.</DialogDescription></DialogHeader>
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(({ reason }) => { const { version: _version, ...input } = action; onSubmit({ ...input, reason: reason.trim() }); })}>
      <Field data-invalid={Boolean(errors.reason)}><FieldLabel htmlFor="deployment-reason">Lý do thực hiện</FieldLabel><Textarea id="deployment-reason" aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? "deployment-reason-error" : undefined} disabled={pending} maxLength={500} {...register("reason", { validate: value => value.trim().length >= 5 || "Nhập lý do tối thiểu 5 ký tự." })} />{errors.reason && <p id="deployment-reason-error" role="alert" className="text-sm text-destructive">{errors.reason.message}</p>}</Field>
      {error && <Alert variant="destructive"><AlertTitle>Chưa hoàn tất yêu cầu</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Đóng</Button><Button type="submit" disabled={pending}>{pending ? "Đang gửi yêu cầu…" : "Xác nhận"}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

function DeploymentEvents({ token, id, onClose }: { token: string; id: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const events = useQuery({ queryKey: ["releases", "events", id, page], queryFn: () => getDeploymentEvents(token, id, page), refetchInterval: 5000 });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Nhật ký triển khai</DialogTitle><DialogDescription>Các bước xử lý được lưu bởi dịch vụ triển khai.</DialogDescription></DialogHeader>
    {events.isPending && <Skeleton className="h-24 w-full" />}
    {events.isError && <p role="alert">Không thể tải nhật ký. Vui lòng thử lại.</p>}
    <ol className="flex max-h-80 flex-col gap-3 overflow-y-auto">{events.data?.data.map(item => <li key={item.id}><p className="text-sm">{item.message}</p><time className="text-xs text-muted-foreground">{date(item.createdAt)}</time></li>)}</ol>
    <DialogFooter><Button variant="outline" disabled={page <= 1 || events.isFetching} onClick={() => setPage(value => value - 1)}>Mới hơn</Button><Button variant="outline" disabled={!events.data || events.data.data.length < 20 || events.isFetching} onClick={() => setPage(value => value + 1)}>Cũ hơn</Button><Button onClick={onClose}>Đóng</Button></DialogFooter>
  </DialogContent></Dialog>;
}
