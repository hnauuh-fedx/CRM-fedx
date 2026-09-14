import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, KeyRound, MessageCircle, RefreshCw, Share2, Unplug, type LucideIcon } from "lucide-react";

import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import {
  disconnectZaloConnection,
  getZaloConnectionOptions,
  getZaloConnections,
  getZaloProcessingLogs,
  refreshZaloConnection,
  saveManualZaloConnection,
  testZaloConnection,
} from "@/services/zalo-integration.service";
import type { SaveZaloConnectionInput, ZaloConnection } from "../zalo-integration.types";

const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

function formatDate(value: string | null) {
  return value ? dateTime.format(new Date(value)) : "Chưa có";
}

function statusLabel(status: string) {
  return ({ active: "Đã kết nối", error: "Có lỗi", disconnected: "Đã ngắt kết nối" } as Record<string, string>)[status] ?? status;
}

export function ConnectionChannelsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canManage = auth.can("integration.manage");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const connections = useQuery({
    queryKey: ["zalo-connections"],
    queryFn: () => getZaloConnections(auth.accessToken!),
    refetchInterval: 30_000,
  });
  const options = useQuery({
    queryKey: ["zalo-connections", "options"],
    queryFn: () => getZaloConnectionOptions(auth.accessToken!),
  });
  const logs = useQuery({
    queryKey: ["zalo-connections", "logs"],
    queryFn: () => getZaloProcessingLogs(1, 20, auth.accessToken!),
    enabled: auth.can("integration.log.view") || canManage,
    refetchInterval: 15_000,
  });
  const action = useMutation({
    mutationFn: async ({ type, id }: { type: "test" | "refresh" | "disconnect"; id: string }) => {
      if (type === "test") return testZaloConnection(id, auth.accessToken!);
      if (type === "refresh") return refreshZaloConnection(id, auth.accessToken!);
      return disconnectZaloConnection(id, auth.accessToken!);
    },
    onSuccess: (_data, variables) => {
      setNotice(variables.type === "test" ? "Kết nối Zalo OA hoạt động bình thường." : variables.type === "refresh" ? "Đã đưa yêu cầu làm mới token vào hàng đợi." : "Đã ngắt kết nối Zalo OA.");
      queryClient.invalidateQueries({ queryKey: ["zalo-connections"] });
    },
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Marketing"
        title="Kênh kết nối"
        scopeLabel="Tích hợp dữ liệu"
        description="Kết nối các nền tảng bên thứ ba để tiếp nhận và chuyển đổi thông tin ứng viên thành lead."
      />

      {connections.isError ? (
        <ErrorState title="Không thể tải kênh kết nối" description="Vui lòng kiểm tra quyền truy cập và thử lại." onReload={() => connections.refetch()} />
      ) : (
        <>
          {notice && <Alert><CheckCircle2 aria-hidden="true" /><AlertTitle>Đã cập nhật</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}
          {action.error && <Alert variant="destructive"><AlertTitle>Không thể thực hiện</AlertTitle><AlertDescription>{action.error.message}</AlertDescription></Alert>}
          <ConfigurationAlert configuration={connections.data?.configuration} />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-blue-600 text-white"><MessageCircle aria-hidden="true" /></div>
                  <div><CardTitle>Zalo Official Account</CardTitle><CardDescription>Nhận tin nhắn ứng viên, nhận dạng dữ liệu và tạo lead tự động. Webhook: <code>/api/integrations/zalo/webhook</code></CardDescription></div>
                </div>
                {canManage && <ConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} options={options.data} onSaved={() => { setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["zalo-connections"] }); }} />}
              </CardHeader>
              <CardContent className="space-y-4">
                {connections.isLoading ? <p className="text-sm text-muted-foreground">Đang tải kết nối Zalo OA…</p> : connections.data?.data.length ? connections.data.data.map((connection) => (
                  <ConnectionCard key={connection.id} connection={connection} canManage={canManage} busy={action.isPending} onAction={(type) => action.mutate({ type, id: connection.id })} />
                )) : <div className="rounded-lg border border-dashed p-6 text-center"><p className="font-medium">Chưa có Zalo OA nào được kết nối</p><p className="mt-1 text-sm text-muted-foreground">Thêm access token và refresh token để bắt đầu kiểm thử.</p></div>}
              </CardContent>
            </Card>

            <div className="grid gap-4">
              <PlaceholderChannel icon={Share2} title="Facebook" description="Lead được tiếp nhận qua LadiPage, Webhook hoặc Form & Survey." />
              <PlaceholderChannel icon={Bot} title="TikTok Lead" description="Sẵn sàng tích hợp luồng dữ liệu từ biểu mẫu TikTok." />
            </div>
          </div>

          {(auth.can("integration.log.view") || canManage) && <ProcessingLogs data={logs.data?.data ?? []} loading={logs.isLoading} />}
        </>
      )}
    </div>
  );
}

