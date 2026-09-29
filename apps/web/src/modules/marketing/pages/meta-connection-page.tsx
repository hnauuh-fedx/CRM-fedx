import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, KeyRound, MessagesSquare, Plug, Unplug } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import type { MetaConnection, MetaProcessingLog } from "@/modules/marketing/meta-integration.types";
import { connectMetaPage, disconnectMetaConnection, getMetaConnectionOptions, getMetaConnections, getMetaOAuthPages, getMetaProcessingLogs, startMetaOAuth, testMetaConnection } from "@/services/meta-integration.service";

const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
const formatDate = (value: string | null) => value ? dateTime.format(new Date(value)) : "Chưa có";
const statusLabel = (status: string) => ({ active: "Đã kết nối", error: "Có lỗi", disconnected: "Đã ngắt kết nối" } as Record<string, string>)[status] ?? status;

export function MetaConnectionPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = auth.can("integration.manage");
  const sessionId = searchParams.get("metaSession");
  const oauthError = searchParams.get("metaError");
  const [notice, setNotice] = useState<string | null>(null);
  const connections = useQuery({ queryKey: ["meta-connections"], queryFn: () => getMetaConnections(auth.accessToken!), refetchInterval: 30_000 });
  const options = useQuery({ queryKey: ["meta-connections", "options"], queryFn: () => getMetaConnectionOptions(auth.accessToken!) });
  const logs = useQuery({ queryKey: ["meta-connections", "logs"], queryFn: () => getMetaProcessingLogs(1, 20, auth.accessToken!), enabled: auth.can("integration.log.view") || canManage, refetchInterval: 15_000 });
  const pages = useQuery({ queryKey: ["meta-oauth-pages", sessionId], queryFn: () => getMetaOAuthPages(sessionId!, auth.accessToken!), enabled: Boolean(sessionId && auth.accessToken) });
  const connect = useMutation({
    mutationFn: (pageId: string) => connectMetaPage(sessionId!, pageId, auth.accessToken!),
    onSuccess: () => { setNotice("Đã kết nối Page và đăng ký webhook Messenger."); setSearchParams({}); queryClient.invalidateQueries({ queryKey: ["meta-connections"] }); },
  });
  const action = useMutation({
    mutationFn: ({ type, id }: { type: "test" | "disconnect"; id: string }) => type === "test" ? testMetaConnection(id, auth.accessToken!) : disconnectMetaConnection(id, auth.accessToken!),
    onSuccess: (_data, variables) => { setNotice(variables.type === "test" ? "Page và Page Access Token đang hoạt động." : "Đã ngắt đăng ký webhook của Page."); queryClient.invalidateQueries({ queryKey: ["meta-connections"] }); },
  });

  return <div className="mx-auto flex max-w-7xl flex-col gap-6">
    <PageHeader eyebrow="CRM Marketing / Kênh kết nối" title="Meta Messenger" scopeLabel="Facebook Page" description="Kết nối Page, nhận tin nhắn Messenger và nhận diện thông tin ứng viên để tạo lead." actions={<Button variant="outline" asChild><Link to="/marketing/kenh-ket-noi"><ArrowLeft data-icon="inline-start" />Quay lại danh sách kênh</Link></Button>} />
    {connections.isError ? <ErrorState title="Không thể tải kết nối Meta" description="Vui lòng kiểm tra quyền truy cập và thử lại." onReload={() => connections.refetch()} /> : <>
      {(notice || oauthError) && <Alert variant={oauthError ? "destructive" : "default"}>{!oauthError && <CheckCircle2 aria-hidden="true" />}<AlertTitle>{oauthError ? "Kết nối Meta thất bại" : "Đã cập nhật"}</AlertTitle><AlertDescription>{oauthError ?? notice}</AlertDescription></Alert>}
      {action.error && <Alert variant="destructive"><AlertTitle>Không thể thực hiện</AlertTitle><AlertDescription>{action.error.message}</AlertDescription></Alert>}
      <ConfigurationAlert configuration={connections.data?.configuration} />
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4"><div className="flex gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessagesSquare aria-hidden="true" /></div><div className="flex flex-col gap-1"><CardTitle>Facebook Pages</CardTitle><CardDescription>Webhook: <code>/api/integrations/meta/webhook</code></CardDescription></div></div>{canManage && <ConnectDialog options={options.data} />}</CardHeader>
        <CardContent className="flex flex-col gap-4">{connections.isLoading ? <p className="text-sm text-muted-foreground">Đang tải kết nối…</p> : connections.data?.data.length ? connections.data.data.map((connection) => <ConnectionCard key={connection.id} connection={connection} canManage={canManage} busy={action.isPending} onAction={(type) => action.mutate({ type, id: connection.id })} />) : <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Plug aria-hidden="true" /></EmptyMedia><EmptyTitle>Chưa có Page nào được kết nối</EmptyTitle><EmptyDescription>Chọn “Kết nối Facebook” để cấp quyền, chọn Page và tự động đăng ký webhook.</EmptyDescription></EmptyHeader></Empty>}</CardContent>
      </Card>
      {(auth.can("integration.log.view") || canManage) && <ProcessingLogs data={logs.data?.data ?? []} loading={logs.isLoading} />}
      <PageSelectionDialog open={Boolean(sessionId)} loading={pages.isLoading} error={pages.error?.message ?? connect.error?.message} pages={pages.data?.data ?? []} busy={connect.isPending} onConnect={(pageId) => connect.mutate(pageId)} onClose={() => setSearchParams({})} />
    </>}
  </div>;
}

