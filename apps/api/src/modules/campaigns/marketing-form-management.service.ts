import { randomBytes } from "node:crypto";

import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { getCampaignVisibilityWhere } from "./campaign-list.service";
import { getReferenceCampaignVisibility } from "./marketing-reference.service";

export const supportedLeadMappingFields = [
  "full_name",
  "phone",
  "email",
  "gender",
  "date_of_birth",
  "note",
  "source_id",
  "institution_program_id",
  "major_id",
] as const;

export const supportedMarketingFormFieldTypes = [
  "text",
  "textarea",
  "phone",
  "email",
  "number",
  "select",
  "radio",
  "checkbox",
  "date",
  "province",
  "file",
  "hidden",
  "single_select",
  "multi_select",
  "rating",
] as const;

export const supportedMarketingFormTypes = ["lead_form", "survey", "external_webhook"] as const;
export const supportedMarketingFormStatuses = ["draft", "published", "archived", "active", "inactive", "closed"] as const;

type MarketingFormFieldInput = {
  id?: string;
  fieldKey: string;
  label: string;
  placeholder?: string;
  fieldType: typeof supportedMarketingFormFieldTypes[number];
  isRequired: boolean;
  options?: string[];
  validationRules?: Record<string, unknown> | null;
  leadField?: typeof supportedLeadMappingFields[number];
  crmMappingField?: typeof supportedLeadMappingFields[number];
  defaultValue?: string;
  sortOrder: number;
  isActive: boolean;
};
type MarketingFormSettingsInput = Record<string, unknown>;

export type MarketingFormInput = {
  name: string;
  slug?: string;
  platform?: string;
  formCode?: string;
  campaignId?: string;
  sourceId?: string;
  formType?: typeof supportedMarketingFormTypes[number];
  title?: string;
  subtitle?: string;
  description?: string;
  submitButtonLabel?: string;
  submitButtonText?: string;
  templateId?: string;
  primaryColor?: string;
  backgroundColor?: string;
  webhookEnabled?: boolean;
  status: typeof supportedMarketingFormStatuses[number];
  displaySettings?: MarketingFormSettingsInput;
  duplicateSettings?: MarketingFormSettingsInput;
  successSettings?: MarketingFormSettingsInput;
  accessSettings?: MarketingFormSettingsInput;
  closeSettings?: MarketingFormSettingsInput;
  advancedSettings?: MarketingFormSettingsInput;
  fields?: MarketingFormFieldInput[];
  mappings?: Array<{
    sourceField: string;
    leadField?: typeof supportedLeadMappingFields[number];
    targetTable?: string;
    targetColumn?: string;
    isRequired: boolean;
    transformRule?: Record<string, unknown> | null;
  }>;
};

type MarketingFormActor = Pick<AuthUser, "id" | "permissions" | "departmentIds" | "accessScope">;

function normalizeStatus(status: MarketingFormInput["status"]) {
  if (status === "active") return "published";
  if (status === "inactive" || status === "closed") return "archived";
  return status;
}

function slugify(value: string) {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return base || `form-${randomBytes(4).toString("hex")}`;
}

function generatePublicKey() {
  return randomBytes(18).toString("hex");
}

function generateWebhookSecret() {
  return randomBytes(24).toString("hex");
}

async function uniqueSlug(base: string, existingId?: string) {
  const slug = slugify(base);
  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? slug : `${slug}-${index + 1}`;
    const found = await prisma.marketing_forms.findFirst({
      where: { slug: candidate, ...(existingId ? { id: { not: existingId } } : {}) },
      select: { id: true },
    });
    if (!found) return candidate;
  }
  return `${slug}-${randomBytes(4).toString("hex")}`;
}

