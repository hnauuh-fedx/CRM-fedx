import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/modules/auth/auth-context";
import { TransitionNoteSettings } from "@/modules/custom-fields/components/transition-note-settings";
import { getLeadFormConfiguration, saveLeadFormConfiguration, type LeadFormConfiguration } from "@/services/system-preferences.service";
import { DisplayLayoutLeaveGuard } from "../display-layout/use-display-layout-leave-guard";

export function SystemFormEditor({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { accessToken, can } = useAuth();
  const query = useQuery({ queryKey: ["system-lead-form"], queryFn: () => getLeadFormConfiguration(accessToken!), refetchOnWindowFocus: false });
  return <div className="flex flex-col gap-6">
    <Alert><AlertTitle>Phạm vi toàn hệ thống</AlertTitle><AlertDescription>Trường bắt buộc và mẫu ghi chú dùng chung cho tất cả chương trình. Thay đổi tại đây cũng cập nhật các màn hình cấu hình biểu mẫu hiện có.</AlertDescription></Alert>
    {query.isError ? <Alert variant="destructive"><AlertTitle>Không thể tải biểu mẫu</AlertTitle><AlertDescription><Button onClick={() => query.refetch()}>Thử lại</Button></AlertDescription></Alert> : query.data ? <LeadRequirementsForm snapshot={query.data} token={accessToken!} onDirtyChange={onDirtyChange} /> : <p role="status">Đang tải cấu hình biểu mẫu…</p>}
    <Card><CardHeader><CardTitle>Mẫu ghi chú theo trạng thái</CardTitle><CardDescription>Thêm mẫu, sắp xếp và tích chọn mẫu đang sử dụng theo từng tiến trình.</CardDescription></CardHeader><CardContent><TransitionNoteSettings management /></CardContent></Card>
    <Card><CardHeader><CardTitle>Quy trình tuyển sinh</CardTitle><CardDescription>Quản lý tiến trình và các trạng thái được phép chuyển tiếp trong màn hình nghiệp vụ tương ứng. Các màn hình tiếp tục dùng chung cấu hình hiện có.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{can("pipeline.manage") && <Button asChild variant="outline"><Link to="/quan-ly/pipeline">Cấu hình Pipeline</Link></Button>}{can("admission_status.update") && <Button asChild variant="outline"><Link to="/tuyen-sinh/trang-thai-ho-so">Cấu hình luồng trạng thái hồ sơ</Link></Button>}</CardContent></Card>
  </div>;
}

function LeadRequirementsForm({ snapshot, token, onDirtyChange }: { snapshot: LeadFormConfiguration; token: string; onDirtyChange: (dirty: boolean) => void }) {
  const queryClient = useQueryClient();
  const [revision, setRevision] = useState(snapshot.revision);
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const form = useForm<{ requirements: Record<string, boolean> }>({ defaultValues: { requirements: snapshot.requirements } });
  const overrides = form.watch("requirements");
  const mutation = useMutation({ mutationFn: (requirements: Record<string, boolean>) => saveLeadFormConfiguration(token, { requirements, revision }), onSuccess: async data => {
    form.reset({ requirements: data.requirements }); setRevision(data.revision); setSaved(true); onDirtyChange(false);
    queryClient.setQueryData(["system-lead-form"], data);
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["system-field-requirements"] }), queryClient.invalidateQueries({ queryKey: ["leads", "action-options"] })]);
  } });
  return <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Trường bắt buộc của lead</CardTitle><Badge variant="outline">Toàn hệ thống</Badge></div><CardDescription>Tích chọn trường cần nhập. Các trường định danh cốt lõi luôn bắt buộc.</CardDescription></CardHeader>
    <form onSubmit={form.handleSubmit(values => mutation.mutate(values.requirements))}><CardContent><FieldGroup>
      <Field><FieldLabel htmlFor="required-field-search">Tìm trường dữ liệu</FieldLabel><Input id="required-field-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Ví dụ: email, ngành, địa chỉ…" /></Field>
      {mutation.isError && <Alert variant="destructive"><AlertTitle>Chưa lưu được biểu mẫu</AlertTitle><AlertDescription>{mutation.error.message}<Button type="button" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["system-lead-form"] })}>Tải dữ liệu mới</Button></AlertDescription></Alert>}
      {leadFormFieldCatalog.map(group => {
        const fields = group.fields.filter(field => !field.readOnly && field.label.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")));
        if (!fields.length) return null;
        return <details key={group.id} open={search ? true : undefined} className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">{group.label} <span className="text-muted-foreground">({fields.filter(field => overrides[field.key] ?? field.isRequired).length}/{fields.length} bắt buộc)</span></summary><FieldGroup className="mt-4 gap-3">{fields.map(field => <Field key={field.key} orientation="horizontal" data-disabled={field.requiredLocked || mutation.isPending}><Checkbox id={`required-${field.key}`} checked={field.requiredLocked || (overrides[field.key] ?? field.isRequired ?? false)} disabled={field.requiredLocked || mutation.isPending} onCheckedChange={checked => { form.setValue(`requirements.${field.key}`, checked === true, { shouldDirty: true }); onDirtyChange(JSON.stringify(form.getValues("requirements")) !== JSON.stringify(form.formState.defaultValues?.requirements ?? {})); setSaved(false); }} /><FieldLabel htmlFor={`required-${field.key}`}>{field.label}{field.requiredLocked && <Badge variant="secondary">Luôn bắt buộc</Badge>}</FieldLabel></Field>)}</FieldGroup></details>;
      })}
      {saved && <p role="status">Đã lưu cấu hình biểu mẫu.</p>}
    </FieldGroup></CardContent><CardFooter className="mt-5 flex flex-wrap justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" disabled={mutation.isPending || !form.formState.isDirty} onClick={() => { form.reset({ requirements: snapshot.requirements }); setRevision(snapshot.revision); onDirtyChange(false); mutation.reset(); }}>Hủy thay đổi</Button><Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}>{mutation.isPending ? "Đang lưu…" : "Lưu trường bắt buộc"}</Button></CardFooter></form>
    <DisplayLayoutLeaveGuard dirty={form.formState.isDirty} saving={mutation.isPending} />
  </Card>;
}
