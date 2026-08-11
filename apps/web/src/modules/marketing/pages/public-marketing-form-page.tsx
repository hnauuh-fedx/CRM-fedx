import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/services/api";
import { getPublicMarketingForm, submitPublicMarketingForm } from "@/services/marketing-reference.service";
import type { PublicMarketingFormConfig } from "../marketing-reference.types";

type Values = Record<string, string>;
type Errors = Record<string, string>;
type PublicFieldConfig = PublicMarketingFormConfig["fields"][number];
type FieldDependencyConfig = {
  parentFieldKey: string;
  optionMap: Record<string, string[]>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getFieldDependency(validationRules: unknown): FieldDependencyConfig | null {
  const dependency = asRecord(asRecord(validationRules).dependency);
  const parentFieldKey = typeof dependency.parentFieldKey === "string" ? dependency.parentFieldKey : "";
  const rawOptionMap = asRecord(dependency.optionMap);
  if (!parentFieldKey) return null;
  const optionMap: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(rawOptionMap)) {
    optionMap[key] = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }
  return { parentFieldKey, optionMap };
}

function getEffectiveFieldOptions(field: PublicFieldConfig, fields: PublicFieldConfig[], values: Values) {
  const dependency = getFieldDependency(field.validationRules);
  if (!dependency) return field.options;
  const parentValue = values[dependency.parentFieldKey] ?? "";
  if (!parentValue) return [];
  return dependency.optionMap[parentValue] ?? [];
}

function isValueAllowed(value: string, options: string[], multiple: boolean) {
  if (!value) return true;
  if (multiple) return value.split(",").filter(Boolean).every((item) => options.includes(item));
  return options.includes(value);
}