function toData(input: MarketingFormInput, slug: string) {
  return {
    name: input.name.trim(),
    slug,
    platform: input.platform?.trim() || null,
    form_code: input.formCode?.trim() || null,
    campaign_id: input.campaignId || null,
    source_id: input.sourceId || null,
    form_type: input.formType ?? "lead_form",
    title: input.title?.trim() || input.name.trim(),
    subtitle: input.subtitle?.trim() || null,
    description: input.description?.trim() || null,
    submit_button_label: input.submitButtonText?.trim() || input.submitButtonLabel?.trim() || "Gửi thông tin",
    template_id: input.templateId || null,
    primary_color: input.primaryColor?.trim() || "#0f62fe",
    background_color: input.backgroundColor?.trim() || "#f8fafc",
    webhook_enabled: input.webhookEnabled ?? false,
    display_settings: (input.displaySettings ?? {}) as Prisma.InputJsonValue,
    duplicate_settings: (input.duplicateSettings ?? {}) as Prisma.InputJsonValue,
    success_settings: (input.successSettings ?? {}) as Prisma.InputJsonValue,
    access_settings: (input.accessSettings ?? {}) as Prisma.InputJsonValue,
    close_settings: (input.closeSettings ?? {}) as Prisma.InputJsonValue,
    advanced_settings: (input.advancedSettings ?? {}) as Prisma.InputJsonValue,
    status: normalizeStatus(input.status),
    updated_at: new Date(),
  };
}

function mappingLabel(leadField: typeof supportedLeadMappingFields[number]) {
  const labels: Record<typeof supportedLeadMappingFields[number], string> = {
    full_name: "Họ và tên",
    phone: "Số điện thoại",
    email: "Email",
    gender: "Giới tính",
    date_of_birth: "Ngày sinh",
    note: "Ghi chú",
    source_id: "Nguồn lead",
    institution_program_id: "Chương trình",
    major_id: "Ngành đăng ký",
  };
  return labels[leadField];
}

function fieldTypeFromLeadField(leadField: typeof supportedLeadMappingFields[number]): MarketingFormFieldInput["fieldType"] {
  if (leadField === "email") return "email";
  if (leadField === "phone") return "phone";
  if (leadField === "date_of_birth") return "date";
  if (leadField === "note") return "textarea";
  if (leadField === "source_id" || leadField === "institution_program_id" || leadField === "major_id") return "select";
  return "text";
}

function defaultFieldsFromMappings(input: MarketingFormInput): MarketingFormFieldInput[] {
  return (input.mappings ?? []).map((mapping, index) => {
    const leadField = mapping.leadField ?? (supportedLeadMappingFields.includes(mapping.targetColumn as typeof supportedLeadMappingFields[number])
      ? mapping.targetColumn as typeof supportedLeadMappingFields[number]
      : "note");
    return {
      fieldKey: mapping.sourceField,
      label: mappingLabel(leadField),
      placeholder: "",
      fieldType: fieldTypeFromLeadField(leadField),
      isRequired: mapping.isRequired,
      options: [],
      leadField,
      crmMappingField: leadField,
      sortOrder: index,
      isActive: true,
    };
  });
}

function toFields(input: MarketingFormInput) {
  const fields = input.fields?.length ? input.fields : defaultFieldsFromMappings(input);
  return fields.map((field, index) => {
    const crmMappingField = field.crmMappingField ?? field.leadField ?? null;
    return {
      field_key: field.fieldKey.trim(),
      label: field.label.trim(),
      placeholder: field.placeholder?.trim() || null,
      field_type: field.fieldType,
      is_required: field.isRequired,
      options: (field.options ?? []).filter(Boolean) as Prisma.InputJsonValue,
      validation_rules: (field.validationRules ?? {}) as Prisma.InputJsonValue,
      lead_field: crmMappingField,
      crm_mapping_field: crmMappingField,
      default_value: field.defaultValue?.trim() || null,
      sort_order: field.sortOrder ?? index,
      is_active: field.isActive,
      updated_at: new Date(),
    };
  });
}

