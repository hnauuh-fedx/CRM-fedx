import { prisma } from "../../database/prisma";
import type { CampaignViewer } from "./campaign-list.service";
import { getCampaignVisibilityWhere } from "./campaign-list.service";

export type LeadSourceListQuery = {
  page: number;
  limit: number;
  search?: string;
  type?: string;
  institutionProgramId?: string;
  sortBy: "createdAt" | "name" | "type";
  sortOrder: "asc" | "desc";
};

export type UtmTrackingListQuery = {
  page: number;
  limit: number;
  search?: string;
  source?: string;
  medium?: string;
  campaignId?: string;
  fromDate?: string;
  toDate?: string;
  institutionProgramId?: string;
  sortBy: "createdAt" | "source" | "medium";
  sortOrder: "asc" | "desc";
};

export type MarketingFormListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  platform?: string;
  campaignId?: string;
  institutionProgramId?: string;
  sortBy: "createdAt" | "name" | "platform" | "status";
  sortOrder: "asc" | "desc";
};

export type MarketingFormSubmissionListQuery = {
  page: number;
  limit: number;
  status?: string;
};

const leadSourceSortFields = {
  createdAt: "created_at",
  name: "name",
  type: "type",
} as const;
const utmSortFields = {
  createdAt: "created_at",
  source: "utm_source",
  medium: "utm_medium",
} as const;
const formSortFields = {
  createdAt: "created_at",
  name: "name",
  platform: "platform",
  status: "status",
} as const;

