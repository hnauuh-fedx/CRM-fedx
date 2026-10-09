import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, KeyRound, MessageCircle, RefreshCw, Unplug } from "lucide-react";
import { Link } from "react-router-dom";

import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { disconnectZaloConnection, getZaloConnectionOptions, getZaloConnections, getZaloProcessingLogs, refreshZaloConnection, saveManualZaloConnection, testZaloConnection } from "@/services/zalo-integration.service";
import type { SaveZaloConnectionInput, ZaloConnection, ZaloProcessingLog } from "../zalo-integration.types";

const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
const formatDate = (value: string | null) => value ? dateTime.format(new Date(value)) : "Chưa có";
const statusLabel = (status: string) => ({ active: "Đã kết nối", error: "Có lỗi", disconnected: "Đã ngắt kết nối" } as Record<string, string>)[status] ?? status;

export function ZaloConnectionPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canManage = auth.can("integration.manage");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const connections = useQuery({ queryKey: ["zalo-connections"], queryFn: () => getZaloConnections(auth.accessToken!), refetchInterval: 30_000 });
  const options = useQuery({ queryKey: ["zalo-connections", "options"], queryFn: () => getZaloConnectionOptions(auth.accessToken!) });
  const logs = useQuery({ queryKey: ["zalo-connections", "logs"], queryFn: () => getZaloProcessingLogs(1, 20, auth.accessToken!), enabled: auth.can("integration.log.view") || canManage, refetchInterval: 15_000 });
  const action = useMutation({
    mutationFn: async ({ type, id }: { type: "test" | "refresh" | "disconnect"; id: string }) => type === "test" ? testZaloConnection(id, auth.accessToken!) : type === "refresh" ? refreshZaloConnection(id, auth.accessToken!) : disconnectZaloConnection(id, auth.accessToken!),
    onSuccess: (_data, variables) => {
      setNotice(variables.type === "test" ? "Kết nối Zalo OA hoạt động bình thường." : variables.type === "refresh" ? "Đã đưa yêu cầu làm mới token vào hàng đợi." : "Đã ngắt kết nối Zalo OA.");
      queryClient.invalidateQueries({ queryKey: ["zalo-connections"] });
    },
  });
  return <div className="mx-auto flex max-w-7xl flex-col gap-6">
    <PageHeader eyebrow="CRM Marketing / Kênh kết nối" title="Zalo Official Account" scopeLabel="Đang hoạt động" description="Quản lý kết nối OA, theo dõi tin nhắn và kết quả nhận diện thông tin ứng viên." actions={<Button variant="outline" asChild><Link to="/marketing/kenh-ket-noi"><ArrowLeft data-icon="inline-start" />Quay lại danh sách kênh</Link></Button>} />
    {connections.isError ? <ErrorState title="Không thể tải kết nối Zalo" description="Vui lòng kiểm tra quyền truy cập và thử lại." onReload={() => connections.refetch()} /> : <>
      {notice && <Alert><CheckCircle2 aria-hidden="true" /><AlertTitle>Đã cập nhật</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}
      {action.error && <Alert variant="destructive"><AlertTitle>Không thể thực hiện</AlertTitle><AlertDescription>{action.error.message}</AlertDescription></Alert>}
      <ConfigurationAlert configuration={connections.data?.configuration} />
      <Card><CardHeader className="flex-row items-start justify-between gap-4"><div className="flex gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageCircle aria-hidden="true" /></div><div className="flex flex-col gap-1"><CardTitle>Kết nối Zalo OA</CardTitle><CardDescription>Webhook: <code>/api/integrations/zalo/webhook</code></CardDescription></div></div>{canManage && <ConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} options={options.data} onSaved={() => { setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["zalo-connections"] }); }} />}</CardHeader>
        <CardContent className="flex flex-col gap-4">{connections.isLoading ? <p className="text-sm text-muted-foreground">Đang tải kết nối…</p> : connections.data?.data.length ? connections.data.data.map((connection) => <ConnectionCard key={connection.id} connection={connection} canManage={canManage} busy={action.isPending} onAction={(type) => action.mutate({ type, id: connection.id })} />) : <div className="rounded-lg border border-dashed p-6 text-center"><p className="font-medium">Chưa có Zalo OA nào được kết nối</p><p className="mt-1 text-sm text-muted-foreground">Thêm access token và refresh token để bắt đầu.</p></div>}</CardContent></Card>
      {(auth.can("integration.log.view") || canManage) && <ProcessingLogs data={logs.data?.data ?? []} loading={logs.isLoading} />}
    </>}
  </div>;
}