function toMappings(input: MarketingFormInput, fields: Array<{ field_key: string; crm_mapping_field: string | null; is_required: boolean }>) {
  const explicit = input.mappings ?? [];
  const source = explicit.length
    ? explicit
    : fields.flatMap((field) => field.crm_mapping_field
        ? [{ sourceField: field.field_key, targetTable: "leads", targetColumn: field.crm_mapping_field, leadField: field.crm_mapping_field as typeof supportedLeadMappingFields[number], isRequired: field.is_required, transformRule: {} }]
        : []);
  return source.map((mapping) => {
    const targetColumn = mapping.targetColumn ?? mapping.leadField ?? "note";
    return {
      source_field: mapping.sourceField.trim(),
      lead_field: mapping.leadField ?? (targetColumn as typeof supportedLeadMappingFields[number]),
      is_required: mapping.isRequired,
      target_table: mapping.targetTable?.trim() || "leads",
      target_column: targetColumn,
      transform_rule: (mapping.transformRule ?? {}) as Prisma.InputJsonValue,
    };
  });
}

async function canLinkCampaign(actor: MarketingFormActor, campaignId?: string, institutionProgramId?: string) {
  if (!campaignId) return true;
  return Boolean(await prisma.campaigns.findFirst({
    where: {
      id: campaignId,
      ...getCampaignVisibilityWhere(actor),
      ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
    },
    select: { id: true },
  }));
}

async function canLinkSource(sourceId?: string, institutionProgramId?: string) {
  if (!sourceId) return true;
  return Boolean(await prisma.lead_sources.findFirst({
    where: {
      id: sourceId,
      ...(institutionProgramId ? { OR: [{ institution_program_id: institutionProgramId }, { institution_program_id: null }] } : {}),
    },
    select: { id: true },
  }));
}

async function canLinkTemplate(templateId?: string) {
  if (!templateId) return true;
  return Boolean(await prisma.marketing_form_templates.findFirst({ where: { id: templateId }, select: { id: true } }));
}

async function assertLinks(actor: MarketingFormActor, input: MarketingFormInput, institutionProgramId?: string) {
  if (!await canLinkCampaign(actor, input.campaignId, institutionProgramId)) return "campaign_not_found" as const;
  if (!await canLinkSource(input.sourceId, institutionProgramId)) return "source_not_found" as const;
  if (!await canLinkTemplate(input.templateId)) return "template_not_found" as const;
  return null;
}

