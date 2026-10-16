import { useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { describeMarketingFormAnswers } from "@admission-crm/shared/marketing-form-snapshot";
import { allowsMarketingFormOther, isMarketingFormOtherAnswer, marketingFormOtherSentinel, validateMarketingFormOther } from "@admission-crm/shared/marketing-form-config";
import { readMarketingFormLayout, readMarketingFormPlacement, validateMarketingFormLayout, type MarketingFormLayout } from "@admission-crm/shared/marketing-form-layout";
import { validateMarketingFormVisibility, resolveMarketingFormVisibleKeys, stripHiddenMarketingFormAnswers } from "@admission-crm/shared/marketing-form-visibility";
import { Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PublicMarketingFormConfig } from "./marketing-reference.types";
import { normalizeMarketingFormOptions, readMarketingFormRatingMax, validateMarketingFormRatings, readMarketingFormQuestionDescription, validateMarketingFormQuestionDescriptions, type MarketingFormOption } from "@admission-crm/shared/marketing-form-config";
import { type MarketingFormPublicValues, type MarketingFormPublicValue } from "./marketing-form-public-values";
import { getFieldDependency, getEffectiveFieldOptions, marketingFormDefaults, reconcileMarketingFormValues, validateMarketingFormValues } from "./marketing-form-fill-model";
type Values = MarketingFormPublicValues;
type PublicFieldConfig = PublicMarketingFormConfig["fields"][number];
type FillProps = { form: PublicMarketingFormConfig } & ({ mode: "preview" } | { mode: "public"; onSubmit: (values: Values) => void; isPending: boolean; error?: string });
export function MarketingFormFill(props: FillProps) {
  const issues = [...validateMarketingFormLayout(props.form.displaySettings, props.form.fields), ...validateMarketingFormVisibility(props.form.fields), ...validateMarketingFormQuestionDescriptions(props.form.fields), ...validateMarketingFormRatings(props.form.fields), ...validateMarketingFormOther(props.form.fields)];
  if (issues.length) return <p role="alert">Cấu hình câu hỏi hoặc trang/nhóm chưa hợp lệ. Vui lòng kiểm tra cấu hình biểu mẫu.</p>;
  return <ValidMarketingFormFill {...props} layout={readMarketingFormLayout(props.form.displaySettings)} />;
}
function ValidMarketingFormFill(props: FillProps & { layout: MarketingFormLayout }) {
  const { form } = props;
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [previewComplete, setPreviewComplete] = useState(false);
  const [requestedPageIndex, setPageIndex] = useState(0);
  const pageIndex = Math.min(requestedPageIndex, props.layout.pages.length - 1);
  const root = useRef<HTMLFormElement>(null);
  const focusRequest = useRef(0);
  const defaults = useMemo(() => marketingFormDefaults(form.fields), [form.fields]);
  const current = reconcileMarketingFormValues(form.fields, { ...defaults, ...values });
  const pending = props.mode === "public" && props.isPending;
  const page = props.layout.pages[pageIndex];
  const pageFields = form.fields.filter(field => readMarketingFormPlacement(field, props.layout).pageId === page.id);
  const lastPage = pageIndex === props.layout.pages.length - 1;
  function focusAfterRender(selector: string) {
    const previousFocus = root.current?.ownerDocument.activeElement;
    const request = ++focusRequest.current;
    requestAnimationFrame(() => {
      const formElement = root.current;
      if (!formElement || request !== focusRequest.current) return;
      const active = formElement.ownerDocument.activeElement;
      // A delayed page/validation focus must not interrupt a newer answer.
      if (active !== previousFocus && active !== formElement.ownerDocument.body) return;
      formElement.querySelector<HTMLElement>(selector)?.focus();
    });
  }
  function changePage(next: number) {
    setPageIndex(next);
    focusAfterRender('[data-page-heading]');
  }
  function updateValue(key: string, value: MarketingFormPublicValue) {
    focusRequest.current += 1;
    setValues(previous => reconcileMarketingFormValues(form.fields, { ...defaults, ...previous, [key]: value }));
    const visible = resolveMarketingFormVisibleKeys(form.fields, reconcileMarketingFormValues(form.fields, { ...current, [key]: value }));
    setErrors(previous => Object.fromEntries(Object.entries(previous).filter(([errorKey]) => errorKey !== key && visible.has(errorKey)))); setConfirming(false);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); event.stopPropagation();
    if (pending) return;
    const payload = reconcileMarketingFormValues(form.fields, current);
    const nextErrors = validateMarketingFormValues(lastPage || confirming ? form.fields : pageFields, payload, form.fields);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const invalid = form.fields.find(field => nextErrors[field.fieldKey]);
      if (invalid) setPageIndex(props.layout.pages.findIndex(item => item.id === readMarketingFormPlacement(invalid, props.layout).pageId));
      setConfirming(false);
      focusAfterRender('[aria-invalid="true"]');
      return;
    }
    if (!lastPage && !confirming) { changePage(pageIndex + 1); return; }
    if (form.displaySettings?.confirmBeforeSubmit === true && !confirming) { setConfirming(true); return; }
    if (props.mode === "preview") setPreviewComplete(true);
    else props.onSubmit(stripHiddenMarketingFormAnswers(form.fields, payload));
  }
  if (previewComplete) return <div role="status" className="flex flex-col gap-4 rounded-lg border bg-background p-6"><p>Kiểm tra thành công. Không gửi API, không lưu phản hồi, không tạo Lead hoặc phát automation.</p><Button type="button" variant="outline" onClick={() => { setPreviewComplete(false); setConfirming(false); setPageIndex(0); }}>Thử lại</Button></div>;
  return <FillView props={props} root={root} current={current} values={values} errors={errors} confirming={confirming} pageIndex={pageIndex} pending={pending} submit={submit} changePage={changePage} updateValue={updateValue} onEdit={() => { setConfirming(false); focusAfterRender('[data-page-heading]'); }} />;
}
type FillViewProps = {
  props: FillProps & { layout: MarketingFormLayout }; root: RefObject<HTMLFormElement | null>;
  current: Values; values: Values; errors: Record<string, string>; confirming: boolean; pageIndex: number; pending: boolean;
  submit: (event: FormEvent<HTMLFormElement>) => void; changePage: (index: number) => void;
  updateValue: (key: string, value: MarketingFormPublicValue) => void; onEdit: () => void;
};
function FillView({ props, root, current, values, errors, confirming, pageIndex, pending, submit, changePage, updateValue, onEdit }: FillViewProps) {
  const { form } = props;
  const page = props.layout.pages[pageIndex];
  const lastPage = pageIndex === props.layout.pages.length - 1;
  return <form ref={root} onSubmit={submit} className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl bg-background p-6 text-foreground shadow-xl sm:p-8">
    <FillIntro props={props} hasErrors={Object.values(errors).some(Boolean)} />
    {confirming ? <AnswerConfirmation form={form} current={current} pending={pending} onEdit={onEdit} /> : <fieldset disabled={pending} className="flex flex-col gap-4">
      <input type="text" tabIndex={-1} autoComplete="off" className="hidden" value={typeof values.website === "string" ? values.website : ""} onChange={event => updateValue("website", event.target.value)} aria-hidden="true" />
      <div className="flex flex-col gap-2">{props.layout.pages.length > 1 && <p role="status" className="text-sm text-muted-foreground">Trang {pageIndex + 1} / {props.layout.pages.length}</p>}<h3 data-page-heading tabIndex={-1} className="break-words font-medium focus-visible:outline-2 focus-visible:outline-ring">{page.title}</h3>{page.description && <p className="text-sm text-muted-foreground">{page.description}</p>}</div>
      <PageQuestions form={form} layout={props.layout} pageId={page.id} values={current} errors={errors} onChange={updateValue} />
    </fieldset>}
    {!confirming && pageIndex > 0 && <Button type="button" variant="outline" disabled={pending} onClick={() => changePage(pageIndex - 1)}>Trang trước</Button>}
    <Button type="submit" size="lg" className="min-h-12" disabled={pending}>
      {pending && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
      {pending ? "Đang gửi..." : confirming ? "Xác nhận gửi" : !lastPage ? "Tiếp tục" : form.submitButtonLabel}
    </Button>
  </form>;
}
function FillIntro({ props, hasErrors }: { props: FillProps; hasErrors: boolean }) {
  const { form } = props;
  return <><header className="text-center"><h2 className="text-2xl font-semibold" style={{ color: form.primaryColor }}>{form.title}</h2>{form.subtitle && <p>{form.subtitle}</p>}{form.description && <p className="mt-2 text-sm text-muted-foreground">{form.description}</p>}</header>
    {props.mode === "preview" && <p role="status" className="text-sm text-muted-foreground">Xem thử cấu hình chưa lưu — không ghi dữ liệu CRM.</p>}
    {props.mode === "public" && props.error && <p role="alert" className="text-sm text-destructive">{props.error}</p>}
    {hasErrors && <p role="alert" className="text-sm text-destructive">Vui lòng kiểm tra các câu trả lời được đánh dấu bên dưới.</p>}</>;
}
function AnswerConfirmation({ form, current, pending, onEdit }: { form: PublicMarketingFormConfig; current: Values; pending: boolean; onEdit: () => void }) {
  const visible = resolveMarketingFormVisibleKeys(form.fields, current);
  const answers = Object.fromEntries(form.fields.filter(field => field.fieldType !== "hidden" && visible.has(field.fieldKey)).map(field => [field.fieldKey, current[field.fieldKey]]));
  const snapshotFields = form.fields.map(field => ({ ...field, mapping: null, options: normalizeMarketingFormOptions(field.options), validationRules: field.validationRules ?? {}, defaultValue: field.defaultValue ?? null }));
  return <section aria-label="Xác nhận câu trả lời" className="flex flex-col gap-3"><h3 className="font-medium">Kiểm tra câu trả lời trước khi gửi</h3><dl className="flex flex-col gap-3 break-words">{describeMarketingFormAnswers(answers, { fields: snapshotFields }).map(item => <div key={item.fieldKey}><dt className="font-medium">{item.label}</dt><dd>{item.answer}</dd></div>)}</dl><Button type="button" variant="outline" disabled={pending} onClick={onEdit}>Quay lại chỉnh sửa</Button></section>;
}
function PageQuestions({ form, layout, pageId, values, errors, onChange }: { form: PublicMarketingFormConfig; layout: MarketingFormLayout; pageId: string; values: Values; errors: Record<string, string>; onChange: (key: string, value: MarketingFormPublicValue) => void }) {
  const visible = resolveMarketingFormVisibleKeys(form.fields, values);
  const fields = form.fields.filter(field => visible.has(field.fieldKey) && readMarketingFormPlacement(field, layout).pageId === pageId);
  function renderFields(groupId?: string) {
    return fields.filter(field => readMarketingFormPlacement(field, layout).groupId === groupId).map((field, index) => <PublicField key={field.fieldKey} field={field} options={getEffectiveFieldOptions(field, form.fields, values)} dependencyWaiting={Boolean(getFieldDependency(field.validationRules) && !values[getFieldDependency(field.validationRules)!.parentFieldKey])} value={values[field.fieldKey] ?? ""} error={errors[field.fieldKey]} wide={index === 0 || field.fieldType === "textarea" || field.fieldKey.includes("address")} onChange={value => onChange(field.fieldKey, value)} />);
  }
  return <FieldGroup className="grid gap-3 sm:grid-cols-2">{renderFields()}{layout.groups.filter(group => group.pageId === pageId && fields.some(field => readMarketingFormPlacement(field, layout).groupId === group.id)).map(group => <FieldSet key={group.id} className="rounded-lg border p-3 sm:col-span-2"><FieldLegend>{group.title}</FieldLegend>{group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}<FieldGroup className="grid gap-3 sm:grid-cols-2">{renderFields(group.id)}</FieldGroup></FieldSet>)}</FieldGroup>;
}
type PublicFieldProps = {
  field: PublicFieldConfig;
  options: MarketingFormOption[];
  dependencyWaiting: boolean;
  value: MarketingFormPublicValue;
  error?: string;
  wide: boolean;
  onChange: (value: MarketingFormPublicValue) => void;
};
function PublicField(props: PublicFieldProps) {
  const { field, value, onChange } = props;
  const textValue = typeof value === "string" ? value : "";
  const id = `public-field-${field.fieldKey}`;
  if (field.fieldType === "hidden") {
    return <input type="hidden" id={id} value={textValue} onChange={(event) => onChange(event.target.value)} />;
  }
  if (field.fieldType === "rating") return <PublicRatingField {...props} />;
  if (allowsMarketingFormOther(field.validationRules)) return <PublicOtherChoiceField {...props} />;
  if (["select", "single_select", "province"].includes(field.fieldType)) return <PublicSelectField {...props} />;
  if (["radio", "checkbox", "multi_select"].includes(field.fieldType)) return <PublicChoiceField {...props} />;
  return <PublicTextField {...props} />;
}

function PublicOtherChoiceField(props: PublicFieldProps) {
  const selected = isMarketingFormOtherAnswer(props.value);
  const id = `public-other-${props.field.fieldKey}`;
  const controls = { ...props, value: selected ? marketingFormOtherSentinel : props.value, error: selected ? undefined : props.error, options: [...props.options, { value: marketingFormOtherSentinel, label: "Khác" }], onChange: (next: MarketingFormPublicValue) => props.onChange(next === marketingFormOtherSentinel ? { kind: "other", text: "" } : next) };
  return <>
    {props.field.fieldType === "radio" ? <PublicChoiceField {...controls} /> : <PublicSelectField {...controls} />}
    {selected && <Field className="col-span-full min-w-0" data-invalid={Boolean(props.error)}>
      <FieldLabel htmlFor={id}>Nội dung Khác — {props.field.label} *</FieldLabel>
      <Textarea id={id} rows={3} maxLength={1000} value={isMarketingFormOtherAnswer(props.value) ? props.value.text : ""} aria-invalid={Boolean(props.error)} aria-describedby={`${id}-hint ${id}-error`} onChange={event => props.onChange({ kind: "other", text: event.target.value })} />
      <FieldDescription id={`${id}-hint`}>Vui lòng nhập nội dung, tối đa 1.000 ký tự. Chọn đáp án khác sẽ xóa nội dung này.</FieldDescription>
      <FieldError id={`${id}-error`}>{props.error}</FieldError>
    </Field>}
  </>;
}
function questionDescriptionIds(field: PublicFieldConfig) {
  const id = `public-field-${field.fieldKey}`;
  return readMarketingFormQuestionDescription(field.validationRules) ? `${id}-description ${id}-error` : `${id}-error`;
}
function PublicQuestionDescription({ field }: { field: PublicFieldConfig }) {
  const description = readMarketingFormQuestionDescription(field.validationRules);
  if (!description) return null;
  return <FieldDescription id={`public-field-${field.fieldKey}-description`} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{description}</FieldDescription>;
}
function PublicRatingField({ field, value, error, onChange }: PublicFieldProps) {
  const id = `public-field-${field.fieldKey}`;
  const max = readMarketingFormRatingMax(field.validationRules);
  return <Field className="sm:col-span-2" data-invalid={Boolean(error)}>
    <FieldSet id={id} tabIndex={-1} aria-invalid={Boolean(error)} aria-describedby={questionDescriptionIds(field)} className="rounded-2xl border p-3 focus-visible:outline-2 focus-visible:outline-ring">
      <FieldLegend variant="label">{field.label}{field.isRequired ? " *" : ""}</FieldLegend>
      <PublicQuestionDescription field={field} />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: max }, (_, index) => index + 1).map(score => <label key={score} className="relative cursor-pointer">
          <input className="peer sr-only" type="radio" name={field.fieldKey} value={score} aria-label={`${score} trên ${max} sao`} aria-describedby={questionDescriptionIds(field)} checked={value === String(score)} onChange={() => onChange(String(score))} />
          <span className="flex min-h-11 min-w-11 flex-col items-center justify-center rounded-md border border-input px-2 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-ring">
            <Star aria-hidden="true" className="size-5" /><span>{score}</span>
          </span>
        </label>)}
      </div>
      <p role="status" className="text-sm text-muted-foreground">{value ? `Đã chọn ${value} / ${max} sao` : "Chưa đánh giá"}</p>
      <Button type="button" variant="outline" disabled={!value} onClick={() => onChange("")}>Xóa đánh giá</Button>
    </FieldSet>
    <FieldError id={`${id}-error`}>{error}</FieldError>
  </Field>;
}
function PublicSelectField({ field, options, dependencyWaiting, value, error, wide, onChange }: PublicFieldProps) {
  const id = `public-field-${field.fieldKey}`;
  const textValue = typeof value === "string" ? value : "";
  const placeholder = dependencyWaiting ? "Vui lòng chọn câu hỏi liên quan trước" : field.placeholder ?? field.label;
  return (
      <Field className={wide ? "sm:col-span-2" : ""} data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={id} >{field.label}</FieldLabel>
        <PublicQuestionDescription field={field} />
        <Select value={textValue || "__empty__"} onValueChange={(next) => onChange(next === "__empty__" ? "" : next)}>
          <SelectTrigger id={id} className="min-h-12 rounded-full border-slate-200 bg-white px-4" aria-invalid={Boolean(error)} aria-describedby={questionDescriptionIds(field)}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
            <SelectItem value="__empty__">{placeholder}</SelectItem>
            {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldError id={`${id}-error`}>{error}</FieldError>
      </Field>
    );
}

function PublicTextField({ field, value, error, wide, onChange }: PublicFieldProps) {
  const id = `public-field-${field.fieldKey}`;
  const textValue = typeof value === "string" ? value : "";
  const className = wide ? "sm:col-span-2" : "";
  if (field.fieldType === "textarea") {
    return (
      <Field className={className} data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={id} >{field.label}</FieldLabel>
        <PublicQuestionDescription field={field} />
        <Textarea id={id} rows={3} value={textValue} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder ?? field.label} aria-invalid={Boolean(error)} aria-describedby={questionDescriptionIds(field)} className="rounded-2xl border-slate-200" />
        <FieldError id={`${id}-error`}>{error}</FieldError>
      </Field>
    );
  }
  return (
    <Field className={className} data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id} >{field.label}</FieldLabel>
      <PublicQuestionDescription field={field} />
      <Input id={id} type={field.fieldType === "phone" ? "tel" : field.fieldType === "date" ? "date" : field.fieldType === "file" ? "file" : field.fieldType} value={field.fieldType === "file" ? undefined : textValue} onChange={(event) => onChange(field.fieldType === "file" ? event.target.files?.[0]?.name ?? "" : event.target.value)} placeholder={field.placeholder ?? field.label} aria-invalid={Boolean(error)} aria-describedby={questionDescriptionIds(field)} className="min-h-12 rounded-full border-slate-200 px-4" />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}