function ConfigurationAlert({ configuration }: { configuration?: Awaited<ReturnType<typeof getMetaConnections>>["configuration"] }) {
  if (!configuration) return null;
  const missing = [!configuration.appIdConfigured && "META_APP_ID", !configuration.appSecretConfigured && "META_APP_SECRET", !configuration.verifyTokenConfigured && "META_WEBHOOK_VERIFY_TOKEN", !configuration.encryptionKeyConfigured && "META_TOKEN_ENCRYPTION_KEY", !configuration.oauthRedirectUriConfigured && "META_OAUTH_REDIRECT_URI", !configuration.gptApiKeyConfigured && "GPT_API_KEY"].filter(Boolean);
  return missing.length === 0
    ? <Alert><KeyRound aria-hidden="true" /><AlertTitle>Cấu hình máy chủ đã sẵn sàng</AlertTitle><AlertDescription>Graph API {configuration.graphApiVersion}. Token Page được mã hóa; model nhận diện: {configuration.gptModel}.</AlertDescription></Alert>
    : <Alert variant="destructive"><KeyRound aria-hidden="true" /><AlertTitle>Thiếu cấu hình máy chủ</AlertTitle><AlertDescription>Cần bổ sung: {missing.join(", ")}.</AlertDescription></Alert>;
}