function selectFormDetail() {
  return {
    id: true,
    name: true,
    slug: true,
    platform: true,
    form_code: true,
    campaign_id: true,
    source_id: true,
    form_type: true,
    title: true,
    subtitle: true,
    description: true,
    submit_button_label: true,
    template_id: true,
    primary_color: true,
    background_color: true,
    public_key: true,
    webhook_enabled: true,
    status: true,
    created_at: true,
    updated_at: true,
    display_settings: true,
    duplicate_settings: true,
    success_settings: true,
    access_settings: true,
    close_settings: true,
    advanced_settings: true,
    users: { select: { id: true, email: true, full_name: true } },
    campaigns: { select: { id: true, name: true } },
    lead_sources: { select: { id: true, name: true } },
    marketing_form_templates: { select: { id: true, name: true, preview_image: true, config: true, is_default: true } },
    marketing_form_fields: {
      select: {
        id: true,
        field_key: true,
        label: true,
        placeholder: true,
        field_type: true,
        is_required: true,
        options: true,
        validation_rules: true,
        lead_field: true,
        crm_mapping_field: true,
        default_value: true,
        sort_order: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: [{ sort_order: "asc" as const }, { id: "asc" as const }],
    },
    marketing_form_field_mappings: {
      select: { id: true, form_field_id: true, source_field: true, lead_field: true, is_required: true, target_table: true, target_column: true, transform_rule: true },
      orderBy: { created_at: "asc" as const },
    },
    _count: { select: { marketing_form_submissions: true } },
  };
}

export function serializeMarketingForm(form: Prisma.marketing_formsGetPayload<{ select: ReturnType<typeof selectFormDetail> }>) {
  return {
    id: form.id,
    name: form.name,
    slug: form.slug,
    platform: form.platform,
    formCode: form.form_code,
    campaignId: form.campaign_id,
    sourceId: form.source_id,
    formType: form.form_type ?? "lead_form",
    title: form.title,
    subtitle: form.subtitle,
    description: form.description,
    submitButtonLabel: form.submit_button_label,
    submitButtonText: form.submit_button_label,
    templateId: form.template_id,
    primaryColor: form.primary_color,
    backgroundColor: form.background_color,
    publicKey: form.public_key,
    publicPath: form.slug ? `/forms/${form.slug}` : form.public_key ? `/bieu-mau/${form.public_key}` : null,
    webhookEnabled: form.webhook_enabled ?? false,
    webhookPath: form.slug ? `/public/webhooks/forms/${form.slug}` : form.public_key ? `/public/webhooks/forms/${form.public_key}` : null,
    submissionCount: form._count.marketing_form_submissions,
    status: form.status,
    createdAt: form.created_at?.toISOString() ?? null,
    updatedAt: form.updated_at?.toISOString() ?? null,
    displaySettings: form.display_settings ?? {},
    duplicateSettings: form.duplicate_settings ?? {},
    successSettings: form.success_settings ?? {},
    accessSettings: form.access_settings ?? {},
    closeSettings: form.close_settings ?? {},
    advancedSettings: form.advanced_settings ?? {},
    creator: form.users ? { id: form.users.id, email: form.users.email, fullName: form.users.full_name } : null,
    campaign: form.campaigns,
    source: form.lead_sources,
    template: form.marketing_form_templates,
    fields: form.marketing_form_fields.map((field) => ({
      id: field.id,
      fieldKey: field.field_key,
      label: field.label,
      placeholder: field.placeholder,
      fieldType: field.field_type,
      isRequired: field.is_required,
      required: field.is_required,
      options: Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === "string") : [],
      validationRules: field.validation_rules,
      leadField: field.lead_field,
      crmMappingField: field.crm_mapping_field ?? field.lead_field,
      defaultValue: field.default_value,
      sortOrder: field.sort_order,
      isActive: field.is_active,
      createdAt: field.created_at?.toISOString() ?? null,
      updatedAt: field.updated_at?.toISOString() ?? null,
    })),
    mappings: form.marketing_form_field_mappings.map((mapping) => ({
      id: mapping.id,
      formFieldId: mapping.form_field_id,
      sourceField: mapping.source_field,
      leadField: mapping.lead_field,
      isRequired: mapping.is_required,
      targetTable: mapping.target_table ?? "leads",
      targetColumn: mapping.target_column ?? mapping.lead_field,
      transformRule: mapping.transform_rule,
    })),
  };
}

export async function createMarketingForm(
  actor: MarketingFormActor,
  input: MarketingFormInput,
  institutionProgramId?: string,
  ipAddress?: string,
) {
  const linkError = await assertLinks(actor, input, institutionProgramId);
  if (linkError) return { ok: false as const, reason: linkError };
  const slug = await uniqueSlug(input.slug || input.name);
  const data = toData(input, slug);
  const fields = toFields(input);
  const mappings = toMappings(input, fields);
  const webhookSecret = generateWebhookSecret();
  return prisma.$transaction(async (tx) => {
    const form = await tx.marketing_forms.create({
      data: {
        ...data,
        public_key: generatePublicKey(),
        webhook_secret: webhookSecret,
        created_by: actor.id,
        created_at: new Date(),
        marketing_form_fields: { create: fields },
        marketing_form_field_mappings: { create: mappings },
      },
      select: { id: true, public_key: true, slug: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "marketing_form",
        entity_id: form.id,
        action: "create",
        ip_address: ipAddress,
        new_data: { ...data, fields, mappings },
      },
    });
    return { ok: true as const, data: { ...form, webhookSecret } };
  });
}

export async function getMarketingFormById(actor: MarketingFormActor, formId: string) {
  const form = await prisma.marketing_forms.findFirst({
    where: { id: formId, AND: getReferenceCampaignVisibility(actor) },
    select: selectFormDetail(),
  });
  return form ? { ok: true as const, data: serializeMarketingForm(form) } : { ok: false as const, reason: "form_not_found" as const };
}

