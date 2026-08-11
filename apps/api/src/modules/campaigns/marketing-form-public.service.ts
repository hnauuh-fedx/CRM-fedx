import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";

type PublicSubmissionInput = {
  publicKey: string;
  payload: Record<string, unknown>;
  webhookSecret?: string;
  ipAddress?: string;
  userAgent?: string;
  isWebhook?: boolean;
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
  return ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "website", "_hp"].includes(fieldKey);
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
  return Array.isArray(value) ? value.filter((option): option is string => typeof option === "string") : [];
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
  return dependency.optionMap[parentValue] ?? [];
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
  const textValue = asText(value);
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
      ? { OR: [{ institution_program_id: institutionProgramId }, { institution_program_id: null }] }
      : undefined,
    select: { id: true },
    orderBy: [{ institution_program_id: "desc" }, { created_at: "asc" }],
  });
}

export async function getPublicMarketingFormConfig(publicKey: string) {
  const form = await prisma.marketing_forms.findFirst({
    where: { OR: [{ public_key: publicKey }, { slug: publicKey }], status: { in: ["published", "active"] } },
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
      options: Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === "string") : [],
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

  return prisma.$transaction(async (tx) => {
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
        duplicate_settings: true,
        success_settings: true,
        close_settings: true,
        campaigns: { select: { created_by: true, institution_program_id: true } },
        marketing_form_fields: {
          where: { is_active: true },
          select: { field_key: true, label: true, field_type: true, is_required: true, options: true, validation_rules: true, lead_field: true, crm_mapping_field: true },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!form || !isPublishedStatus(form.status)) {
      return { ok: false as const, status: 404, message: "Biểu mẫu không khả dụng." };
    }
    const closeSettings = asSettings(form.close_settings);
    const isFormActive = closeSettings.isActive !== false;
    const closeAt = asStringSetting(closeSettings, "closeAt") || asStringSetting(closeSettings, "closedAt");
    const hasClosedAtTime = closeAt ? !Number.isNaN(Date.parse(closeAt)) && Date.now() >= Date.parse(closeAt) : false;
    if (!isFormActive || asBooleanSetting(closeSettings, "isClosed") || hasClosedAtTime) {
      const message = asStringSetting(closeSettings, "closedMessage") || "Biểu mẫu đã tạm dừng nhận thông tin.";
      return { ok: false as const, status: 403, message, redirectUrl: asStringSetting(closeSettings, "redirectUrl") || undefined };
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
      const value = input.payload[field.field_key];
      const textValue = asText(value);
      const effectiveOptions = getEffectiveFieldOptions(field, form.marketing_form_fields, input.payload);
      answers[field.field_key] = value ?? null;
      if (field.is_required && !textValue) {
        missingFields.push(field.label);
      }
      const validationError = validateFieldValue(field, value, effectiveOptions);
      if (validationError) validationErrors.push(validationError);
      const leadField = field.crm_mapping_field ?? field.lead_field;
      if (leadField && leadFields.has(leadField) && textValue) {
        normalized[leadField] = leadField === "phone" ? normalizePhone(textValue) : textValue;
      }
    }

    const utmSource = asText(input.payload.utm_source);
    const utmMedium = asText(input.payload.utm_medium);
    const utmCampaign = asText(input.payload.utm_campaign);
    const source = input.isWebhook ? "webhook" : "public_form";

    const createSubmission = async (status: string, errorMessage?: string, leadId?: string | null) => tx.marketing_form_submissions.create({
      data: {
        marketing_form_id: form.id,
        lead_id: leadId ?? null,
        raw_payload: input.payload as Prisma.InputJsonValue,
        normalized_payload: normalized as Prisma.InputJsonValue,
        answers: answers as Prisma.InputJsonValue,
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

    const formType = form.form_type ?? "lead_form";
    const fullName = normalized.full_name;
    const phone = normalized.phone;
    const email = normalized.email;
    const duplicateSettings = asSettings(form.duplicate_settings);
    const successSettings = asSettings(form.success_settings);
    const duplicateFields = asStringArraySetting(duplicateSettings, "fields");
    const checkDuplicate = !asBooleanSetting(duplicateSettings, "disableDuplicateCheck") && !asBooleanSetting(duplicateSettings, "skipDuplicateCheck");
    const duplicateWhere = checkDuplicate
      ? [
          ...(phone && (duplicateFields.length === 0 || duplicateFields.includes("phone")) ? [{ phone, deleted_at: null }] : []),
          ...(email && duplicateFields.includes("email") ? [{ email, deleted_at: null }] : []),
        ]
      : [];
    if (formType !== "survey" && (!fullName || !phone)) {
      const errorMessage = "Biểu mẫu cần Họ và tên và Số điện thoại để tạo lead.";
      const submission = await createSubmission("failed", errorMessage);
      return { ok: false as const, status: 400, message: errorMessage, submissionId: submission.id };
    }

    const existingLead = duplicateWhere.length > 0
      ? await tx.leads.findFirst({
          where: { OR: duplicateWhere },
          select: { id: true, email: true, major_id: true, note: true },
        })
      : null;

    if (existingLead) {
      if (asBooleanSetting(duplicateSettings, "oneResponseOnly")) {
        const previousSubmission = await tx.marketing_form_submissions.findFirst({
          where: { marketing_form_id: form.id, lead_id: existingLead.id },
          select: { id: true },
          orderBy: { created_at: "desc" },
        });
        if (previousSubmission) {
          const errorMessage = asStringSetting(duplicateSettings, "oneResponseMessage") || "Thông tin của Anh/Chị đã được gửi đến nhà trường!";
          const submission = await createSubmission("duplicate", errorMessage, existingLead.id);
          return { ok: false as const, status: 409, message: errorMessage, submissionId: submission.id };
        }
      }
      const action = asStringSetting(duplicateSettings, "action") || "update";
      if (action === "skip" || action === "do_not_write") {
        const submission = await createSubmission("duplicate", undefined, existingLead.id);
        return { ok: true as const, data: { submissionId: submission.id, leadId: existingLead.id, status: "duplicate", message: asStringSetting(successSettings, "message") || undefined, redirectUrl: asStringSetting(successSettings, "redirectUrl") || undefined } };
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
      return { ok: true as const, data: { submissionId: submission.id, leadId: existingLead.id, status: "duplicate", message: asStringSetting(successSettings, "message") || undefined, redirectUrl: asStringSetting(successSettings, "redirectUrl") || undefined } };
    }

    if (formType === "survey" && (!fullName || !phone)) {
      const submission = await createSubmission("processed");
      return { ok: true as const, data: { submissionId: submission.id, leadId: null, status: "processed", message: asStringSetting(successSettings, "message") || undefined, redirectUrl: asStringSetting(successSettings, "redirectUrl") || undefined } };
    }

    const fallbackSource = normalized.source_id ? { id: normalized.source_id } : await findDefaultLeadSource(tx, form.campaigns?.institution_program_id);
    if (!fallbackSource) {
      const errorMessage = "Chưa có nguồn lead để tạo lead từ biểu mẫu.";
      const submission = await createSubmission("failed", errorMessage);
      return { ok: false as const, status: 400, message: errorMessage, submissionId: submission.id };
    }

    const ownerId = form.created_by ?? form.campaigns?.created_by ?? null;
    const lead = await tx.leads.create({
      data: {
        lead_code: `LD-${Date.now().toString(36).toUpperCase()}`,
        full_name: fullName,
        phone,
        email: normalized.email || null,
        gender: normalized.gender || null,
        date_of_birth: normalized.date_of_birth ? new Date(normalized.date_of_birth) : null,
        note: normalized.note || `Lead được tạo từ biểu mẫu ${form.name}.`,
        source_id: fallbackSource.id,
        institution_program_id: normalized.institution_program_id || form.campaigns?.institution_program_id || null,
        major_id: normalized.major_id || null,
        owner_id: ownerId,
        assigned_to: ownerId,
        status: "new",
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
        user_id: ownerId,
        type: "marketing_form_submitted",
        content: `Lead được tạo từ biểu mẫu ${form.name}.`,
        metadata: { marketingFormId: form.id, campaignId: form.campaign_id },
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: ownerId,
        entity_type: "lead",
        entity_id: lead.id,
        action: "create_from_marketing_form",
        ip_address: input.ipAddress,
        new_data: { marketingFormId: form.id, sourceId: fallbackSource.id, fullName, phone },
      },
    });
    const submission = await createSubmission("processed", undefined, lead.id);
    return { ok: true as const, data: { submissionId: submission.id, leadId: lead.id, status: "processed", message: asStringSetting(successSettings, "message") || undefined, redirectUrl: asStringSetting(successSettings, "redirectUrl") || undefined } };
  });
}