function ConnectDialog({ options }: { options?: Awaited<ReturnType<typeof getMetaConnectionOptions>> }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ institutionProgramId: "", leadSourceId: "" });
  const start = useMutation({ mutationFn: () => startMetaOAuth(form, auth.accessToken!), onSuccess: ({ authorizationUrl }) => window.location.assign(authorizationUrl) });
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plug data-icon="inline-start" />Kết nối Facebook</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Kết nối Facebook Page</DialogTitle><DialogDescription>Chọn nơi tiếp nhận lead trước khi chuyển sang Facebook để cấp quyền. CRM không yêu cầu bạn nhập Page Access Token thủ công.</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); start.mutate(); }}><FieldGroup>
    <Field><FieldLabel>Nguồn lead</FieldLabel><Select value={form.leadSourceId} onValueChange={(value) => setForm({ ...form, leadSourceId: value })}><SelectTrigger className="w-full" aria-required="true"><SelectValue placeholder="Chọn nguồn lead" /></SelectTrigger><SelectContent><SelectGroup>{options?.leadSources.map((source) => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel>Chương trình tuyển sinh</FieldLabel><Select value={form.institutionProgramId} onValueChange={(value) => setForm({ ...form, institutionProgramId: value })}><SelectTrigger className="w-full" aria-required="true"><SelectValue placeholder="Chọn chương trình tuyển sinh" /></SelectTrigger><SelectContent><SelectGroup>{options?.institutionPrograms.map((program) => <SelectItem key={program.id} value={program.id}>{program.institutionName} / {program.name}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription>Lead tạo từ Messenger sẽ được đưa vào chương trình này.</FieldDescription></Field>
    {start.error && <p role="alert" className="text-sm text-destructive">{start.error.message}</p>}
    <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button type="submit" disabled={start.isPending || !form.institutionProgramId || !form.leadSourceId}>{start.isPending && <Spinner data-icon="inline-start" />}{start.isPending ? "Đang chuyển hướng…" : "Tiếp tục với Facebook"}</Button></DialogFooter>
  </FieldGroup></form></DialogContent></Dialog>;
}

function PageSelectionDialog({ open, loading, error, pages, busy, onConnect, onClose }: { open: boolean; loading: boolean; error?: string; pages: Array<{ id: string; name: string; canMessage: boolean }>; busy: boolean; onConnect: (pageId: string) => void; onClose: () => void }) {
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Chọn Facebook Page</DialogTitle><DialogDescription>Chọn Page sẽ nhận tin nhắn trong CRM. Tài khoản cần có quyền quản lý tin nhắn trên Page.</DialogDescription></DialogHeader>
    {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Đang tải danh sách Page…</div> : error ? <Alert variant="destructive"><AlertTitle>Không thể tải Page</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : pages.length === 0 ? <Empty><EmptyHeader><EmptyTitle>Không tìm thấy Page</EmptyTitle><EmptyDescription>Hãy kết nối lại và cấp các quyền pages_show_list, pages_read_engagement và pages_messaging cho Page.</EmptyDescription></EmptyHeader></Empty> : <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">{pages.map((page) => <div key={page.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="truncate font-medium">{page.name}</p><p className="font-mono text-xs text-muted-foreground">{page.id}</p></div><Button size="sm" disabled={busy || !page.canMessage} onClick={() => onConnect(page.id)}>{busy && <Spinner data-icon="inline-start" />}{page.canMessage ? "Kết nối" : "Thiếu quyền nhắn tin"}</Button></div>)}</div>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Đóng</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function ConnectionCard({ connection, canManage, busy, onAction }: { connection: MetaConnection; canManage: boolean; busy: boolean; onAction: (type: "test" | "disconnect") => void }) {
  return <div className="rounded-xl border p-4"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="flex flex-col gap-2"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{connection.pageName ?? `Page ${connection.pageId}`}</p><Badge variant={connection.status === "active" ? "default" : "secondary"}>{statusLabel(connection.status)}</Badge></div><dl className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2"><div><dt className="inline font-medium text-foreground">Page ID: </dt><dd className="inline">{connection.pageId}</dd></div><div><dt className="inline font-medium text-foreground">Đăng ký webhook: </dt><dd className="inline">{formatDate(connection.webhookSubscribedAt)}</dd></div><div><dt className="inline font-medium text-foreground">Kiểm tra gần nhất: </dt><dd className="inline">{formatDate(connection.lastCheckedAt)}</dd></div></dl>{connection.lastError && <p className="text-sm text-destructive">{connection.lastError}</p>}</div>{canManage && <div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => onAction("test")}>Kiểm tra</Button><Button variant="ghost" size="sm" disabled={busy || connection.status === "disconnected"} onClick={() => onAction("disconnect")}><Unplug data-icon="inline-start" />Ngắt</Button></div>}</div></div>;
}

function ProcessingLogs({ data, loading }: { data: MetaProcessingLog[]; loading: boolean }) {
  return <Card className="overflow-hidden"><CardHeader><CardTitle>Tin nhắn Messenger</CardTitle><CardDescription>20 sự kiện gần nhất và kết quả nhận diện lead.</CardDescription></CardHeader><CardContent className="p-0">{loading ? <p className="px-6 pb-6 text-sm text-muted-foreground">Đang tải lịch sử…</p> : data.length === 0 ? <Empty><EmptyHeader><EmptyTitle>Chưa nhận được tin nhắn</EmptyTitle><EmptyDescription>Gửi tin nhắn từ một tài khoản thử nghiệm tới Page đã kết nối.</EmptyDescription></EmptyHeader></Empty> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Thời gian</TableHead><TableHead>Page</TableHead><TableHead>Người gửi</TableHead><TableHead>Nội dung</TableHead><TableHead>Trạng thái</TableHead><TableHead>Lead</TableHead></TableRow></TableHeader><TableBody>{data.map((item) => <TableRow key={item.id}><TableCell>{formatDate(item.sentAt)}</TableCell><TableCell>{item.pageName ?? item.pageId ?? "-"}</TableCell><TableCell><div className="flex min-w-40 flex-col"><span className="font-medium">{item.senderName ?? "Chưa có tên"}</span><span className="font-mono text-xs text-muted-foreground">{item.senderPsid}</span></div></TableCell><TableCell className="max-w-md truncate" title={item.messageText ?? ""}>{item.messageText ?? `[${item.eventType}]`}</TableCell><TableCell><Badge variant="secondary">{item.processingStatus}</Badge>{item.processingError && <p className="mt-1 max-w-xs text-xs text-destructive">{item.processingError}</p>}</TableCell><TableCell>{item.leadId ?? "-"}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>;
}
