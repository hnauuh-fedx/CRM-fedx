import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { defaultSystemPreferences, preferenceSections, type SystemPreferences } from "@admission-crm/shared/system-preferences";
import { Settings, Search, FlaskConical, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { getSystemPreferences, simulateSystemPreferences } from "@/services/system-preferences.service";
import { preferenceDescriptions, preferenceFields, preferenceLabels } from "../system-preference-fields";
import { SystemPreferenceEditor } from "../components/system-preference-editor";
import { SystemFormEditor } from "../components/system-form-editor";

export function SystemSettingsPage() {
  const { selectedProgramId } = useInstitutionProgram();
  return <SystemPreferencesWorkspace key={selectedProgramId ?? "none"} />;
}

function SystemPreferencesWorkspace() {
  const auth = useAuth();
  const { selectedProgramId, programs } = useInstitutionProgram();
  const [tab, setTab] = useState("intake");
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const query = useQuery({ queryKey: ["system-preferences", selectedProgramId], queryFn: () => getSystemPreferences(auth.accessToken!, selectedProgramId!), enabled: Boolean(selectedProgramId) && auth.can("system.manage"), refetchOnWindowFocus: false });
  if (!auth.can("system.manage")) return <Alert><AlertTitle>Không có quyền cấu hình hệ thống</AlertTitle></Alert>;
  const program = programs.find(item => item.id === selectedProgramId);
  const matching = preferenceSections.filter(section => [preferenceLabels[section], preferenceDescriptions[section], ...preferenceFields[section].map(field => field.label)].join(" ").toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")));
  const preferences = Object.fromEntries(query.data?.sections.map(section => [section.section, section.value]) ?? Object.entries(defaultSystemPreferences)) as SystemPreferences;
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <PageHeader eyebrow="Quản lý" title="Cấu hình hệ thống" scopeLabel="Quyền quản trị" description="Thiết lập theo nghiệp vụ bằng các lựa chọn có sẵn. Mỗi nhóm được lưu và áp dụng riêng." />
    <Alert><Settings /><AlertTitle>{program ? `Đang cấu hình: ${program.name}` : "Vui lòng chọn chương trình"}</AlertTitle><AlertDescription>Các nhóm vận hành chỉ áp dụng cho chương trình đang chọn. Biểu mẫu và mẫu ghi chú có nhãn “Toàn hệ thống” dùng chung cho mọi chương trình.</AlertDescription></Alert>
    <div className="flex flex-wrap items-end justify-between gap-3"><Field className="max-w-md"><FieldLabel htmlFor="system-setting-search"><Search className="size-4" />Tìm thiết lập</FieldLabel><Input id="system-setting-search" disabled={dirty} value={search} onChange={event => { const value = event.target.value; setSearch(value); if (value) setTab("search"); else setTab("intake"); }} placeholder="Nhập Excel, phân công, thông báo…" /></Field>{auth.can("automation.view_logs") && <Button asChild variant="outline"><Link to="/automations/monitoring">Giám sát Automation<ArrowUpRight data-icon="inline-end" /></Link></Button>}</div>
    {dirty && <p role="status" className="text-sm text-muted-foreground">Lưu hoặc hủy thay đổi của nhóm hiện tại trước khi chuyển nhóm.</p>}
    <Tabs value={tab} onValueChange={value => { if (!dirty) { setTab(value); setSearch(""); } }}>
      <TabsList aria-label="Nhóm cấu hình hệ thống" className="grid h-auto w-full grid-cols-2 gap-1 group-data-[orientation=horizontal]/tabs:h-auto sm:grid-cols-4 xl:grid-cols-8">{preferenceSections.map(section => <TabsTrigger key={section} value={section} className="min-h-11 whitespace-normal text-center" disabled={dirty && tab !== section}>{preferenceLabels[section]}</TabsTrigger>)}<TabsTrigger value="forms" className="min-h-11 whitespace-normal text-center" disabled={dirty}>Biểu mẫu & ghi chú</TabsTrigger><TabsTrigger value="advanced" className="min-h-11 whitespace-normal text-center" disabled={dirty}>Nâng cao</TabsTrigger></TabsList>
      {query.isError ? <ErrorState title="Không tải được cấu hình" description="Vui lòng thử lại." onReload={() => query.refetch()} /> : !query.data && selectedProgramId ? <p role="status">Đang tải cấu hình…</p> : null}
      {query.data?.sections.map(snapshot => <TabsContent key={snapshot.section} value={snapshot.section} className="mt-4"><SystemPreferenceEditor snapshot={snapshot} programId={selectedProgramId!} onDirtyChange={setDirty} />{snapshot.section === "intake" && <RuleSimulator preferences={preferences} programId={selectedProgramId!} />}</TabsContent>)}
      <TabsContent value="forms" className="mt-4"><SystemFormEditor onDirtyChange={setDirty} /></TabsContent>
      <TabsContent value="search" className="mt-4"><Card><CardHeader><CardTitle>Kết quả tìm kiếm</CardTitle><CardDescription>Chọn nhóm để xem và thay đổi thiết lập.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{matching.length ? matching.map(section => <Button key={section} variant="outline" className="h-auto justify-between whitespace-normal py-3 text-left" onClick={() => { setTab(section); setSearch(""); }}>{preferenceLabels[section]}<ArrowUpRight data-icon="inline-end" /></Button>) : <p>Không tìm thấy thiết lập phù hợp.</p>}</CardContent></Card></TabsContent>
      <TabsContent value="advanced" className="mt-4"><Card><CardHeader><CardTitle>Thiết lập nâng cao</CardTitle><CardDescription>Các cấu hình kỹ thuật và dấu mốc chuyển đổi được giữ nguyên khi sử dụng giao diện mới.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><Badge variant="outline" className="self-start">Bảo toàn dữ liệu hiện tại</Badge><p className="text-sm text-muted-foreground">Các bản ghi SLA và cấu hình báo cáo cũ không tự chuyển thành quy tắc mới. Thiết lập “Thời hạn xử lý” trên trang này điều khiển chức năng nhắc liên hệ lần đầu; báo cáo cá nhân tiếp tục dùng cấu hình riêng.</p><p className="text-sm text-muted-foreground">Lịch sử thay đổi được ghi trong Nhật ký hệ thống. Quyền quản trị cấu hình không cấp thêm quyền xem hoặc xuất dữ liệu kinh doanh.</p>{auth.can("audit.view") && <Button asChild variant="outline" className="self-start"><Link to="/he-thong/nhat-ky">Xem nhật ký hệ thống</Link></Button>}</CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}

function RuleSimulator({ preferences, programId }: { preferences: SystemPreferences; programId: string }) {
  const { accessToken } = useAuth();
  const [source, setSource] = useState<"excel" | "bizfly" | "inbound">("bizfly");
  const [duplicate, setDuplicate] = useState(true);
  const simulation = useQuery({ queryKey: ["system-preference-simulation", programId, preferences, source, duplicate], queryFn: () => simulateSystemPreferences(accessToken!, programId, preferences, source, duplicate), enabled: false, retry: false });
  return <Card className="mt-6"><CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="size-4" />Thử quy tắc tiếp nhận</CardTitle><CardDescription>Mô phỏng theo cấu hình đã lưu, không tạo hoặc cập nhật lead. Dùng “Xem trước” khi nhập Excel để kiểm tra dữ liệu thật.</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="simulation-source">Nguồn dữ liệu mẫu</FieldLabel><Select value={source} onValueChange={value => { setSource(value as typeof source);  }}><SelectTrigger id="simulation-source"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="excel">Excel thông thường</SelectItem><SelectItem value="bizfly">File Bizfly</SelectItem><SelectItem value="inbound">Form / tích hợp</SelectItem></SelectGroup></SelectContent></Select></Field><Field orientation="horizontal"><Checkbox id="simulation-duplicate" checked={duplicate} onCheckedChange={checked => { setDuplicate(checked === true);  }} /><FieldLabel htmlFor="simulation-duplicate">Số điện thoại đã có trong chương trình</FieldLabel></Field><Button variant="outline" className="self-start" disabled={simulation.isFetching} onClick={() => simulation.refetch()}>Thử quy tắc đã lưu</Button>{simulation.isError && <p role="alert">{simulation.error.message}</p>}{simulation.data && <Alert><AlertTitle>{simulation.data.action}</AlertTitle><AlertDescription><p>{simulation.data.assignment}</p><p>{simulation.data.blankValues}</p></AlertDescription></Alert>}</FieldGroup></CardContent></Card>;
}