function ConfigurationAlert({ configuration }: { configuration?: { appIdConfigured: boolean; appSecretConfigured: boolean; webhookSecretConfigured: boolean; encryptionKeyConfigured: boolean; gptApiKeyConfigured: boolean; gptModel: string } }) {
  if (!configuration) return null;
  const missing = [
    !configuration.appIdConfigured && "ZALO_APP_ID",
    !configuration.appSecretConfigured && "ZALO_APP_SECRET",
    !configuration.webhookSecretConfigured && "ZALO_OA_SECRET_KEY",
    !configuration.encryptionKeyConfigured && "ZALO_TOKEN_ENCRYPTION_KEY",
    !configuration.gptApiKeyConfigured && "GPT_API_KEY",
  ].filter(Boolean);
  if (missing.length === 0) return <Alert><KeyRound aria-hidden="true" /><AlertTitle>Cấu hình máy chủ đã sẵn sàng</AlertTitle><AlertDescription>Model phân tích: {configuration.gptModel}</AlertDescription></Alert>;
  return <Alert variant="destructive"><KeyRound aria-hidden="true" /><AlertTitle>Thiếu cấu hình máy chủ</AlertTitle><AlertDescription>Cần bổ sung: {missing.join(", ")}.</AlertDescription></Alert>;
}

function ConnectionCard({ connection, canManage, busy, onAction }: { connection: ZaloConnection; canManage: boolean; busy: boolean; onAction: (type: "test" | "refresh" | "disconnect") => void }) {
  return <div className="rounded-xl border p-4"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{connection.oaName ?? `OA ${connection.oaId}`}</p><Badge variant={connection.status === "active" ? "default" : "secondary"}>{statusLabel(connection.status)}</Badge></div><dl className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2"><div><dt className="inline font-medium text-foreground">OA ID: </dt><dd className="inline">{connection.oaId}</dd></div><div><dt className="inline font-medium text-foreground">Refresh gần nhất: </dt><dd className="inline">{formatDate(connection.lastRefreshAt)}</dd></div><div><dt className="inline font-medium text-foreground">Access token hết hạn: </dt><dd className="inline">{formatDate(connection.accessTokenExpiresAt)}</dd></div><div><dt className="inline font-medium text-foreground">Refresh tiếp theo: </dt><dd className="inline">{formatDate(connection.nextRefreshAt)}</dd></div></dl>{connection.lastRefreshError && <p className="text-sm text-destructive">{connection.lastRefreshError}</p>}</div>{canManage && <div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => onAction("test")}>Kiểm tra</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => onAction("refresh")}><RefreshCw aria-hidden="true" />Làm mới</Button><Button variant="ghost" size="sm" disabled={busy || connection.status === "disconnected"} onClick={() => onAction("disconnect")}><Unplug aria-hidden="true" />Ngắt</Button></div>}</div></div>;
}