function ConfigurationAlert({ configuration }: { configuration?: { appIdConfigured: boolean; appSecretConfigured: boolean; webhookSecretConfigured: boolean; encryptionKeyConfigured: boolean; gptApiKeyConfigured: boolean; gptModel: string } }) {
  if (!configuration) return null;
  const missing = [!configuration.appIdConfigured && "ZALO_APP_ID", !configuration.appSecretConfigured && "ZALO_APP_SECRET", !configuration.webhookSecretConfigured && "ZALO_OA_SECRET_KEY", !configuration.encryptionKeyConfigured && "ZALO_TOKEN_ENCRYPTION_KEY", !configuration.gptApiKeyConfigured && "GPT_API_KEY"].filter(Boolean);
  return missing.length === 0 ? <Alert><KeyRound aria-hidden="true" /><AlertTitle>Cấu hình máy chủ đã sẵn sàng</AlertTitle><AlertDescription>App ID được lấy cố định từ máy chủ. Model phân tích: {configuration.gptModel}</AlertDescription></Alert> : <Alert variant="destructive"><KeyRound aria-hidden="true" /><AlertTitle>Thiếu cấu hình máy chủ</AlertTitle><AlertDescription>Cần bổ sung: {missing.join(", ")}.</AlertDescription></Alert>;
}

function ConnectionCard({ connection, canManage, busy, onAction }: { connection: ZaloConnection; canManage: boolean; busy: boolean; onAction: (type: "test" | "refresh" | "disconnect") => void }) {
  return <div className="rounded-xl border p-4"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="flex flex-col gap-2"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{connection.oaName ?? `OA ${connection.oaId}`}</p><Badge variant={connection.status === "active" ? "default" : "secondary"}>{statusLabel(connection.status)}</Badge></div><dl className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2"><div><dt className="inline font-medium text-foreground">OA ID: </dt><dd className="inline">{connection.oaId}</dd></div><div><dt className="inline font-medium text-foreground">Refresh gần nhất: </dt><dd className="inline">{formatDate(connection.lastRefreshAt)}</dd></div><div><dt className="inline font-medium text-foreground">Access token hết hạn: </dt><dd className="inline">{formatDate(connection.accessTokenExpiresAt)}</dd></div><div><dt className="inline font-medium text-foreground">Refresh tiếp theo: </dt><dd className="inline">{formatDate(connection.nextRefreshAt)}</dd></div></dl>{connection.lastRefreshError && <p className="text-sm text-destructive">{connection.lastRefreshError}</p>}</div>{canManage && <div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => onAction("test")}>Kiểm tra</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => onAction("refresh")}><RefreshCw data-icon="inline-start" />Làm mới</Button><Button variant="ghost" size="sm" disabled={busy || connection.status === "disconnected"} onClick={() => onAction("disconnect")}><Unplug data-icon="inline-start" />Ngắt</Button></div>}</div></div>;
}