export async function listLeadSources(query: LeadSourceListQuery) {
  const where = {
    AND: [
      ...(query.search
        ? [
            {
              OR: [
                { name: { contains: query.search, mode: "insensitive" as const } },
                { type: { contains: query.search, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
      ...(query.type ? [{ type: query.type }] : []),
      ...(query.institutionProgramId
        ? [{ OR: [{ institution_program_id: query.institutionProgramId }, { institution_program_id: null }] }]
        : []),
    ],
  };
  const [items, total] = await prisma.$transaction([
    prisma.lead_sources.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        created_at: true,
        institution_programs: { select: { id: true, name: true, institutions: { select: { name: true } } } },
        _count: { select: { leads: { where: { deleted_at: null } } } },
      },
      orderBy: [{ [leadSourceSortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.lead_sources.count({ where }),
  ]);

  return {
    data: items.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.type,
      institutionProgram: source.institution_programs
        ? { id: source.institution_programs.id, name: source.institution_programs.name, institutionName: source.institution_programs.institutions.name }
        : null,
      createdAt: source.created_at?.toISOString() ?? null,
      activeLeadCount: source._count.leads,
    })),
    pagination: pagination(query.page, query.limit, total),
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: { search: query.search ?? "", type: query.type ?? "", institutionProgramId: query.institutionProgramId ?? "" },
  };
}

export async function getLeadSourceFilterOptions() {
  const [types, institutionPrograms] = await prisma.$transaction([
    prisma.lead_sources.findMany({ select: { type: true }, distinct: ["type"], take: 100 }),
    prisma.institution_programs.findMany({ where: { status: "active" }, select: { id: true, name: true, institutions: { select: { name: true } } }, orderBy: { name: "asc" } }),
  ]);
  return {
    types: types.flatMap((source) => (source.type ? [source.type] : [])).sort(),
    institutionPrograms: institutionPrograms.map((program) => ({ id: program.id, name: program.name, institutionName: program.institutions.name })),
  };
}

export async function listUtmTrackings(user: CampaignViewer, query: UtmTrackingListQuery) {
  const campaignVisibility = getReferenceCampaignVisibility(user);
  const where = {
    AND: [
      ...campaignVisibility,
      ...(query.search
        ? [
            {
              OR: [
                { utm_source: { contains: query.search, mode: "insensitive" as const } },
                { utm_medium: { contains: query.search, mode: "insensitive" as const } },
                { utm_campaign: { contains: query.search, mode: "insensitive" as const } },
                { landing_page: { contains: query.search, mode: "insensitive" as const } },
                { campaigns: { is: { name: { contains: query.search, mode: "insensitive" as const } } } },
                { leads: { is: { full_name: { contains: query.search, mode: "insensitive" as const } } } },
              ],
            },
          ]
        : []),
      ...(query.source ? [{ utm_source: query.source }] : []),
      ...(query.medium ? [{ utm_medium: query.medium }] : []),
      ...(query.campaignId ? [{ campaign_id: query.campaignId }] : []),
      ...(query.institutionProgramId ? [{ campaigns: { is: { institution_program_id: query.institutionProgramId } } }] : []),
      ...(query.fromDate ? [{ created_at: { gte: new Date(`${query.fromDate}T00:00:00.000Z`) } }] : []),
      ...(query.toDate ? [{ created_at: { lte: new Date(`${query.toDate}T23:59:59.999Z`) } }] : []),
    ],
  };
  const [items, total] = await prisma.$transaction([
    prisma.utm_trackings.findMany({
      where,
      select: {
        id: true,
        utm_source: true,
        utm_medium: true,
        utm_campaign: true,
        utm_content: true,
        utm_term: true,
        landing_page: true,
        created_at: true,
        campaigns: { select: { id: true, name: true } },
        leads: { select: { id: true, lead_code: true, full_name: true } },
      },
      orderBy: [{ [utmSortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.utm_trackings.count({ where }),
  ]);

  return {
    data: items.map((tracking) => ({
      id: tracking.id,
      source: tracking.utm_source,
      medium: tracking.utm_medium,
      campaignName: tracking.utm_campaign,
      content: tracking.utm_content,
      term: tracking.utm_term,
      landingPage: tracking.landing_page,
      createdAt: tracking.created_at?.toISOString() ?? null,
      campaign: tracking.campaigns,
      lead: tracking.leads
        ? { id: tracking.leads.id, leadCode: tracking.leads.lead_code, fullName: tracking.leads.full_name }
        : null,
    })),
    pagination: pagination(query.page, query.limit, total),
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: {
      search: query.search ?? "",
      source: query.source ?? "",
      medium: query.medium ?? "",
      campaignId: query.campaignId ?? "",
      fromDate: query.fromDate ?? "",
      toDate: query.toDate ?? "",
    },
  };
}

export async function getUtmTrackingFilterOptions(user: CampaignViewer) {
  const campaignVisibility = getReferenceCampaignVisibility(user);
  const [sources, media, campaigns] = await prisma.$transaction([
    prisma.utm_trackings.findMany({ where: { AND: campaignVisibility }, select: { utm_source: true }, distinct: ["utm_source"], take: 100 }),
    prisma.utm_trackings.findMany({ where: { AND: campaignVisibility }, select: { utm_medium: true }, distinct: ["utm_medium"], take: 100 }),
    prisma.campaigns.findMany({ where: getCampaignVisibilityWhere(user), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    sources: sources.flatMap((item) => (item.utm_source ? [item.utm_source] : [])).sort(),
    media: media.flatMap((item) => (item.utm_medium ? [item.utm_medium] : [])).sort(),
    campaigns,
  };
}

export async function listMarketingForms(user: CampaignViewer, query: MarketingFormListQuery) {
  const campaignVisibility = getReferenceCampaignVisibility(user);
  const where = {
    AND: [
      ...campaignVisibility,
      ...(query.search
        ? [
            {
              OR: [
                { name: { contains: query.search, mode: "insensitive" as const } },
                { form_code: { contains: query.search, mode: "insensitive" as const } },
                { campaigns: { is: { name: { contains: query.search, mode: "insensitive" as const } } } },
              ],
            },
          ]
        : []),
      ...(query.status ? [{ status: query.status }] : []),
      ...(query.platform ? [{ platform: query.platform }] : []),
      ...(query.campaignId ? [{ campaign_id: query.campaignId }] : []),
      ...(query.institutionProgramId ? [{ campaigns: { is: { institution_program_id: query.institutionProgramId } } }] : []),
    ],
  };
  const [items, total] = await prisma.$transaction([
    prisma.marketing_forms.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        platform: true,
        form_code: true,
        form_type: true,
        title: true,
        subtitle: true,
        description: true,
        submit_button_label: true,
        source_id: true,
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
        _count: { select: { marketing_form_submissions: true } },
        campaigns: { select: { id: true, name: true } },
        lead_sources: { select: { id: true, name: true } },
        marketing_form_templates: { select: { id: true, name: true, preview_image: true, config: true, is_default: true } },
        marketing_form_fields: {
          select: { id: true, field_key: true, label: true, placeholder: true, field_type: true, is_required: true, options: true, validation_rules: true, lead_field: true, crm_mapping_field: true, default_value: true, sort_order: true, is_active: true },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
        marketing_form_field_mappings: {
          select: { id: true, form_field_id: true, source_field: true, lead_field: true, is_required: true, target_table: true, target_column: true, transform_rule: true },
          orderBy: { created_at: "asc" },
        },
      },
      orderBy: [{ [formSortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.marketing_forms.count({ where }),
  ]);

  return {
    data: items.map((form) => ({
      id: form.id,
      name: form.name,
      slug: form.slug,
      platform: form.platform,
      formCode: form.form_code,
      formType: form.form_type ?? "lead_form",
      title: form.title,
      subtitle: form.subtitle,
      description: form.description,
      submitButtonLabel: form.submit_button_label,
      submitButtonText: form.submit_button_label,
      sourceId: form.source_id,
      templateId: form.template_id,
      primaryColor: form.primary_color,
      backgroundColor: form.background_color,
      publicKey: form.public_key,
      publicPath: form.slug ? `/forms/${form.slug}` : form.public_key ? `/public/forms/${form.public_key}` : null,
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
        options: Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === "string") : [],
        validationRules: field.validation_rules,
        leadField: field.lead_field,
        crmMappingField: field.crm_mapping_field ?? field.lead_field,
        defaultValue: field.default_value,
        sortOrder: field.sort_order,
        isActive: field.is_active,
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
    })),
    pagination: pagination(query.page, query.limit, total),
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: {
      search: query.search ?? "",
      status: query.status ?? "",
      platform: query.platform ?? "",
      campaignId: query.campaignId ?? "",
    },
  };
}

export async function listMarketingFormSubmissions(user: CampaignViewer, formId: string, query: MarketingFormSubmissionListQuery) {
  const form = await prisma.marketing_forms.findFirst({
    where: { id: formId, AND: getReferenceCampaignVisibility(user) },
    select: { id: true },
  });
  if (!form) {
    return { ok: false as const, reason: "form_not_found" as const };
  }
  const where = {
    marketing_form_id: formId,
    ...(query.status ? { status: query.status } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.marketing_form_submissions.findMany({
      where,
      select: {
        id: true,
        lead_id: true,
        raw_payload: true,
        normalized_payload: true,
        answers: true,
        source: true,
        status: true,
        error_message: true,
        created_at: true,
        leads: { select: { id: true, lead_code: true, full_name: true, phone: true } },
      },
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.marketing_form_submissions.count({ where }),
  ]);
  return {
    ok: true as const,
    data: {
      data: items.map((submission) => ({
        id: submission.id,
        leadId: submission.lead_id,
        lead: submission.leads
          ? { id: submission.leads.id, leadCode: submission.leads.lead_code, fullName: submission.leads.full_name, phone: submission.leads.phone }
          : null,
        rawPayload: submission.raw_payload,
        normalizedPayload: submission.normalized_payload,
        answers: submission.answers,
        source: submission.source,
        status: submission.status,
        errorMessage: submission.error_message,
        createdAt: submission.created_at?.toISOString() ?? null,
      })),
      pagination: pagination(query.page, query.limit, total),
      filters: { status: query.status ?? "" },
    },
  };
}

export async function getMarketingFormFilterOptions(user: CampaignViewer, institutionProgramId?: string) {
  const campaignVisibility = getReferenceCampaignVisibility(user);
  const [statuses, platforms, campaigns] = await prisma.$transaction([
    prisma.marketing_forms.findMany({ where: { AND: campaignVisibility }, select: { status: true }, distinct: ["status"], take: 100 }),
    prisma.marketing_forms.findMany({ where: { AND: campaignVisibility }, select: { platform: true }, distinct: ["platform"], take: 100 }),
    prisma.campaigns.findMany({
      where: { ...getCampaignVisibilityWhere(user), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    statuses: statuses.flatMap((item) => (item.status ? [item.status] : [])).sort(),
    platforms: platforms.flatMap((item) => (item.platform ? [item.platform] : [])).sort(),
    campaigns,
  };
}

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export function getReferenceCampaignVisibility(user: CampaignViewer) {
  return user.permissions.includes("campaign.view_all")
    ? []
    : [{ campaigns: { is: getCampaignVisibilityWhere(user) } }];
}
