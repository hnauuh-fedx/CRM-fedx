import { prisma } from "../../database/prisma";
import { validateMarketingFormOther, isMarketingFormOtherAnswerValid } from "@admission-crm/shared/marketing-form-config";
import { createHash, randomUUID } from "node:crypto";
import { readMarketingFormSubmissionPolicy, marketingFormUpdateFields, marketingFormPublicationType } from "@admission-crm/shared/marketing-form-submission-policy";
import { Prisma } from "../../generated/prisma/client";
import { z } from "zod";
import { createMarketingFormSnapshot } from "@admission-crm/shared/marketing-form-snapshot";
import { readMarketingFormLayout, validateMarketingFormLayout } from "@admission-crm/shared/marketing-form-layout";
import { normalizeMarketingFormOptions, validateMarketingFormRatings, isMarketingFormRatingValueAllowed, validateMarketingFormQuestionDescriptions } from "@admission-crm/shared/marketing-form-config";
import { validateMarketingFormVisibility, resolveMarketingFormVisibleKeys, stripHiddenMarketingFormAnswers } from "@admission-crm/shared/marketing-form-visibility";
import { marketingFormTrackingKeys, resolveMarketingFormRedirect, sanitizeMarketingFormTracking } from "@admission-crm/shared/marketing-form-embed";
import { env } from "../../config/env";
import { createMarketingFormAutomationEvent, dispatchMarketingFormAutomationEvent } from "../automations/marketing-form-automation-event.service";

type PublicSubmissionInput = {
  publicKey: string;
  payload: Record<string, unknown>;
  webhookSecret?: string;
  ipAddress?: string;
  userAgent?: string;
  isWebhook?: boolean;
  idempotencyKey?: string;
};

const leadFields = new Set([
  "full_name",
  "phone",
  "email",
  "gender",
  "date_of_birth",
  "note",
  "source_id",
  "institution_program_id",
  "major_id",
]);

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function isObjectPayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePhone(phone: string) {
  return phone.replace(/\s+/g, "").trim();
}

function isPublishedStatus(status?: string | null) {
  return status === "published" || status === "active";
}

function isAllowedSystemField(fieldKey: string) {
  return [...marketingFormTrackingKeys, "website", "_hp"].includes(fieldKey as (typeof marketingFormTrackingKeys)[number] | "website" | "_hp");
}

function asSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type FieldDependencyConfig = {
  parentFieldKey: string;
  optionMap: Record<string, string[]>;
};

function getFieldDependency(validationRules: unknown): FieldDependencyConfig | null {
  const dependency = asSettings(asSettings(validationRules).dependency);
  const parentFieldKey = typeof dependency.parentFieldKey === "string" ? dependency.parentFieldKey : "";
  const rawOptionMap = asSettings(dependency.optionMap);
  if (!parentFieldKey) return null;
  const optionMap: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(rawOptionMap)) {
    optionMap[key] = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }
  return { parentFieldKey, optionMap };
}

function fieldOptions(value: unknown) {
  return normalizeMarketingFormOptions(value).map((option) => option.value);
}

function getEffectiveFieldOptions(
  field: { options: unknown; validation_rules?: unknown },
  fields: Array<{ field_key: string; options: unknown; validation_rules?: unknown }>,
  payload: Record<string, unknown>,
) {
  const dependency = getFieldDependency(field.validation_rules);
  if (!dependency) return fieldOptions(field.options);
  const parentExists = fields.some((item) => item.field_key === dependency.parentFieldKey);
  if (!parentExists) return [];
  const parentValue = asText(payload[dependency.parentFieldKey]);
  if (!parentValue) return [];
  const configured = new Set(fieldOptions(field.options));
  return (dependency.optionMap[parentValue] ?? []).filter((value) => configured.has(value));
}

function asBooleanSetting(settings: Record<string, unknown>, key: string, fallback = false) {
  return typeof settings[key] === "boolean" ? settings[key] : fallback;
}

function asStringSetting(settings: Record<string, unknown>, key: string) {
  return typeof settings[key] === "string" ? settings[key].trim() : "";
}