function PublicChoiceField({ field, options, dependencyWaiting, value, error, wide, onChange }: PublicFieldProps) {
  const id = `public-field-${field.fieldKey}`;
  const multiple = field.fieldType !== "radio";
  const selected = new Set(Array.isArray(value) ? value : []);
  return (
    <Field className={wide ? "sm:col-span-2" : ""} data-invalid={Boolean(error)}>
      <FieldSet id={id} tabIndex={-1} aria-invalid={Boolean(error)} aria-describedby={questionDescriptionIds(field)} className="rounded-2xl border p-3 focus-visible:outline-2 focus-visible:outline-ring">
        <FieldLegend variant="label">{field.label}</FieldLegend>
        <PublicQuestionDescription field={field} />
        <FieldGroup className="gap-2">
          {dependencyWaiting && <p className="text-sm text-muted-foreground">Vui lòng chọn câu hỏi liên quan trước.</p>}
          {options.map(option => (
            <label key={option.value} className="flex min-h-11 items-center gap-2 text-sm">
              <input type={multiple ? "checkbox" : "radio"} value={option.value} aria-describedby={questionDescriptionIds(field)} name={multiple ? undefined : field.fieldKey} checked={multiple ? selected.has(option.value) : value === option.value} onChange={event => {
                if (!multiple) { onChange(option.value); return; }
                const next = new Set(selected);
                if (event.target.checked) next.add(option.value);
                else next.delete(option.value);
                onChange(Array.from(next));
              }} />
              {option.label}
            </label>
          ))}
        </FieldGroup>
      </FieldSet>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}
