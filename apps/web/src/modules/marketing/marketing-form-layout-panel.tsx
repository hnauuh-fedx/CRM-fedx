import type { UseFormReturn } from "react-hook-form";
import { GripVertical } from "lucide-react";
import { useMarketingFormReorder } from "./use-marketing-form-reorder";
import { moveMarketingFormItems } from "./marketing-form-reorder-model";
import { readMarketingFormLayout, readMarketingFormPlacement, validateMarketingFormLayout, type MarketingFormLayout, type MarketingFormPage } from "@admission-crm/shared/marketing-form-layout";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MarketingFormInput } from "./marketing-reference.types";

// Titles may be temporarily empty while editing; structural errors still stop editing.
function editableLayout(settings: MarketingFormInput["displaySettings"]): MarketingFormLayout {
  const raw = settings?.surveyLayout as MarketingFormLayout | undefined;
  if (!raw) return readMarketingFormLayout(settings);
  const layout = readMarketingFormLayout({ surveyLayout: { ...raw, pages: raw.pages?.map(page => ({ ...page, title: page.title?.trim() ? page.title : "Trang chưa đặt tên" })), groups: raw.groups?.map(group => ({ ...group, title: group.title?.trim() ? group.title : "Nhóm chưa đặt tên" })) } });
  return { ...layout, pages: layout.pages.map((page, index) => ({ ...page, title: raw.pages[index].title })), groups: layout.groups.map((group, index) => ({ ...group, title: raw.groups[index].title })) };
}

export function MarketingFormLayoutPanel({ form, disabled = false }: { form: UseFormReturn<MarketingFormInput>; disabled?: boolean }) {
  const settings = form.watch("displaySettings") ?? {};
  let layout: MarketingFormLayout;
  try { layout = editableLayout(settings); }
  catch { return <p role="alert">Cấu hình trang/nhóm không hợp lệ. Vui lòng kiểm tra cấu hình đã lưu.</p>; }
  return <LayoutEditor form={form} layout={layout} disabled={disabled} />;
}

function LayoutEditor({ form, layout, disabled }: { form: UseFormReturn<MarketingFormInput>; layout: MarketingFormLayout; disabled: boolean }) {
  const fields = form.watch("fields");
  const settings = form.watch("displaySettings") ?? {};
  const issues = validateMarketingFormLayout(settings, fields);
  const reorder = useMarketingFormReorder({ ids: layout.pages.map(page => page.id), label: "trang", lockFirst: true, disabled, onMove: (from, to) => save({ ...layout, pages: moveMarketingFormItems(layout.pages, from, to) }) });
  function save(next: MarketingFormLayout) {
    form.setValue("displaySettings", { ...form.getValues("displaySettings"), surveyLayout: next }, { shouldDirty: true });
    form.clearErrors("displaySettings");
  }
  function move(index: number, direction: -1 | 1) {
    const target = layout.pages[index + direction];
    if (target) reorder.move(layout.pages[index].id, target.id);
  }
  function used(pageId: string, groupId?: string) {
    return fields.some(field => {
      try { const placement = readMarketingFormPlacement(field, layout); return placement.pageId === pageId && (!groupId || placement.groupId === groupId); }
      catch { return true; }
    });
  }
  return <section aria-label="Trang và nhóm câu hỏi" className="my-4 flex flex-col gap-4 rounded-lg border bg-background p-4">
    <h3 className="font-semibold">Trang và nhóm câu hỏi</h3>
    <p className="text-sm text-muted-foreground">Câu hỏi chưa chọn vị trí nằm ở trang đầu. Trang đầu được giữ cố định. Chỉ xóa được trang/nhóm trống; câu hỏi không nằm trong nhóm hiển thị trước các nhóm.</p>
    <p id={reorder.instructionsId} className="text-sm text-muted-foreground">Kéo tay nắm trang lên trang khác để đổi thứ tự, hoặc dùng Alt + ↑/↓ và nút Lên/Xuống. Trang đầu không thể kéo.</p>
    <p role="status" aria-live="polite" className="min-h-16 text-sm text-muted-foreground sm:min-h-6">{reorder.announcement}</p>
    {issues.map(issue => <p key={issue.path.join(".")} role="alert" className="text-sm text-destructive">{issue.message}</p>)}
    {layout.pages.map((page, index) => <section key={page.id} {...reorder.itemProps(page.id)} className="flex flex-col gap-3 rounded-md border p-3 data-[reorder-over=true]:outline-2 data-[reorder-over=true]:outline-ring" aria-label={`Trang ${index + 1}`}>
      <Button type="button" variant="outline" size="sm" className="min-h-11 cursor-grab self-start active:cursor-grabbing" {...reorder.handleProps(page.id)} aria-label={`Kéo trang ${index + 1} để đổi thứ tự`}><GripVertical data-icon="inline-start" aria-hidden="true" />Đổi thứ tự trang {index + 1}</Button>
      <SectionFields item={page} prefix={`layout-page-${page.id}`} onChange={patch => save({ ...layout, pages: layout.pages.map(item => item.id === page.id ? { ...item, ...patch } : item) })} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || index <= 1} onClick={() => move(index, -1)} aria-label={`Đưa trang ${index + 1} lên`}>Lên</Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || index === 0 || index === layout.pages.length - 1} onClick={() => move(index, 1)} aria-label={`Đưa trang ${index + 1} xuống`}>Xuống</Button>
        <Button type="button" variant="destructive" size="sm" disabled={index === 0 || used(page.id) || layout.groups.some(group => group.pageId === page.id)} onClick={() => save({ ...layout, pages: layout.pages.filter(item => item.id !== page.id) })}>Xóa trang {index + 1}</Button>
        <Button type="button" variant="outline" size="sm" disabled={layout.groups.length >= 50} onClick={() => save({ ...layout, groups: [...layout.groups, { id: crypto.randomUUID(), pageId: page.id, title: `Nhóm ${layout.groups.length + 1}` }] })}>Thêm nhóm vào trang {index + 1}</Button>
      </div>
      {layout.groups.filter(group => group.pageId === page.id).map(group => <div key={group.id} className="flex flex-col gap-3 border-l-2 pl-3">
        <SectionFields item={group} prefix={`layout-group-${group.id}`} onChange={patch => save({ ...layout, groups: layout.groups.map(item => item.id === group.id ? { ...item, ...patch } : item) })} />
        <Button type="button" variant="destructive" size="sm" disabled={used(page.id, group.id)} onClick={() => save({ ...layout, groups: layout.groups.filter(item => item.id !== group.id) })}>Xóa nhóm {group.title}</Button>
      </div>)}
    </section>)}
    <Button type="button" variant="outline" disabled={layout.pages.length >= 20} onClick={() => save({ ...layout, pages: [...layout.pages, { id: crypto.randomUUID(), title: `Trang ${layout.pages.length + 1}` }] })}>Thêm trang</Button>
    <h4 className="font-medium">Vị trí câu hỏi</h4>
    {fields.map((field, index) => <QuestionPlacement key={field.fieldKey} form={form} layout={layout} index={index} />)}
  </section>;
}