function asStringArraySetting(settings: Record<string, unknown>, key: string) {
  return Array.isArray(settings[key]) ? settings[key].filter((item): item is string => typeof item === "string") : [];
}

function validateFieldValue(field: { field_type: string; label: string; validation_rules?: unknown }, value: unknown, options: string[]) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return isMarketingFormOtherAnswerValid(value, field.validation_rules) ? null : `${field.label}: nội dung Khác không hợp lệ (cần văn bản 1–1.000 ký tự).`;
  if (field.field_type === "rating") return isMarketingFormRatingValueAllowed(value, field.validation_rules) ? null : `${field.label} phải là số nguyên trong thang đánh giá.`;
  const textValue = asText(value);
  if (["checkbox", "multi_select"].includes(field.field_type)) {
    if (value === null || value === undefined || value === "") return null;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return `${field.label} phải là danh sách lựa chọn.`;
    if (value.some((item) => !options.includes(item))) return `${field.label} có lựa chọn không hợp lệ.`;
    return null;
  }
  if (Array.isArray(value) || (value !== null && typeof value === "object")) return `${field.label} không đúng kiểu dữ liệu.`;
  if (!textValue) return null;
  const hasDependency = Boolean(getFieldDependency(field.validation_rules));
  if (field.field_type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(textValue)) return `${field.label} không đúng định dạng email.`;
  if (field.field_type === "phone" && !/^[0-9+\-\s().]{8,20}$/.test(textValue)) return `${field.label} không đúng định dạng số điện thoại.`;
  if (field.field_type === "number" && Number.isNaN(Number(textValue))) return `${field.label} phải là số.`;
  if (field.field_type === "date" && Number.isNaN(Date.parse(textValue))) return `${field.label} không đúng định dạng ngày.`;
  if (["select", "radio", "single_select"].includes(field.field_type)) {
    if (hasDependency && options.length === 0) return `${field.label} chưa có lựa chọn hợp lệ theo câu hỏi liên quan.`;
    if (options.length > 0 && !options.includes(textValue)) return `${field.label} không nằm trong lựa chọn hợp lệ.`;
  }
  if (["checkbox", "multi_select"].includes(field.field_type)) {
    const values = Array.isArray(value) ? value.map(asText).filter(Boolean) : [textValue];
    if (hasDependency && options.length === 0) return `${field.label} chưa có lựa chọn hợp lệ theo câu hỏi liên quan.`;
    if (options.length > 0 && values.some((item) => !options.includes(item))) return `${field.label} có lựa chọn không hợp lệ.`;
  }
  return null;
}

async function findDefaultLeadSource(client: Pick<typeof prisma, "lead_sources">, institutionProgramId?: string | null) {
  return client.lead_sources.findFirst({
    where: institutionProgramId
      ? { institution_program_id: institutionProgramId }
      : { id: { in: [] } },
    select: { id: true },
    orderBy: [{ institution_program_id: "desc" }, { created_at: "asc" }],
  });
}