function ConnectionDialog({ open, onOpenChange, options, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; options?: Awaited<ReturnType<typeof getZaloConnectionOptions>>; onSaved: () => void }) {
  const auth = useAuth();
  const [form, setForm] = useState<SaveZaloConnectionInput>({ accessToken: "", refreshToken: "", accessTokenExpiresInHours: 24, refreshTokenExpiresInDays: 90, institutionProgramId: "", leadSourceId: "" });
  const save = useMutation({ mutationFn: () => saveManualZaloConnection(form, auth.accessToken!), onSuccess: onSaved });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button>Thêm kết nối</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Kết nối Zalo OA để kiểm thử</DialogTitle><DialogDescription>Token được gửi thẳng về backend, mã hóa và không hiển thị lại sau khi lưu.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><Field><FieldLabel htmlFor="zalo-app-id">App ID (để trống nếu đã cấu hình máy chủ)</FieldLabel><Input id="zalo-app-id" value={form.appId ?? ""} onChange={(event) => setForm({ ...form, appId: event.target.value || undefined })} /></Field><Field><FieldLabel htmlFor="zalo-access-token">OA Access Token</FieldLabel><Input id="zalo-access-token" type="password" autoComplete="off" required value={form.accessToken} onChange={(event) => setForm({ ...form, accessToken: event.target.value })} /></Field><Field><FieldLabel htmlFor="zalo-refresh-token">Refresh Token</FieldLabel><Input id="zalo-refresh-token" type="password" autoComplete="off" required value={form.refreshToken} onChange={(event) => setForm({ ...form, refreshToken: event.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="zalo-access-hours">Access token còn hạn (giờ)</FieldLabel><Input id="zalo-access-hours" type="number" min="1" max="168" required value={form.accessTokenExpiresInHours} onChange={(event) => setForm({ ...form, accessTokenExpiresInHours: Number(event.target.value) })} /></Field><Field><FieldLabel htmlFor="zalo-refresh-days">Refresh token còn hạn (ngày)</FieldLabel><Input id="zalo-refresh-days" type="number" min="1" max="365" required value={form.refreshTokenExpiresInDays ?? ""} onChange={(event) => setForm({ ...form, refreshTokenExpiresInDays: Number(event.target.value) || null })} /></Field></div><Field><FieldLabel>Nguồn lead</FieldLabel><Select value={form.leadSourceId} onValueChange={(value) => setForm({ ...form, leadSourceId: value })}><SelectTrigger className="w-full"><SelectValue placeholder="Chọn nguồn lead" /></SelectTrigger><SelectContent>{options?.leadSources.map((source) => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}</SelectContent></Select></Field><Field><FieldLabel htmlFor="zalo-institution-program">Chương trình tuyển sinh <span aria-hidden="true" className="text-destructive">*</span></FieldLabel><Select value={form.institutionProgramId} onValueChange={(value) => setForm({ ...form, institutionProgramId: value })}><SelectTrigger id="zalo-institution-program" className="w-full" aria-required="true"><SelectValue placeholder="Chọn chương trình tuyển sinh" /></SelectTrigger><SelectContent>{options?.institutionPrograms.map((program) => <SelectItem key={program.id} value={program.id}>{program.institutionName} / {program.name}</SelectItem>)}</SelectContent></Select><FieldDescription>Lead nhận từ Zalo OA sẽ được đưa vào danh sách của chương trình này.</FieldDescription></Field>{save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button type="submit" disabled={save.isPending || !form.leadSourceId || !form.institutionProgramId}>{save.isPending ? "Đang kiểm tra…" : "Kiểm tra và lưu"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function PlaceholderChannel({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <Card><CardHeader><div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted"><Icon aria-hidden="true" /></div><div className="flex items-center justify-between gap-2"><CardTitle>{title}</CardTitle><Badge variant="secondary">Theo kế hoạch</Badge></div><CardDescription>{description}</CardDescription></CardHeader></Card>;
}

function ProcessingLogs({ data, loading }: { data: Array<{ id: string; zaloUserId: string; zaloUserName: string | null; messageText: string | null; sentAt: string; processingStatus: string; processingError: string | null; leadId: string | null }>; loading: boolean }) {
  return <Card className="overflow-hidden"><CardHeader><CardTitle>Lịch sử nhận dạng tin nhắn</CardTitle><CardDescription>20 tin nhắn gần nhất được webhook tiếp nhận.</CardDescription></CardHeader><CardContent className="p-0">{loading ? <p className="px-6 pb-6 text-sm text-muted-foreground">Đang tải lịch sử…</p> : data.length === 0 ? <p className="px-6 pb-6 text-sm text-muted-foreground">Chưa nhận được tin nhắn nào.</p> : <Table><TableHeader><TableRow><TableHead>Thời gian</TableHead><TableHead>Tên / ID user</TableHead><TableHead>Nội dung</TableHead><TableHead>Trạng thái</TableHead><TableHead>Lead</TableHead></TableRow></TableHeader><TableBody>{data.map((item) => <TableRow key={item.id}><TableCell>{formatDate(item.sentAt)}</TableCell><TableCell><div className="flex min-w-40 flex-col"><span className="font-medium text-foreground">{item.zaloUserName ?? "Chưa có tên"}</span><span className="font-mono text-xs text-muted-foreground">{item.zaloUserId}</span></div></TableCell><TableCell className="max-w-md truncate" title={item.messageText ?? ""}>{item.messageText ?? "-"}</TableCell><TableCell><Badge variant="secondary">{item.processingStatus}</Badge>{item.processingError && <p className="mt-1 max-w-xs text-xs text-destructive">{item.processingError}</p>}</TableCell><TableCell>{item.leadId ?? "-"}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>;
}