function ConnectionDialog({ open, onOpenChange, options, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; options?: Awaited<ReturnType<typeof getZaloConnectionOptions>>; onSaved: () => void }) {
  const auth = useAuth();
  const [form, setForm] = useState<SaveZaloConnectionInput>({ accessToken: "", refreshToken: "", accessTokenExpiresInHours: 24, refreshTokenExpiresInDays: 90, institutionProgramId: "", leadSourceId: "" });
  const save = useMutation({ mutationFn: () => saveManualZaloConnection(form, auth.accessToken!), onSuccess: onSaved });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button>Thêm kết nối</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Kết nối Zalo OA</DialogTitle><DialogDescription>App ID lấy từ cấu hình máy chủ. Token được mã hóa và không hiển thị lại sau khi lưu.</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><FieldGroup>
    <Field><FieldLabel htmlFor="zalo-access-token">OA Access Token</FieldLabel><Input id="zalo-access-token" type="password" autoComplete="off" required value={form.accessToken} onChange={(event) => setForm({ ...form, accessToken: event.target.value })} /></Field>
    <Field><FieldLabel htmlFor="zalo-refresh-token">Refresh Token</FieldLabel><Input id="zalo-refresh-token" type="password" autoComplete="off" required value={form.refreshToken} onChange={(event) => setForm({ ...form, refreshToken: event.target.value })} /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="zalo-access-hours">Access token còn hạn (giờ)</FieldLabel><Input id="zalo-access-hours" type="number" min="1" max="168" required value={form.accessTokenExpiresInHours} onChange={(event) => setForm({ ...form, accessTokenExpiresInHours: Number(event.target.value) })} /></Field><Field><FieldLabel htmlFor="zalo-refresh-days">Refresh token còn hạn (ngày)</FieldLabel><Input id="zalo-refresh-days" type="number" min="1" max="365" required value={form.refreshTokenExpiresInDays ?? ""} onChange={(event) => setForm({ ...form, refreshTokenExpiresInDays: Number(event.target.value) || null })} /></Field></div>
    <Field><FieldLabel>Nguồn lead</FieldLabel><Select value={form.leadSourceId} onValueChange={(value) => setForm({ ...form, leadSourceId: value })}><SelectTrigger className="w-full"><SelectValue placeholder="Chọn nguồn lead" /></SelectTrigger><SelectContent><SelectGroup>{options?.leadSources.map((source) => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel>Chương trình tuyển sinh</FieldLabel><Select value={form.institutionProgramId} onValueChange={(value) => setForm({ ...form, institutionProgramId: value })}><SelectTrigger className="w-full" aria-required="true"><SelectValue placeholder="Chọn chương trình tuyển sinh" /></SelectTrigger><SelectContent><SelectGroup>{options?.institutionPrograms.map((program) => <SelectItem key={program.id} value={program.id}>{program.institutionName} / {program.name}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription>Lead nhận từ OA sẽ được đưa vào chương trình này.</FieldDescription></Field>
    {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button type="submit" disabled={save.isPending || !form.leadSourceId || !form.institutionProgramId}>{save.isPending ? "Đang kiểm tra…" : "Kiểm tra và lưu"}</Button></DialogFooter>
  </FieldGroup></form></DialogContent></Dialog>;
}

function ProcessingLogs({ data, loading }: { data: ZaloProcessingLog[]; loading: boolean }) {
  return <Card className="overflow-hidden"><CardHeader><CardTitle>Tin nhắn Zalo</CardTitle><CardDescription>20 tin nhắn gần nhất và kết quả nhận diện.</CardDescription></CardHeader><CardContent className="p-0">{loading ? <p className="px-6 pb-6 text-sm text-muted-foreground">Đang tải lịch sử…</p> : data.length === 0 ? <p className="px-6 pb-6 text-sm text-muted-foreground">Chưa nhận được tin nhắn nào.</p> : <Table><TableHeader><TableRow><TableHead>Thời gian</TableHead><TableHead>Tên / ID user</TableHead><TableHead>Nội dung</TableHead><TableHead>Trạng thái</TableHead><TableHead>Lead</TableHead></TableRow></TableHeader><TableBody>{data.map((item) => <TableRow key={item.id}><TableCell>{formatDate(item.sentAt)}</TableCell><TableCell><div className="flex min-w-40 flex-col"><span className="font-medium">{item.zaloUserName ?? "Chưa có tên"}</span><span className="font-mono text-xs text-muted-foreground">{item.zaloUserId}</span></div></TableCell><TableCell className="max-w-md truncate" title={item.messageText ?? ""}>{item.messageText ?? "-"}</TableCell><TableCell><Badge variant="secondary">{item.processingStatus}</Badge>{item.processingError && <p className="mt-1 max-w-xs text-xs text-destructive">{item.processingError}</p>}</TableCell><TableCell>{item.leadId ?? "-"}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>;
}