export function PublicMarketingFormPage() {
  const { publicKey = "" } = useParams();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get("embed") === "1";
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Errors>({});
  const formQuery = useQuery({
    queryKey: ["public-marketing-form", publicKey],
    queryFn: () => getPublicMarketingForm(publicKey),
    enabled: Boolean(publicKey),
  });
  const submitMutation = useMutation({
    mutationFn: (payload: Values) => submitPublicMarketingForm(publicKey, payload),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["public-marketing-form", publicKey] });
      if (result.redirectUrl) window.location.assign(result.redirectUrl);
    },
  });
  const form = formQuery.data;
  const fieldDefaults = useMemo(() => {
    const defaults: Values = {};
    for (const field of form?.fields ?? []) defaults[field.fieldKey] = field.defaultValue ?? "";
    return defaults;
  }, [form?.fields]);

  function updateValue(fieldKey: string, value: string) {
    setValues((current) => {
      if (!form) return { ...current, [fieldKey]: value };
      const next = { ...fieldDefaults, ...current, [fieldKey]: value };
      for (const field of form.fields) {
        const dependency = getFieldDependency(field.validationRules);
        if (dependency?.parentFieldKey !== fieldKey) continue;
        const effectiveOptions = getEffectiveFieldOptions(field, form.fields, next);
        const currentValue = next[field.fieldKey] ?? "";
        const multiple = field.fieldType === "checkbox" || field.fieldType === "multi_select";
        if (!isValueAllowed(currentValue, effectiveOptions, multiple)) next[field.fieldKey] = "";
      }
      return next;
    });
    setErrors((current) => ({ ...current, [fieldKey]: "" }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const nextErrors: Errors = {};
    const submitValues = { ...fieldDefaults, ...values };
    for (const field of form.fields) {
      const value = submitValues[field.fieldKey] ?? "";
      const effectiveOptions = getEffectiveFieldOptions(field, form.fields, submitValues);
      if (field.isRequired && !value.trim()) {
        nextErrors[field.fieldKey] = `Vui lòng nhập ${field.label.toLowerCase()}.`;
      } else if (optionFieldTypes.has(field.fieldType) && !isValueAllowed(value, effectiveOptions, field.fieldType === "checkbox" || field.fieldType === "multi_select")) {
        nextErrors[field.fieldKey] = `${field.label} không nằm trong lựa chọn hợp lệ.`;
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    submitMutation.mutate({ ...submitValues, website: "" });
  }

  if (formQuery.isLoading) {
    return <PublicShell isEmbed={isEmbed}><p className="text-center text-sm text-white/85">Đang tải biểu mẫu…</p></PublicShell>;
  }
  if (formQuery.isError || !form) {
    return <PublicShell isEmbed={isEmbed}><p className="text-center text-sm text-white/85">Biểu mẫu không khả dụng hoặc đã ngừng nhận thông tin.</p></PublicShell>;
  }
  if (submitMutation.isSuccess) {
    const successMessage = submitMutation.data.message || form.successSettings?.message as string | undefined;
    return (
      <PublicShell backgroundColor={form.backgroundColor} isEmbed={isEmbed}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center text-slate-900 shadow-2xl">
          <CheckCircle2 className="size-12 text-emerald-600" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Đã gửi thông tin</h1>
          <p className="text-sm text-slate-600">{successMessage || "Cảm ơn Quý Anh, Chị. Cán bộ tư vấn tuyển sinh sẽ liên hệ trong thời gian sớm nhất."}</p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell backgroundColor={form.backgroundColor} isEmbed={isEmbed}>
      <form className="mx-auto grid w-full max-w-md gap-4 rounded-2xl bg-white p-6 text-slate-900 shadow-2xl sm:p-8" onSubmit={handleSubmit}>
        <PublicHeader form={form} />
        {submitMutation.isError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitMutation.error instanceof ApiError ? submitMutation.error.message : "Không thể gửi thông tin. Vui lòng thử lại."}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="text" tabIndex={-1} autoComplete="off" className="hidden" value={values.website ?? ""} onChange={(event) => updateValue("website", event.target.value)} aria-hidden="true" />
          {form.fields.map((field, index) => {
            const currentValues = { ...fieldDefaults, ...values };
            const effectiveOptions = getEffectiveFieldOptions(field, form.fields, currentValues);
            const dependency = getFieldDependency(field.validationRules);
            return (
              <PublicField
                key={field.fieldKey}
                field={field}
                options={effectiveOptions}
                dependencyWaiting={Boolean(dependency && !currentValues[dependency.parentFieldKey])}
                value={values[field.fieldKey] ?? fieldDefaults[field.fieldKey] ?? ""}
                error={errors[field.fieldKey]}
                wide={index === 0 || field.fieldType === "textarea" || field.fieldKey.includes("address")}
                onChange={(value) => updateValue(field.fieldKey, value)}
              />
            );
          })}
        </div>
        <Button type="submit" size="lg" className="mt-2 min-h-12 rounded-full font-bold text-white hover:opacity-90" style={{ backgroundColor: form.primaryColor ?? "#0f62fe" }} disabled={submitMutation.isPending}>
          {submitMutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {submitMutation.isPending ? "Đang gửi..." : form.submitButtonLabel}
        </Button>
      </form>
    </PublicShell>
  );
}

function PublicShell({ children, backgroundColor, isEmbed = false }: { children: ReactNode; backgroundColor?: string; isEmbed?: boolean }) {
  return (
    <main className={`flex ${isEmbed ? "min-h-170" : "min-h-dvh"} items-center justify-center px-4 ${isEmbed ? "py-4" : "py-8"}`} style={{ backgroundColor: backgroundColor ?? "#08366f" }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(255,255,255,0.22),transparent_28%),linear-gradient(135deg,rgba(0,0,0,0.28),transparent_38%)]" aria-hidden="true" />
      <div className="relative w-full">{children}</div>
    </main>
  );
}

function PublicHeader({ form }: { form: PublicMarketingFormConfig }) {
  return (
    <header className="mb-1 text-center">
      <h1 className="text-3xl font-extrabold uppercase tracking-normal" style={{ color: form.primaryColor ?? "#08366f" }}>{form.title}</h1>
      {form.subtitle && <p className="mt-1 text-base font-semibold text-slate-700">{form.subtitle}</p>}
      {form.description && <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{form.description}</p>}
    </header>
  );
}

const optionFieldTypes = new Set<PublicFieldConfig["fieldType"]>(["select", "single_select", "multi_select", "radio", "checkbox"]);

function PublicField({ field, options, dependencyWaiting, value, error, wide, onChange }: {
  field: PublicFieldConfig;
  options: string[];
  dependencyWaiting: boolean;
  value: string;
  error?: string;
  wide: boolean;
  onChange: (value: string) => void;
}) {
  const id = `public-field-${field.fieldKey}`;
  const className = wide ? "sm:col-span-2" : "";
  if (field.fieldType === "hidden") {
    return <input type="hidden" id={id} value={value} onChange={(event) => onChange(event.target.value)} />;
  }
  if (field.fieldType === "select" || field.fieldType === "single_select" || field.fieldType === "province") {
    return (
      <Field className={className} data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={id} className="sr-only">{field.label}</FieldLabel>
        <Select value={value || "__empty__"} onValueChange={(next) => onChange(next === "__empty__" ? "" : next)}>
          <SelectTrigger id={id} className="min-h-12 rounded-full border-slate-200 bg-white px-4" aria-invalid={Boolean(error)}>
            <SelectValue placeholder={dependencyWaiting ? "Vui lòng chọn câu hỏi liên quan trước" : field.placeholder ?? field.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">{dependencyWaiting ? "Vui lòng chọn câu hỏi liên quan trước" : field.placeholder ?? field.label}</SelectItem>
            {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
          </SelectContent>
        </Select>
        <FieldError>{error}</FieldError>
      </Field>
    );
  }
  if (field.fieldType === "textarea") {
    return (
      <Field className={className} data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={id} className="sr-only">{field.label}</FieldLabel>
        <Textarea id={id} rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder ?? field.label} aria-invalid={Boolean(error)} className="rounded-2xl border-slate-200" />
        <FieldError>{error}</FieldError>
      </Field>
    );
  }
  if (field.fieldType === "radio") {
    return (
      <Field className={className} data-invalid={Boolean(error)}>
        <FieldLabel>{field.label}</FieldLabel>
        <div className="grid gap-2 rounded-2xl border border-slate-200 p-3">
          {dependencyWaiting && <p className="text-sm text-slate-500">Vui lòng chọn câu hỏi liên quan trước.</p>}
          {options.map((option) => (
            <label key={option} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="radio" name={field.fieldKey} checked={value === option} onChange={() => onChange(option)} />
              {option}
            </label>
          ))}
        </div>
        <FieldError>{error}</FieldError>
      </Field>
    );
  }
  if (field.fieldType === "checkbox" || field.fieldType === "multi_select") {
    const selected = new Set(value.split(",").filter(Boolean));
    return (
      <Field className={className} data-invalid={Boolean(error)}>
        <FieldLabel>{field.label}</FieldLabel>
        <div className="grid gap-2 rounded-2xl border border-slate-200 p-3">
          {dependencyWaiting && <p className="text-sm text-slate-500">Vui lòng chọn câu hỏi liên quan trước.</p>}
          {options.map((option) => (
            <label key={option} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.has(option)} onChange={(event) => {
                const next = new Set(selected);
                if (event.target.checked) next.add(option);
                else next.delete(option);
                onChange(Array.from(next).join(","));
              }} />
              {option}
            </label>
          ))}
        </div>
        <FieldError>{error}</FieldError>
      </Field>
    );
  }
  return (
    <Field className={className} data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id} className="sr-only">{field.label}</FieldLabel>
      <Input id={id} type={field.fieldType === "phone" ? "tel" : field.fieldType === "date" ? "date" : field.fieldType === "file" ? "file" : field.fieldType} value={field.fieldType === "file" ? undefined : value} onChange={(event) => onChange(field.fieldType === "file" ? event.target.files?.[0]?.name ?? "" : event.target.value)} placeholder={field.placeholder ?? field.label} aria-invalid={Boolean(error)} className="min-h-12 rounded-full border-slate-200 px-4" />
      <FieldError>{error}</FieldError>
    </Field>
  );
}