export async function updateMarketingForm(
  actor: MarketingFormActor,
  formId: string,
  input: MarketingFormInput,
  institutionProgramId?: string,
  ipAddress?: string,
) {
  const linkError = await assertLinks(actor, input, institutionProgramId);
  if (linkError) return { ok: false as const, reason: linkError };
  const slug = await uniqueSlug(input.slug || input.name, formId);
  const data = toData(input, slug);
  const fields = toFields(input);
  const mappings = toMappings(input, fields);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketing_forms.findFirst({
      where: { id: formId, AND: getReferenceCampaignVisibility(actor) },
      select: selectFormDetail(),
    });
    if (!existing) {
      return { ok: false as const, reason: "form_not_found" as const };
    }
    await tx.marketing_forms.update({
      where: { id: formId },
      data: {
        ...data,
        marketing_form_fields: {
          deleteMany: {},
          create: fields,
        },
        marketing_form_field_mappings: {
          deleteMany: {},
          create: mappings,
        },
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "marketing_form",
        entity_id: formId,
        action: "update",
        ip_address: ipAddress,
        old_data: serializeMarketingForm(existing),
        new_data: { ...data, fields, mappings },
      },
    });
    return { ok: true as const, data: { id: formId, slug } };
  });
}

export async function publishMarketingForm(actor: MarketingFormActor, formId: string, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketing_forms.findFirst({
      where: { id: formId, AND: getReferenceCampaignVisibility(actor) },
      select: { id: true, status: true, slug: true, public_key: true, marketing_form_fields: { where: { is_active: true }, select: { crm_mapping_field: true, lead_field: true } } },
    });
    if (!existing) return { ok: false as const, reason: "form_not_found" as const };
    const mapped = new Set(existing.marketing_form_fields.map((field) => field.crm_mapping_field ?? field.lead_field).filter(Boolean));
    if (!mapped.has("full_name") || !mapped.has("phone")) {
      return { ok: false as const, reason: "missing_required_mapping" as const };
    }
    await tx.marketing_forms.update({ where: { id: formId }, data: { status: "published", updated_at: new Date() } });
    await tx.audit_logs.create({
      data: { user_id: actor.id, entity_type: "marketing_form", entity_id: formId, action: "publish", ip_address: ipAddress, old_data: { status: existing.status }, new_data: { status: "published" } },
    });
    return { ok: true as const, data: { id: formId, status: "published", publicPath: existing.slug ? `/forms/${existing.slug}` : `/bieu-mau/${existing.public_key}` } };
  });
}