function SectionFields({ item, prefix, onChange }: { item: MarketingFormPage; prefix: string; onChange: (patch: Partial<MarketingFormPage>) => void }) {
  return <FieldGroup className="gap-3"><Field data-invalid={!item.title.trim()}><FieldLabel htmlFor={`${prefix}-title`}>Tên trang/nhóm</FieldLabel><Input id={`${prefix}-title`} value={item.title} maxLength={120} aria-invalid={!item.title.trim()} onChange={event => onChange({ title: event.target.value })} /><FieldError>{!item.title.trim() ? "Vui lòng nhập tên trang/nhóm." : undefined}</FieldError></Field><Field><FieldLabel htmlFor={`${prefix}-description`}>Mô tả trang/nhóm</FieldLabel><Textarea id={`${prefix}-description`} rows={2} maxLength={1000} value={item.description ?? ""} onChange={event => onChange({ description: event.target.value })} /></Field></FieldGroup>;
}

function QuestionPlacement({ form, layout, index }: { form: UseFormReturn<MarketingFormInput>; layout: MarketingFormLayout; index: number }) {
  const field = form.watch(`fields.${index}`);
  let placement;
  try { placement = readMarketingFormPlacement(field, layout); }
  catch { return <p role="alert">{field.label}: vị trí câu hỏi không hợp lệ.</p>; }
  function setPlacement(pageId: string, groupId?: string) {
    form.setValue(`fields.${index}.validationRules`, { ...form.getValues(`fields.${index}.validationRules`), formLayout: { pageId, ...(groupId ? { groupId } : {}) } }, { shouldDirty: true });
    form.clearErrors(`fields.${index}.validationRules`);
  }
  return <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2"><p className="break-words text-sm font-medium sm:col-span-2">{index + 1}. {field.label}</p>
    <Field><FieldLabel htmlFor={`question-page-${index}`}>Trang câu hỏi {index + 1}</FieldLabel><Select value={placement.pageId} onValueChange={value => setPlacement(value)}><SelectTrigger id={`question-page-${index}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{layout.pages.map(page => <SelectItem key={page.id} value={page.id}>{page.title || "Trang chưa đặt tên"}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel htmlFor={`question-group-${index}`}>Nhóm câu hỏi {index + 1}</FieldLabel><Select value={placement.groupId ?? "__none__"} onValueChange={value => setPlacement(placement.pageId, value === "__none__" ? undefined : value)}><SelectTrigger id={`question-group-${index}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__">Không thuộc nhóm</SelectItem>{layout.groups.filter(group => group.pageId === placement.pageId).map(group => <SelectItem key={group.id} value={group.id}>{group.title || "Nhóm chưa đặt tên"}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  </div>;
}
