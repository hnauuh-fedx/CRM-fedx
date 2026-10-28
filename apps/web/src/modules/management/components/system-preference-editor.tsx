import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { preferenceSchemas, recommendedSystemPreferences, type PreferenceSnapshot, type SystemPreferences } from "@admission-crm/shared/system-preferences";
import { Save, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/modules/auth/auth-context";
import { DisplayLayoutLeaveGuard } from "../display-layout/use-display-layout-leave-guard";
import { preferenceDescriptions, preferenceFields, preferenceLabels, type PreferenceFieldDefinition } from "../system-preference-fields";
import { saveSystemPreference } from "@/services/system-preferences.service";
import { SystemPreferenceHistory } from "./system-preference-history";
import { ManualLeadCreatorsPicker } from "./manual-lead-creators-picker";
const savedDateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

export function SystemPreferenceEditor({ snapshot, programId, onDirtyChange }: { snapshot: PreferenceSnapshot; programId: string; onDirtyChange: (dirty: boolean) => void }) {
  const { accessToken, can } = useAuth();
  const queryClient = useQueryClient();
  const [baseline, setBaseline] = useState(snapshot);
  const [message, setMessage] = useState("");
  const form = useForm<Record<string, unknown>>({ defaultValues: snapshot.value });
  const values = form.watch();
  const mutation = useMutation({
    mutationFn: (value: unknown) => saveSystemPreference(accessToken!, programId, snapshot.section, value, baseline.revision),
    onSuccess: saved => {
      form.reset(saved.value); setBaseline(saved); onDirtyChange(false); setMessage("Đã lưu cấu hình.");
      queryClient.setQueryData<{ institutionProgramId: string; sections: PreferenceSnapshot[] }>(["system-preferences", programId], current => current ? { ...current, sections: current.sections.map(item => item.section === saved.section ? saved : item) } : current);
      void queryClient.invalidateQueries({ queryKey: ["system-preference-history", programId, snapshot.section] });
      if (snapshot.section === "assignment") void queryClient.invalidateQueries({ queryKey: ["leads", "action-options"] });
    },
  });
  function change(key: string, value: unknown) {
    form.setValue(key, value, { shouldDirty: true }); onDirtyChange(JSON.stringify(form.getValues()) !== JSON.stringify(baseline.value)); mutation.reset(); setMessage("");
  }
  return <Card>
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{preferenceLabels[snapshot.section]}</CardTitle><Badge variant="outline">Theo chương trình</Badge></div><CardDescription>{preferenceDescriptions[snapshot.section]}</CardDescription></CardHeader>
    <form onSubmit={form.handleSubmit(value => {
      const parsed = preferenceSchemas[snapshot.section].safeParse(value);
      if (!parsed.success) { parsed.error.issues.forEach(issue => form.setError(String(issue.path[0] ?? "root"), { message: "Vui lòng kiểm tra lựa chọn và giới hạn giá trị." })); return; }
      mutation.mutate(parsed.data);
    })}>
      <CardContent><FieldGroup>
        {snapshot.section === "assignment" && can("automation.manage") && <div className="flex flex-wrap gap-2"><Button type="button" asChild variant="outline"><Link to="/automations">Chọn Sale và cách chia trong Rule Automation</Link></Button><Button type="button" asChild variant="outline"><Link to="/management/sale-work-schedules">Thiết lập giờ làm việc</Link></Button></div>}
        {mutation.isError && <Alert variant="destructive"><AlertTitle>Chưa lưu được cấu hình</AlertTitle><AlertDescription>{mutation.error.message}<Button type="button" variant="outline" disabled={mutation.isPending} onClick={async () => { await queryClient.invalidateQueries({ queryKey: ["system-preferences", programId] }); setMessage("Đã tải dữ liệu mới. Chọn Hủy thay đổi để dùng phiên bản mới nhất."); }}>Tải dữ liệu mới</Button></AlertDescription></Alert>}
        {preferenceFields[snapshot.section].map(definition => <PreferenceControl key={definition.key} definition={definition} value={values[definition.key]} disabled={mutation.isPending} error={form.formState.errors[definition.key]?.message} onChange={value => change(definition.key, value)} />)}
        {snapshot.section === "assignment" && <ManualLeadCreatorsPicker programId={programId} value={(values.manualUnassignedCreatorIds as string[] | undefined) ?? []} disabled={mutation.isPending} error={form.formState.errors.manualUnassignedCreatorIds?.message} onChange={ids => change("manualUnassignedCreatorIds", ids)} />}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </FieldGroup></CardContent>
      <CardFooter className="mt-6 flex flex-wrap justify-between gap-3 border-t pt-5">
        <div className="flex flex-col gap-1 text-xs text-muted-foreground"><span>{form.formState.isDirty ? "Có thay đổi chưa lưu" : "Không có thay đổi chưa lưu"}</span>{baseline.updatedAt && <span>{baseline.updatedBy} · {savedDateFormatter.format(new Date(baseline.updatedAt))}</span>}</div>
        <div className="flex flex-wrap gap-2">
          <SystemPreferenceHistory programId={programId} section={snapshot.section} disabled={mutation.isPending || form.formState.isDirty} onRestore={value => {
            const parsed = preferenceSchemas[snapshot.section].safeParse(value);
            if (!parsed.success) return;
            form.reset(parsed.data, { keepDefaultValues: true }); onDirtyChange(JSON.stringify(form.getValues()) !== JSON.stringify(baseline.value)); mutation.reset(); setMessage("Đã điền giá trị trước đây. Kiểm tra rồi lưu để áp dụng.");
          }} />
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => { form.reset(recommendedSystemPreferences[snapshot.section] as SystemPreferences[typeof snapshot.section], { keepDefaultValues: true }); onDirtyChange(JSON.stringify(form.getValues()) !== JSON.stringify(baseline.value)); mutation.reset(); setMessage("Đã điền bộ khuyến nghị. Kiểm tra rồi lưu để áp dụng."); }}><RotateCcw data-icon="inline-start" />Dùng mẫu khuyến nghị</Button>
          <Button type="button" variant="outline" disabled={mutation.isPending || !form.formState.isDirty} onClick={() => { form.reset(snapshot.value); setBaseline(snapshot); onDirtyChange(false); mutation.reset(); setMessage(""); }}>Hủy thay đổi</Button>
          <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}><Save data-icon="inline-start" />{mutation.isPending ? "Đang lưu…" : "Lưu thay đổi"}</Button>
        </div>
      </CardFooter>
    </form>
    <DisplayLayoutLeaveGuard dirty={form.formState.isDirty} saving={mutation.isPending} />
  </Card>;
}