export async function getPublicMarketingFormConfig(publicKey: string) {
  const form = await prisma.marketing_forms.findFirst({
    where: { OR: [{ public_key: publicKey }, { slug: publicKey }], status: { in: ["published", "active"] }, institution_program_id: { not: null } },
    select: {
      id: true,
      name: true,
      slug: true,
      form_type: true,
      title: true,
      subtitle: true,
      description: true,
      submit_button_label: true,
      primary_color: true,
      background_color: true,
      display_settings: true,
      close_settings: true,
      success_settings: true,
      marketing_form_templates: { select: { id: true, name: true, config: true } },
      platform: true,
      campaigns: { select: { id: true, name: true } },
      marketing_form_fields: {
        where: { is_active: true },
        select: { field_key: true, label: true, placeholder: true, field_type: true, is_required: true, options: true, validation_rules: true, default_value: true, sort_order: true },
        orderBy: [{ sort_order: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!form) return null;
  const displaySettings = asSettings(form.display_settings);
  return {
    id: form.id,
    name: form.name,
    slug: form.slug,
    formType: form.form_type ?? "lead_form",
    title: asStringSetting(displaySettings, "title") || form.title || form.name,
    subtitle: form.subtitle,
    description: asStringSetting(displaySettings, "description") || form.description,
    submitButtonLabel: asStringSetting(displaySettings, "submitButtonText") || form.submit_button_label || "Gửi thông tin",
    primaryColor: form.primary_color ?? "#0f62fe",
    backgroundColor: form.background_color ?? "#f8fafc",
    displaySettings,
    closeSettings: form.close_settings ?? {},
    successSettings: form.success_settings ?? {},
    template: form.marketing_form_templates,
    platform: form.platform,
    campaign: form.campaigns,
    fields: form.marketing_form_fields.map((field) => ({
      fieldKey: field.field_key,
      label: field.label,
      placeholder: field.placeholder,
      fieldType: field.field_type,
      isRequired: field.is_required,
      options: normalizeMarketingFormOptions(field.options),
      validationRules: field.validation_rules,
      defaultValue: field.default_value,
      sortOrder: field.sort_order,
    })),
  };
}

export async function submitMarketingForm(input: PublicSubmissionInput) {
  if (!isObjectPayload(input.payload)) {
    return { ok: false as const, status: 400, message: "Dữ liệu gửi lên không hợp lệ." };
  }
  if (input.idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)) return { ok: false as const, status: 400, message: "Mã chống gửi lặp không hợp lệ." };
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : isObjectPayload(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  const requestHash = createHash("sha256").update(JSON.stringify(canonical({ payload: input.payload, isWebhook: Boolean(input.isWebhook) }))).digest("hex");

  let automationEventId: string | null = null;
  const result = await prisma.$transaction(async (tx) => {
    // Share the configuration lock with the builder so answers and their snapshot
    // are validated against the same committed form, including nested field queries.
    const identity = await tx.marketing_forms.findFirst({ where: { OR: [{ public_key: input.publicKey }, { slug: input.publicKey }] }, select: { id: true } });
    if (!identity) return { ok: false as const, status: 404, message: "Biểu mẫu không khả dụng." };
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`marketing-form:${identity.id}`}))::text`;
    const form = await tx.marketing_forms.findFirst({
      where: { OR: [{ public_key: input.publicKey }, { slug: input.publicKey }] },
      select: {
        id: true,
        name: true,
        platform: true,
        status: true,
        form_type: true,
        webhook_enabled: true,
        webhook_secret: true,
        created_by: true,
        campaign_id: true,
        institution_program_id: true,
        source_id: true,
        duplicate_settings: true,
        success_settings: true,
        close_settings: true,
        display_settings: true,
        updated_at: true,
        campaigns: { select: { created_by: true, institution_program_id: true } },
        marketing_form_fields: {
          where: { is_active: true },
          select: { field_key: true, label: true, field_type: true, is_required: true, options: true, validation_rules: true, lead_field: true, crm_mapping_field: true, default_value: true },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!form || !isPublishedStatus(form.status)) {
      return { ok: false as const, status: 404, message: "Biểu mẫu không khả dụng." };
    }
    const programId = form.institution_program_id;
    if (!programId) return { ok: false as const, status: 403, message: "Biểu mẫu chưa được cấu hình chương trình. Vui lòng liên hệ quản trị." };
    const layoutIssues = validateMarketingFormLayout(form.display_settings, form.marketing_form_fields.map(field => ({ fieldKey: field.field_key, fieldType: field.field_type, validationRules: field.validation_rules })));
    if (layoutIssues.length) return { ok: false as const, status: 400, message: "Cấu hình trang/nhóm chưa hợp lệ. Vui lòng liên hệ quản trị." };
    const snapshot = createMarketingFormSnapshot({
      layout: readMarketingFormLayout(form.display_settings),
      formId: form.id, formName: form.name, formType: form.form_type ?? "lead_form",
      institutionProgramId: programId, configurationUpdatedAt: form.updated_at?.toISOString() ?? null,
      fields: form.marketing_form_fields.map((field) => ({
        fieldKey: field.field_key, label: field.label, fieldType: field.field_type, isRequired: field.is_required,
        options: field.options, validationRules: field.validation_rules, crmMappingField: field.crm_mapping_field, leadField: field.lead_field, defaultValue: field.default_value,
      })),
    });
    snapshot.configurationVersion = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    const closeSettings = asSettings(form.close_settings);
    const isFormActive = closeSettings.isActive !== false;
    const closeAt = asStringSetting(closeSettings, "closeAt") || asStringSetting(closeSettings, "closedAt");
    const hasClosedAtTime = closeAt ? !Number.isNaN(Date.parse(closeAt)) && Date.now() >= Date.parse(closeAt) : false;
    if (!isFormActive || asBooleanSetting(closeSettings, "isClosed") || hasClosedAtTime) {
      const message = asStringSetting(closeSettings, "closedMessage") || "Biểu mẫu đã tạm dừng nhận thông tin.";
      const redirect = resolveMarketingFormRedirect(closeSettings, env.WEB_ORIGIN);
      return { ok: false as const, status: 403, message, redirectUrl: redirect?.url, redirectMode: redirect?.mode };
    }
    if (asText(input.payload.website) || asText(input.payload._hp)) {
      return { ok: false as const, status: 400, message: "Dữ liệu gửi lên không hợp lệ." };
    }
    if (input.isWebhook) {
      if (!form.webhook_enabled) {
        return { ok: false as const, status: 403, message: "Webhook của biểu mẫu chưa được bật." };
      }
      if (!form.webhook_secret || input.webhookSecret !== form.webhook_secret) {
        return { ok: false as const, status: 401, message: "Webhook secret không hợp lệ." };
      }
    }

    // Authenticate the webhook before replaying any receipt. No Lead identity is public.
    if (input.idempotencyKey) {
      const previous = await tx.marketing_form_submissions.findUnique({ where: { marketing_form_id_idempotency_key: { marketing_form_id: form.id, idempotency_key: input.idempotencyKey } }, select: { id: true, request_hash: true, status: true, error_message: true, configuration_snapshot: true } });
      if (previous) {
        if (previous.request_hash !== requestHash) return { ok: false as const, status: 409, message: "Mã gửi đã được dùng cho nội dung khác. Vui lòng gửi lại với mã mới." };
        if (previous.status === "failed") return { ok: false as const, status: 400, message: previous.error_message ?? "Dữ liệu không hợp lệ.", submissionId: previous.id };
        const receipt = asSettings(asSettings(previous.configuration_snapshot).publicReceipt);
        return { ok: true as const, data: { submissionId: previous.id, status: "processed", message: asStringSetting(receipt, "message") || "Đã nhận thông tin của bạn.", redirectUrl: asStringSetting(receipt, "redirectUrl") || undefined, redirectMode: receipt.redirectMode === "landing_page" ? "landing_page" as const : receipt.redirectMode === "form" ? "form" as const : undefined } };
      }
    }
    let policy;
    try { policy = readMarketingFormSubmissionPolicy(form.duplicate_settings); }
    catch { return { ok: false as const, status: 400, message: "Chính sách biểu mẫu chưa hợp lệ. Vui lòng liên hệ quản trị." }; }
    snapshot.submissionPolicy = policy;
    const visibilityFields = snapshot.fields.map(field => ({ ...field, crmMappingField: field.mapping }));
    const descriptionIssues = validateMarketingFormQuestionDescriptions(visibilityFields);
    if (validateMarketingFormOther(visibilityFields).length) return { ok: false as const, status: 400, message: "Cấu hình lựa chọn Khác chưa hợp lệ. Vui lòng liên hệ quản trị." };
    if (validateMarketingFormRatings(visibilityFields).length) return { ok: false as const, status: 400, message: "Thang đánh giá chưa hợp lệ. Vui lòng liên hệ quản trị." };
    if (descriptionIssues.length) return { ok: false as const, status: 400, message: "Mô tả câu hỏi chưa hợp lệ. Vui lòng liên hệ quản trị." };
    const visibilityIssues = validateMarketingFormVisibility(visibilityFields, marketingFormPublicationType(form.form_type ?? "lead_form", form.duplicate_settings));
    if (visibilityIssues.length) return { ok: false as const, status: 400, message: "Điều kiện hiện/ẩn câu hỏi chưa hợp lệ. Vui lòng liên hệ quản trị." };
    const visibleKeys = resolveMarketingFormVisibleKeys(visibilityFields, input.payload);
    const payload = stripHiddenMarketingFormAnswers(visibilityFields, input.payload);
    const tracking = sanitizeMarketingFormTracking(payload);
    for (const key of marketingFormTrackingKeys) {
      if (key in payload && !(key in tracking)) return { ok: false as const, status: 400, message: `Trường tracking ${key} không hợp lệ.` };
    }
    Object.assign(payload, tracking);
    const receiptRedirect = resolveMarketingFormRedirect(form.success_settings, env.WEB_ORIGIN);
    snapshot.publicReceipt = { message: asStringSetting(asSettings(form.success_settings), "message") || "Đã nhận thông tin của bạn.", redirectUrl: receiptRedirect?.url, redirectMode: receiptRedirect?.mode };
    delete snapshot.configurationVersion;
    snapshot.configurationVersion = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

    const normalized: Record<string, string> = {};
    const answers: Record<string, unknown> = {};
    const missingFields: string[] = [];
    const validationErrors: string[] = [];
    const allowedFields = new Set(form.marketing_form_fields.map((field) => field.field_key));
    for (const fieldKey of Object.keys(input.payload)) {
      if (!allowedFields.has(fieldKey) && !isAllowedSystemField(fieldKey)) {
        return { ok: false as const, status: 400, message: `Trường ${fieldKey} không tồn tại trong biểu mẫu.` };
      }
    }
    for (const field of form.marketing_form_fields) {
      if (!visibleKeys.has(field.field_key)) continue;
      const value = payload[field.field_key];
      const textValue = asText(value);
      const effectiveOptions = getEffectiveFieldOptions(field, form.marketing_form_fields, payload);
      answers[field.field_key] = value ?? null;
      if (field.is_required && !(Array.isArray(value) ? value.length > 0 : Boolean(textValue) || isMarketingFormOtherAnswerValid(value, field.validation_rules))) {
        missingFields.push(field.label);
      }
      const validationError = validateFieldValue(field, value, effectiveOptions);
      if (validationError) validationErrors.push(validationError);
      const leadField = field.crm_mapping_field ?? field.lead_field;
      if (leadField && leadFields.has(leadField) && textValue) {
        if (normalized[leadField] !== undefined) validationErrors.push(`Trường CRM ${leadField} đang nhận dữ liệu từ nhiều câu hỏi. Vui lòng kiểm tra cấu hình biểu mẫu.`);
        normalized[leadField] = leadField === "phone" ? normalizePhone(textValue) : textValue;
      }
    }

    if (normalized.institution_program_id && normalized.institution_program_id !== programId) {
      validationErrors.push("Chương trình không khớp với biểu mẫu.");
    }
    const referenceFields = ["major_id", "source_id"] as const;
    for (const reference of referenceFields) {
      const value = normalized[reference];
      if (!value) continue;
      const field = form.marketing_form_fields.find((item) => (item.crm_mapping_field ?? item.lead_field) === reference);
      const label = field?.label ?? reference;
      if (!z.uuid().safeParse(value).success) {
        validationErrors.push(`${label} đang ánh xạ đến dữ liệu CRM nhưng giá trị lựa chọn không hợp lệ. Vui lòng kiểm tra cấu hình biểu mẫu.`);
        continue;
      }
      const exists = reference === "major_id"
          ? await tx.majors.findFirst({ where: { id: value, ...(programId && z.uuid().safeParse(programId).success ? { OR: [{ institution_program_id: programId }, { institution_program_id: null }] } : {}) }, select: { id: true } })
          : await tx.lead_sources.findFirst({ where: { id: value, ...(programId && z.uuid().safeParse(programId).success ? { OR: [{ institution_program_id: programId }, { institution_program_id: null }] } : {}) }, select: { id: true } });
      if (!exists) validationErrors.push(`${label} không tồn tại hoặc không thuộc chương trình của biểu mẫu.`);
    }

    const utmSource = asText(payload.utm_source);
    const utmMedium = asText(payload.utm_medium);
    const utmCampaign = asText(payload.utm_campaign);
    const source = input.isWebhook ? "webhook" : "public_form";

    const createSubmission = async (status: string, errorMessage?: string, leadId?: string | null) => tx.marketing_form_submissions.create({
      data: {
        marketing_form_id: form.id,
        lead_id: leadId ?? null,
        raw_payload: payload as Prisma.InputJsonValue,
        normalized_payload: normalized as Prisma.InputJsonValue,
        answers: answers as Prisma.InputJsonValue,
        configuration_snapshot: { ...snapshot, processingOutcome: status === "processed" ? (leadId ? "created_lead" : "survey_only") : status } as unknown as Prisma.InputJsonValue,
        idempotency_key: input.idempotencyKey,
        request_hash: input.idempotencyKey ? requestHash : null,
        source,
        utm_source: utmSource || null,
        utm_medium: utmMedium || null,
        utm_campaign: utmCampaign || null,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
        status,
        error_message: errorMessage,
      },
      select: { id: true },
    });

    if (missingFields.length > 0) {
      const errorMessage = `Thiếu trường bắt buộc: ${missingFields.join(", ")}.`;
      const submission = await createSubmission("failed", errorMessage);
      return { ok: false as const, status: 400, message: errorMessage, submissionId: submission.id };
    }
    if (validationErrors.length > 0) {
      const errorMessage = validationErrors.join(" ");
      const submission = await createSubmission("failed", errorMessage);
      return { ok: false as const, status: 400, message: errorMessage, submissionId: submission.id };
    }

    if (normalized.date_of_birth && Number.isNaN(Date.parse(normalized.date_of_birth))) {
      const submission = await createSubmission("failed", "Ngày sinh không hợp lệ.");
      return { ok: false as const, status: 400, message: "Ngày sinh không hợp lệ.", submissionId: submission.id };
    }

    const formType = form.form_type ?? "lead_form";
    const fullName = normalized.full_name;
    const phone = normalized.phone;
    const email = normalized.email;
    const duplicateSettings = asSettings(form.duplicate_settings);
    const successSettings = asSettings(form.success_settings);
    const successRedirect = resolveMarketingFormRedirect(successSettings, env.WEB_ORIGIN);
    const success = async (submissionId: string) => {
      const submission = await tx.marketing_form_submissions.findUniqueOrThrow({ where: { id: submissionId }, select: { lead_id: true } });
      const triggerType = policy?.submissionMode === "survey_only" || (!policy && formType === "survey") ? "survey_completed" : "form_submitted";
      automationEventId = await createMarketingFormAutomationEvent(tx, {
        triggerType,
        submissionId,
        formId: form.id,
        institutionProgramId: programId,
        configurationVersion: snapshot.configurationVersion ?? null,
        leadId: submission.lead_id,
        actorId: form.created_by ?? form.campaigns?.created_by ?? null,
        answers,
      });
      return { ok: true as const, data: { submissionId, status: "processed", message: asStringSetting(successSettings, "message") || "Đã nhận thông tin của bạn.", redirectUrl: successRedirect?.url, redirectMode: successRedirect?.mode } };
    };
    if (policy?.submissionMode === "survey_only") {
      const submission = await createSubmission("processed");
      return success(submission.id);
    }
    const duplicateFields = asStringArraySetting(duplicateSettings, "fields");
    const checkDuplicate = Boolean(policy) || (!asBooleanSetting(duplicateSettings, "disableDuplicateCheck") && !asBooleanSetting(duplicateSettings, "skipDuplicateCheck"));
    const duplicateWhere = checkDuplicate
      ? [
          ...(phone && (policy || duplicateFields.length === 0 || duplicateFields.includes("phone")) ? [{ phone, deleted_at: null }] : []),
          ...(email && (policy || duplicateFields.includes("email")) ? [{ email: { equals: email, mode: "insensitive" as const }, deleted_at: null }] : []),
        ]
      : [];
    if ((policy || formType !== "survey") && (!fullName || !phone)) {
      const errorMessage = "Biểu mẫu cần Họ và tên và Số điện thoại để tạo lead.";
      const submission = await createSubmission("failed", errorMessage);
      return { ok: false as const, status: 400, message: errorMessage, submissionId: submission.id };
    }

    // A programme lock also serializes submissions from different forms in that programme.
    // Scope is acquired before checking duplicates, not just before inserting the Lead.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`marketing-form-leads:${programId}`}))::text`;
    const matchingLeads = duplicateWhere.length > 0
      ? await tx.leads.findMany({
          where: { institution_program_id: programId, OR: duplicateWhere },
          select: { id: true, email: true, major_id: true, note: true, gender: true, date_of_birth: true },
          take: 2,
        })
      : [];
    if (matchingLeads.length > 1) {
      const submission = await createSubmission("needs_review", "Nhiều Lead khớp thông tin liên hệ; cần xử lý nội bộ.");
      return success(submission.id);
    }
    const existingLead = matchingLeads[0];

    if (existingLead && policy) {
      const data: Prisma.leadsUpdateInput = {};
      if (policy.submissionMode === "upsert_lead") {
        for (const field of marketingFormUpdateFields) {
          const value = normalized[field];
          if (!value || (existingLead[field] && !(policy.updatePolicy === "overwrite_selected" && policy.overwriteFields.includes(field)))) continue;
          if (field === "date_of_birth") { if (!Number.isNaN(Date.parse(value))) data.date_of_birth = new Date(value); }
          else if (field === "major_id") data.majors = { connect: { id: value } };
          else data[field] = value;
        }
      }
      const changed = Object.keys(data).length > 0;
      if (changed) await tx.leads.update({ where: { id: existingLead.id }, data: { ...data, updated_at: new Date() } });
      const submission = await createSubmission(changed ? "updated" : "linked", undefined, existingLead.id);
      const actorId = form.created_by ?? form.campaigns?.created_by ?? null;
      await tx.lead_activities.create({ data: { lead_id: existingLead.id, user_id: actorId, type: "marketing_form_submitted", content: `${changed ? "Bổ sung" : "Liên kết"} phản hồi từ biểu mẫu ${form.name}.`, metadata: { marketingFormId: form.id, submissionId: submission.id } } });
      await tx.audit_logs.create({ data: { user_id: actorId, entity_type: "lead", entity_id: existingLead.id, action: changed ? "update_from_marketing_form" : "link_marketing_form_submission", new_data: { marketingFormId: form.id, submissionId: submission.id, changedFields: Object.keys(data) } } });
      return success(submission.id);
    }

    if (existingLead) {
      const recordLink = async (submissionId: string) => {
        const actorId = form.created_by ?? form.campaigns?.created_by ?? null;
        await tx.lead_activities.create({ data: { lead_id: existingLead.id, user_id: actorId, type: "marketing_form_submitted", content: `Liên kết phản hồi từ biểu mẫu ${form.name}.`, metadata: { marketingFormId: form.id, submissionId } } });
        await tx.audit_logs.create({ data: { user_id: actorId, entity_type: "lead", entity_id: existingLead.id, action: "link_marketing_form_submission", new_data: { marketingFormId: form.id, submissionId } } });
      };
      if (asBooleanSetting(duplicateSettings, "oneResponseOnly")) {
        const previousSubmission = await tx.marketing_form_submissions.findFirst({
          where: { marketing_form_id: form.id, lead_id: existingLead.id },
          select: { id: true },
          orderBy: { created_at: "desc" },
        });
        if (previousSubmission) {
          const errorMessage = asStringSetting(duplicateSettings, "oneResponseMessage") || "Thông tin của Anh/Chị đã được gửi đến nhà trường!";
          const submission = await createSubmission("duplicate", errorMessage, existingLead.id);
          await recordLink(submission.id);
          return success(submission.id);
        }
      }
      const action = asStringSetting(duplicateSettings, "action") || "update";
      if (action === "skip" || action === "do_not_write") {
        const submission = await createSubmission("duplicate", undefined, existingLead.id);
        await recordLink(submission.id);
        return success(submission.id);
      }
      const nextEmail = existingLead.email || normalized.email || null;
      const nextMajorId = existingLead.major_id || normalized.major_id || null;
      await tx.leads.update({
        where: { id: existingLead.id },
        data: {
          email: nextEmail,
          major_id: nextMajorId,
          updated_at: new Date(),
        },
      });
      await tx.lead_activities.create({
        data: {
          lead_id: existingLead.id,
          user_id: form.created_by ?? form.campaigns?.created_by ?? null,
          type: "marketing_form_duplicate",
          content: `Ghi nhận dữ liệu trùng từ biểu mẫu ${form.name}.`,
          metadata: { marketingFormId: form.id },
        },
      });
      const submission = await createSubmission("duplicate", undefined, existingLead.id);
      await tx.audit_logs.create({ data: { user_id: form.created_by ?? form.campaigns?.created_by ?? null, entity_type: "lead", entity_id: existingLead.id, action: "update_from_marketing_form", new_data: { marketingFormId: form.id, submissionId: submission.id } } });
      return success(submission.id);
    }

    if (!policy && formType === "survey" && (!fullName || !phone)) {
      const submission = await createSubmission("processed");
      return success(submission.id);
    }

    const configuredSourceId = normalized.source_id || form.source_id;
    const fallbackSource = configuredSourceId
      ? await tx.lead_sources.findFirst({ where: { id: configuredSourceId, OR: [{ institution_program_id: programId }, { institution_program_id: null }] }, select: { id: true } })
      : await findDefaultLeadSource(tx, programId);
    if (!fallbackSource) {
      const errorMessage = "Chưa có nguồn lead để tạo lead từ biểu mẫu.";
      const submission = await createSubmission("failed", errorMessage);
      return { ok: false as const, status: 400, message: errorMessage, submissionId: submission.id };
    }

    const actorId = form.created_by ?? form.campaigns?.created_by ?? null;
    const ownerId = policy ? null : actorId;
    const lead = await tx.leads.create({
      data: {
        lead_code: `LD-${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`,
        full_name: fullName,
        phone,
        email: normalized.email || null,
        gender: normalized.gender || null,
        date_of_birth: normalized.date_of_birth ? new Date(normalized.date_of_birth) : null,
        note: normalized.note || `Lead được tạo từ biểu mẫu ${form.name}.`,
        source_id: fallbackSource.id,
        institution_program_id: programId,
        major_id: normalized.major_id || null,
        owner_id: ownerId,
        assigned_to: ownerId,
      },
      select: { id: true },
    });
    if (ownerId) {
      await tx.lead_assignments.create({
        data: {
          lead_id: lead.id,
          assigned_to: ownerId,
          assigned_by: ownerId,
          is_main_owner: true,
        },
      });
    }
    await tx.lead_activities.create({
      data: {
        lead_id: lead.id,
        user_id: actorId,
        type: "marketing_form_submitted",
        content: `Lead được tạo từ biểu mẫu ${form.name}.`,
        metadata: { marketingFormId: form.id, campaignId: form.campaign_id },
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actorId,
        entity_type: "lead",
        entity_id: lead.id,
        action: "create_from_marketing_form",
        ip_address: input.ipAddress,
        new_data: { marketingFormId: form.id, sourceId: fallbackSource.id },
      },
    });
    const submission = await createSubmission("processed", undefined, lead.id);
    return success(submission.id);
  });
  if (result.ok && automationEventId) {
    void dispatchMarketingFormAutomationEvent(automationEventId).catch(() => {
      console.error("Không thể phát event automation Form/Survey; recovery scan sẽ thử lại.", { automationEventId });
    });
  }
  return result;
}