export async function duplicateMarketingForm(actor: MarketingFormActor, formId: string, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketing_forms.findFirst({
      where: { id: formId, AND: getReferenceCampaignVisibility(actor) },
      select: selectFormDetail(),
    });
    if (!existing) return { ok: false as const, reason: "form_not_found" as const };
    const slug = await uniqueSlug(`${existing.name}-copy`);
    const form = await tx.marketing_forms.create({
      data: {
        name: `${existing.name} (bản sao)`,
        slug,
        platform: existing.platform,
        form_code: existing.form_code,
        campaign_id: existing.campaign_id,
        source_id: existing.source_id,
        form_type: existing.form_type,
        title: existing.title,
        subtitle: existing.subtitle,
        description: existing.description,
        submit_button_label: existing.submit_button_label,
        template_id: existing.template_id,
        primary_color: existing.primary_color,
        background_color: existing.background_color,
        public_key: generatePublicKey(),
        webhook_enabled: existing.webhook_enabled,
        webhook_secret: generateWebhookSecret(),
        display_settings: existing.display_settings as Prisma.InputJsonValue,
        duplicate_settings: existing.duplicate_settings as Prisma.InputJsonValue,
        success_settings: existing.success_settings as Prisma.InputJsonValue,
        access_settings: existing.access_settings as Prisma.InputJsonValue,
        close_settings: existing.close_settings as Prisma.InputJsonValue,
        advanced_settings: existing.advanced_settings as Prisma.InputJsonValue,
        created_by: actor.id,
        status: "draft",
        created_at: new Date(),
        updated_at: new Date(),
        marketing_form_fields: {
          create: existing.marketing_form_fields.map((field) => ({
            field_key: field.field_key,
            label: field.label,
            placeholder: field.placeholder,
            field_type: field.field_type,
            is_required: field.is_required,
            options: field.options as Prisma.InputJsonValue,
            validation_rules: field.validation_rules as Prisma.InputJsonValue,
            lead_field: field.lead_field,
            crm_mapping_field: field.crm_mapping_field,
            default_value: field.default_value,
            sort_order: field.sort_order,
            is_active: field.is_active,
          })),
        },
        marketing_form_field_mappings: {
          create: existing.marketing_form_field_mappings.map((mapping) => ({
            source_field: mapping.source_field,
            lead_field: mapping.lead_field,
            is_required: mapping.is_required,
            target_table: mapping.target_table ?? "leads",
            target_column: mapping.target_column ?? mapping.lead_field,
            transform_rule: mapping.transform_rule as Prisma.InputJsonValue,
          })),
        },
      },
      select: { id: true, slug: true },
    });
    await tx.audit_logs.create({
      data: { user_id: actor.id, entity_type: "marketing_form", entity_id: form.id, action: "duplicate", ip_address: ipAddress, old_data: { sourceFormId: formId }, new_data: { slug } },
    });
    return { ok: true as const, data: form };
  });
}

export async function rotateMarketingFormWebhookSecret(actor: MarketingFormActor, formId: string, ipAddress?: string) {
  const webhookSecret = generateWebhookSecret();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketing_forms.findFirst({
      where: { id: formId, AND: getReferenceCampaignVisibility(actor) },
      select: { id: true, webhook_secret: true },
    });
    if (!existing) {
      return { ok: false as const, reason: "form_not_found" as const };
    }
    await tx.marketing_forms.update({
      where: { id: formId },
      data: { webhook_secret: webhookSecret, updated_at: new Date() },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "marketing_form",
        entity_id: formId,
        action: "rotate_webhook_secret",
        ip_address: ipAddress,
      },
    });
    return { ok: true as const, data: { id: formId, webhookSecret } };
  });
}

export async function deleteMarketingForm(actor: MarketingFormActor, formId: string, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketing_forms.findFirst({
      where: { id: formId, AND: getReferenceCampaignVisibility(actor) },
      select: selectFormDetail(),
    });
    if (!existing) {
      return { ok: false as const, reason: "form_not_found" as const };
    }
    await tx.marketing_forms.delete({ where: { id: formId } });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "marketing_form",
        entity_id: formId,
        action: "delete",
        ip_address: ipAddress,
        old_data: serializeMarketingForm(existing),
      },
    });
    return { ok: true as const, data: { id: formId } };
  });
}

export async function listMarketingFormFields(actor: MarketingFormActor, formId: string) {
  const form = await getMarketingFormById(actor, formId);
  return form.ok ? { ok: true as const, data: form.data.fields } : form;
}

export async function createMarketingFormField(actor: MarketingFormActor, formId: string, input: MarketingFormFieldInput, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const form = await tx.marketing_forms.findFirst({ where: { id: formId, AND: getReferenceCampaignVisibility(actor) }, select: { id: true } });
    if (!form) return { ok: false as const, reason: "form_not_found" as const };
    const fieldData = toFields({ name: "field", status: "draft", fields: [input] })[0];
    const field = await tx.marketing_form_fields.create({ data: { ...fieldData, marketing_form_id: formId }, select: { id: true } });
    const targetColumn = fieldData.crm_mapping_field ?? fieldData.lead_field;
    if (targetColumn) {
      await tx.marketing_form_field_mappings.create({
        data: {
          marketing_form_id: formId,
          form_field_id: field.id,
          source_field: fieldData.field_key,
          lead_field: targetColumn,
          target_table: "leads",
          target_column: targetColumn,
          is_required: fieldData.is_required,
          transform_rule: {},
        },
      });
    }
    await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "marketing_form", entity_id: formId, action: "field_create", ip_address: ipAddress, new_data: fieldData } });
    return { ok: true as const, data: field };
  });
}