function PreferenceControl({ definition: field, value, onChange, disabled, error }: { definition: PreferenceFieldDefinition; value: unknown; onChange: (value: unknown) => void; disabled: boolean; error?: string }) {
  const id = `preference-${field.key}`;
  const descriptionId = `${id}-description`;
  const selected = new Set(Array.isArray(value) ? value as string[] : []);
  if (field.kind === "columns") return <FieldSet disabled={disabled}><FieldLegend>{field.label}</FieldLegend><FieldGroup>{field.options?.map(([key, label]) => <Field key={key} orientation="horizontal"><Checkbox id={`${id}-${key}`} checked={selected.has(key)} onCheckedChange={checked => onChange(checked === true ? [...value as string[], key] : (value as string[]).filter(item => item !== key))} /><FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel></Field>)}</FieldGroup><FieldDescription>{field.description}</FieldDescription>{error && <FieldError>{error}</FieldError>}</FieldSet>;
  return <Field data-invalid={Boolean(error)} data-disabled={disabled || field.kind === "fixed"}>
    {field.kind === "boolean" || field.kind === "fixed" ? <Field orientation="horizontal"><Checkbox id={id} checked={value === true} disabled={disabled || field.kind === "fixed"} aria-describedby={field.description ? descriptionId : undefined} onCheckedChange={checked => onChange(checked === true)} /><FieldLabel htmlFor={id}>{field.label}</FieldLabel></Field> : <>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      {field.kind === "number" ? <Input id={id} type="number" min={field.min} max={field.max} value={String(value ?? "")} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={descriptionId} onChange={event => onChange(event.target.value === "" ? "" : Number(event.target.value))} /> : <Select value={String(value)} disabled={disabled} onValueChange={onChange}><SelectTrigger id={id} className="w-full" aria-describedby={descriptionId}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{field.options?.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>}
    </>}
    {field.description && <FieldDescription id={descriptionId}>{field.description}</FieldDescription>}{error && <FieldError>{error}</FieldError>}
  </Field>;
}