export async function updateMarketingFormField(actor: MarketingFormActor, fieldId: string, input: MarketingFormFieldInput, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketing_form_fields.findFirst({
      where: { id: fieldId, marketing_forms: { AND: getReferenceCampaignVisibility(actor) } },
      select: { id: true, marketing_form_id: true, field_key: true },
    });
    if (!existing) return { ok: false as const, reason: "field_not_found" as const };
    const fieldData = toFields({ name: "field", status: "draft", fields: [input] })[0];
    await tx.marketing_form_fields.update({ where: { id: fieldId }, data: fieldData });
    await tx.marketing_form_field_mappings.deleteMany({ where: { form_field_id: fieldId } });
    const targetColumn = fieldData.crm_mapping_field ?? fieldData.lead_field;
    if (targetColumn) {
      await tx.marketing_form_field_mappings.upsert({
        where: { marketing_form_id_source_field: { marketing_form_id: existing.marketing_form_id, source_field: fieldData.field_key } },
        create: {
          marketing_form_id: existing.marketing_form_id,
          form_field_id: fieldId,
          source_field: fieldData.field_key,
          lead_field: targetColumn,
          target_table: "leads",
          target_column: targetColumn,
          is_required: fieldData.is_required,
          transform_rule: {},
        },
        update: {
          form_field_id: fieldId,
          source_field: fieldData.field_key,
          lead_field: targetColumn,
          target_table: "leads",
          target_column: targetColumn,
          is_required: fieldData.is_required,
          transform_rule: {},
        },
      });
    }
    await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "marketing_form", entity_id: existing.marketing_form_id, action: "field_update", ip_address: ipAddress, old_data: { fieldKey: existing.field_key }, new_data: fieldData } });
    return { ok: true as const, data: { id: fieldId } };
  });
}

export async function deleteMarketingFormField(actor: MarketingFormActor, fieldId: string, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketing_form_fields.findFirst({
      where: { id: fieldId, marketing_forms: { AND: getReferenceCampaignVisibility(actor) } },
      select: { id: true, marketing_form_id: true, field_key: true, label: true },
    });
    if (!existing) return { ok: false as const, reason: "field_not_found" as const };
    await tx.marketing_form_fields.delete({ where: { id: fieldId } });
    await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "marketing_form", entity_id: existing.marketing_form_id, action: "field_delete", ip_address: ipAddress, old_data: existing } });
    return { ok: true as const, data: { id: fieldId } };
  });
}

export async function reorderMarketingFormFields(actor: MarketingFormActor, formId: string, fieldIds: string[], ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const form = await tx.marketing_forms.findFirst({ where: { id: formId, AND: getReferenceCampaignVisibility(actor) }, select: { id: true } });
    if (!form) return { ok: false as const, reason: "form_not_found" as const };
    for (const [index, fieldId] of fieldIds.entries()) {
      await tx.marketing_form_fields.updateMany({ where: { id: fieldId, marketing_form_id: formId }, data: { sort_order: index, updated_at: new Date() } });
    }
    await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "marketing_form", entity_id: formId, action: "field_reorder", ip_address: ipAddress, new_data: { fieldIds } } });
    return { ok: true as const, data: { id: formId } };
  });
}

export async function listMarketingFormTemplates() {
  const templates = await prisma.marketing_form_templates.findMany({
    select: { id: true, name: true, preview_image: true, config: true, is_default: true, created_at: true },
    orderBy: [{ is_default: "desc" }, { created_at: "asc" }, { id: "asc" }],
  });
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    previewImage: template.preview_image,
    config: template.config,
    isDefault: template.is_default,
    createdAt: template.created_at?.toISOString() ?? null,
  }));
}
