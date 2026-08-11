import type { AuthUser } from "../auth/auth.types";
import { prisma } from "../../database/prisma";

export const leadListPermissions = [
  "lead.view_all",
  "lead.view_department",
  "lead.view_assigned",
] as const;

const sensitiveLeadPermissions = new Set([
  "lead.sensitive.view",
  "lead.update_all",
  "lead.update_department",
  "lead.update_assigned",
]);

export type LeadListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  pipelineStageId?: string;
  sourceId?: string;
  institutionProgramId?: string;
  assigneeId?: string;
  sortBy: "createdAt" | "fullName" | "leadCode" | "status";
  sortOrder: "asc" | "desc";
};

const leadSortFields = {
  createdAt: "created_at",
  fullName: "full_name",
  leadCode: "lead_code",
  status: "status",
} as const;

function canViewSensitiveLeadData(user: AuthUser) {
  return user.permissions.some((permission) => sensitiveLeadPermissions.has(permission));
}

export function getLeadScopeWhere(user: AuthUser) {
  const permissions = new Set(user.permissions);

  if (user.accessScope === "ALL" && permissions.has("lead.view_all")) {
    return {};
  }

  if (user.accessScope === "OWNED_ONLY") {
    return { owner_id: user.id };
  }

  if (user.accessScope === "DEPARTMENT" || permissions.has("lead.view_department")) {
    if (user.departmentIds.length === 0) return { id: "00000000-0000-4000-8000-000000000000" };
    return {
      lead_assignments: {
        some: {
          department_id: { in: user.departmentIds },
          is_main_owner: true,
        },
      },
    };
  }

  if (!permissions.has("lead.view_assigned") && permissions.has("lead.view_all")) {
    return {};
  }

  return {
    OR: [
      { assigned_to: user.id },
      {
        lead_assignments: {
          some: {
            assigned_to: user.id,
            is_main_owner: true,
          },
        },
      },
    ],
  };
}

export async function listLeads(user: AuthUser, query: LeadListQuery) {
  const canViewSensitive = canViewSensitiveLeadData(user);
  const where = {
    AND: [
      { deleted_at: null },
      getLeadScopeWhere(user),
      ...(query.search
        ? [
            {
              OR: [
                { full_name: { contains: query.search, mode: "insensitive" as const } },
                { lead_code: { contains: query.search, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
      ...(query.status ? [{ status: query.status }] : []),
      ...(query.pipelineStageId ? [{ pipeline_stage_id: query.pipelineStageId }] : []),
      ...(query.sourceId ? [{ source_id: query.sourceId }] : []),
      ...(query.institutionProgramId ? [{ institution_program_id: query.institutionProgramId }] : []),
      ...(query.assigneeId ? [{ assigned_to: query.assigneeId }] : []),
    ],
  };
  const orderBy = {
    [leadSortFields[query.sortBy]]: query.sortOrder,
  };
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.leads.findMany({
      where,
      select: {
        id: true,
        lead_code: true,
        full_name: true,
        phone: true,
        email: true,
        gender: true,
        date_of_birth: true,
        cccd: true,
        note: true,
        status: true,
        temperature: true,
        created_at: true,
        institution_programs: {
          select: { id: true, name: true, institutions: { select: { name: true } } },
        },
        lead_sources: {
          select: {
            id: true,
            name: true,
          },
        },
        pipeline_stages: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        users_leads_assigned_toTousers: {
          select: {
            id: true,
            full_name: true,
          },
        },
        student_profiles: {
          select: {
            birth_place: true,
            nationality: true,
            ethnicity: true,
            religion: true,
            cccd_issue_date: true,
            cccd_issue_place: true,
            graduation_year: true,
            graduation_certificate: true,
            previous_graduation_certificate: true,
            graduation_major: true,
            graduation_rank: true,
            diploma_issue_place: true,
            academic_rank_12: true,
            conduct_rank_12: true,
            high_school_name: true,
            high_school_province: true,
            high_school_district: true,
            current_job: true,
            company_name: true,
          },
        },
        addresses: {
          select: { type: true, province: true, district: true, ward: true, hamlet: true, detail_address: true },
        },
        relatives: {
          select: {
            full_name: true,
            relationship: true,
            phone: true,
            job: true,
            is_primary: true,
            addresses: { select: { detail_address: true } },
          },
        },
        admission_profiles: {
          select: {
            training_code: true,
            class_code: true,
            subject_group_code: true,
            subject_group_name: true,
            score_1: true,
            score_2: true,
            score_3: true,
            admission_score: true,
            enrollment_batch: true,
            registration_station: true,
            decision_number: true,
            decision_signed_date: true,
            monthly_revenue: true,
            majors: { select: { name: true } },
            admission_statuses: { select: { name: true } },
          },
        },
        utm_trackings: { select: { gclid: true }, orderBy: { created_at: "asc" }, take: 1 },
      },
      orderBy: [orderBy, { id: "asc" }],
      skip,
      take: query.limit,
    }),
    prisma.leads.count({ where }),
  ]);
  const tagRelations = items.length === 0
    ? []
    : await prisma.entity_tags.findMany({
        where: { entity_type: "lead", entity_id: { in: items.map((lead) => lead.id) } },
        select: { entity_id: true, tags: { select: { name: true } } },
        orderBy: { created_at: "asc" },
      });
  const tagsByLeadId = new Map<string, string[]>();
  for (const relation of tagRelations) {
    if (!relation.tags) {
      continue;
    }
    const tags = tagsByLeadId.get(relation.entity_id) ?? [];
    tags.push(relation.tags.name);
    tagsByLeadId.set(relation.entity_id, tags);
  }

  return {
    data: items.map((lead) => {
      const profile = lead.student_profiles;
      const specificAddress = lead.addresses.find((address) => address.type === "specific");
      const permanentAddress = lead.addresses.find((address) => address.type === "permanent");
      const currentAddress = lead.addresses.find((address) => address.type === "current");
      const currentResidence = lead.addresses.find((address) => address.type === "residence");
      const primaryRelative = lead.relatives.find((relative) => relative.is_primary);
      const secondaryRelative = lead.relatives.find((relative) => !relative.is_primary);
      const admission = lead.admission_profiles;

      return {
        id: lead.id,
        leadCode: lead.lead_code,
        fullName: lead.full_name,
        phone: canViewSensitive ? lead.phone : null,
        email: canViewSensitive ? lead.email : null,
        gender: lead.gender,
        dateOfBirth: lead.date_of_birth?.toISOString().slice(0, 10) ?? null,
        birthPlace: profile?.birth_place ?? null,
        cccd: canViewSensitive ? lead.cccd : null,
        cccdIssueDate: canViewSensitive ? profile?.cccd_issue_date?.toISOString().slice(0, 10) ?? null : null,
        cccdIssuePlace: canViewSensitive ? profile?.cccd_issue_place ?? null : null,
        nationality: profile?.nationality ?? null,
        ethnicity: profile?.ethnicity ?? null,
        religion: profile?.religion ?? null,
        specificAddress: canViewSensitive ? specificAddress?.detail_address ?? null : null,
        graduationYear: profile?.graduation_year?.toString() ?? null,
        graduationCertificate: profile?.graduation_certificate ?? null,
        previousGraduationCertificate: profile?.previous_graduation_certificate ?? null,
        graduationMajor: profile?.graduation_major ?? null,
        graduationRank: profile?.graduation_rank ?? null,
        diplomaIssuePlace: profile?.diploma_issue_place ?? null,
        academicRank12: profile?.academic_rank_12 ?? null,
        conductRank12: profile?.conduct_rank_12 ?? null,
        highSchoolName: profile?.high_school_name ?? null,
        highSchoolProvince: profile?.high_school_province ?? null,
        highSchoolDistrict: profile?.high_school_district ?? null,
        province: canViewSensitive ? currentAddress?.province ?? null : null,
        district: canViewSensitive ? currentAddress?.district ?? null : null,
        ward: canViewSensitive ? currentAddress?.ward ?? null : null,
        hamlet: canViewSensitive ? currentAddress?.hamlet ?? null : null,
        currentAddress: canViewSensitive ? currentAddress?.detail_address ?? null : null,
        permanentAddress: canViewSensitive ? permanentAddress?.detail_address ?? null : null,
        currentResidence: canViewSensitive ? currentResidence?.detail_address ?? null : null,
        currentJob: profile?.current_job ?? null,
        companyName: profile?.company_name ?? null,
        relative1FullName: canViewSensitive ? primaryRelative?.full_name ?? null : null,
        relative1Relationship: canViewSensitive ? primaryRelative?.relationship ?? null : null,
        relative1Phone: canViewSensitive ? primaryRelative?.phone ?? null : null,
        relative1Job: primaryRelative?.job ?? null,
        relative1Address: canViewSensitive ? primaryRelative?.addresses?.detail_address ?? null : null,
        relative2FullName: canViewSensitive ? secondaryRelative?.full_name ?? null : null,
        relative2Relationship: canViewSensitive ? secondaryRelative?.relationship ?? null : null,
        relative2Phone: canViewSensitive ? secondaryRelative?.phone ?? null : null,
        relative2Job: secondaryRelative?.job ?? null,
        relative2Address: canViewSensitive ? secondaryRelative?.addresses?.detail_address ?? null : null,
        majorName: admission?.majors?.name ?? null,
        institutionProgram: lead.institution_programs
          ? {
              id: lead.institution_programs.id,
              name: lead.institution_programs.name,
              institutionName: lead.institution_programs.institutions.name,
            }
          : null,
        admissionStatusName: admission?.admission_statuses?.name ?? null,
        trainingCode: admission?.training_code ?? null,
        classCode: admission?.class_code ?? null,
        subjectGroupCode: admission?.subject_group_code ?? null,
        subjectGroupName: admission?.subject_group_name ?? null,
        score1: admission?.score_1?.toString() ?? null,
        score2: admission?.score_2?.toString() ?? null,
        score3: admission?.score_3?.toString() ?? null,
        admissionScore: admission?.admission_score?.toString() ?? null,
        enrollmentBatch: admission?.enrollment_batch ?? null,
        registrationStation: admission?.registration_station ?? null,
        decisionNumber: admission?.decision_number ?? null,
        decisionSignedDate: admission?.decision_signed_date?.toISOString().slice(0, 10) ?? null,
        monthlyRevenue: admission?.monthly_revenue?.toString() ?? null,
        gclid: lead.utm_trackings[0]?.gclid ?? null,
        tags: (tagsByLeadId.get(lead.id) ?? []).join(", "),
        note: lead.note,
        temperature: lead.temperature,
        status: lead.status,
        source: lead.lead_sources
          ? { id: lead.lead_sources.id, name: lead.lead_sources.name }
          : null,
        pipelineStage: lead.pipeline_stages
          ? {
              id: lead.pipeline_stages.id,
              name: lead.pipeline_stages.name,
              color: lead.pipeline_stages.color,
            }
          : null,
        assignee: lead.users_leads_assigned_toTousers
          ? {
              id: lead.users_leads_assigned_toTousers.id,
              fullName: lead.users_leads_assigned_toTousers.full_name,
            }
          : null,
        createdAt: lead.created_at?.toISOString() ?? null,
      };
    }),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
    sort: {
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    },
    filters: {
      search: query.search ?? "",
      status: query.status ?? "",
      pipelineStageId: query.pipelineStageId ?? "",
      sourceId: query.sourceId ?? "",
      institutionProgramId: query.institutionProgramId ?? "",
      assigneeId: query.assigneeId ?? "",
    },
  };
}

export async function getLeadFilterOptions(user: AuthUser, institutionProgramId?: string) {
  const scopeWhere = {
    deleted_at: null,
    ...getLeadScopeWhere(user),
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };

  const [sources, institutionPrograms, assignees, statuses, stages, stageCounts, totalLeads] = await prisma.$transaction([
    prisma.lead_sources.findMany({
      where: { leads: { some: scopeWhere } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.institution_programs.findMany({
      where: { leads: { some: scopeWhere } },
      select: { id: true, name: true, institutions: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.users.findMany({
      where: {
        deleted_at: null,
        status: "active",
        leads_leads_assigned_toTousers: { some: scopeWhere },
      },
      select: { id: true, full_name: true },
      orderBy: { full_name: "asc" },
    }),
    prisma.leads.findMany({
      where: scopeWhere,
      select: { status: true },
      distinct: ["status"],
      take: 100,
    }),
    prisma.pipeline_stages.findMany({
      select: { id: true, name: true, color: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    prisma.leads.groupBy({
      by: ["pipeline_stage_id"],
      where: scopeWhere,
      _count: { _all: true },
    }),
    prisma.leads.count({ where: scopeWhere }),
  ]);
  const stageCountById = new Map(
    stageCounts.flatMap((item) => (item.pipeline_stage_id ? [[item.pipeline_stage_id, item._count._all] as const] : [])),
  );

  return {
    sources,
    institutionPrograms: institutionPrograms.map((program) => ({
      id: program.id,
      name: program.name,
      institutionName: program.institutions.name,
    })),
    assignees: assignees.map((userItem) => ({
      id: userItem.id,
      fullName: userItem.full_name,
    })),
    statuses: statuses.flatMap((lead) => (lead.status ? [lead.status] : [])).sort(),
    stages: stages.map((stage) => ({
      ...stage,
      count: stageCountById.get(stage.id) ?? 0,
    })),
    totalLeads,
  };
}

export async function getLeadDetail(user: AuthUser, leadId: string, institutionProgramId?: string) {
  const canViewSensitive = canViewSensitiveLeadData(user);
  const lead = await prisma.leads.findFirst({
    where: {
      id: leadId,
      deleted_at: null,
      ...getLeadScopeWhere(user),
      ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
    },
    select: {
      id: true,
      lead_code: true,
      full_name: true,
      phone: true,
      email: true,
      gender: true,
      date_of_birth: true,
      cccd: true,
      note: true,
      status: true,
      lead_score: true,
      temperature: true,
      created_at: true,
      updated_at: true,
      institution_programs: { select: { id: true, name: true, institutions: { select: { name: true } } } },
      lead_sources: { select: { id: true, name: true } },
      pipeline_stages: { select: { id: true, name: true, color: true } },
      users_leads_assigned_toTousers: { select: { id: true, full_name: true } },
      users_leads_owner_idTousers: { select: { id: true, full_name: true } },
      student_profiles: {
        select: {
          birth_place: true,
          nationality: true,
          ethnicity: true,
          religion: true,
          cccd_issue_date: true,
          cccd_issue_place: true,
          graduation_year: true,
          graduation_certificate: true,
          previous_graduation_certificate: true,
          graduation_major: true,
          graduation_rank: true,
          diploma_issue_place: true,
          academic_rank_12: true,
          conduct_rank_12: true,
          high_school_name: true,
          high_school_province: true,
          high_school_district: true,
          current_job: true,
          company_name: true,
        },
      },
      addresses: {
        select: { type: true, province: true, district: true, ward: true, hamlet: true, detail_address: true },
      },
      relatives: {
        select: {
          full_name: true,
          relationship: true,
          phone: true,
          job: true,
          is_primary: true,
          addresses: { select: { detail_address: true } },
        },
      },
      admission_profiles: {
        select: {
          institution_program_id: true,
          major_id: true,
          admission_status_id: true,
          training_code: true,
          class_code: true,
          subject_group_code: true,
          subject_group_name: true,
          score_1: true,
          score_2: true,
          score_3: true,
          admission_score: true,
          enrollment_batch: true,
          registration_station: true,
          decision_number: true,
          decision_signed_date: true,
          monthly_revenue: true,
        },
      },
      utm_trackings: { select: { gclid: true }, orderBy: { created_at: "asc" }, take: 1 },
      lead_assignments: {
        select: {
          id: true,
          assigned_at: true,
          is_main_owner: true,
          users_lead_assignments_assigned_toTousers: { select: { id: true, full_name: true } },
          departments: { select: { id: true, name: true } },
        },
        orderBy: { assigned_at: "desc" },
        take: 20,
      },
      lead_status_histories: {
        select: {
          id: true,
          changed_at: true,
          pipeline_stages_lead_status_histories_from_stage_idTopipeline_stages: {
            select: { id: true, name: true },
          },
          pipeline_stages_lead_status_histories_to_stage_idTopipeline_stages: {
            select: { id: true, name: true },
          },
          users: { select: { id: true, full_name: true } },
        },
        orderBy: { changed_at: "desc" },
        take: 20,
      },
      lead_notes: {
        select: {
          id: true,
          content: true,
          created_at: true,
          users: { select: { id: true, full_name: true } },
        },
        orderBy: { created_at: "desc" },
        take: 30,
      },
      lead_activities: {
        select: {
          id: true,
          type: true,
          content: true,
          created_at: true,
          users: { select: { id: true, full_name: true } },
        },
        orderBy: { created_at: "desc" },
        take: 50,
      },
    },
  });

  if (!lead) {
    return null;
  }
  const [relatedFiles, relatedTags] = await prisma.$transaction([
    prisma.file_relations.findMany({
      where: { entity_type: "lead", entity_id: leadId },
      select: {
        id: true,
        files: {
          select: {
            id: true,
            file_name: true,
            file_url: true,
            mime_type: true,
            file_size: true,
            created_at: true,
            users: { select: { id: true, full_name: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: 30,
    }),
    prisma.entity_tags.findMany({
      where: { entity_type: "lead", entity_id: leadId },
      select: { tags: { select: { name: true } } },
      orderBy: { created_at: "asc" },
      take: 20,
    }),
  ]);
  const profile = lead.student_profiles;
  const specificAddress = lead.addresses.find((address) => address.type === "specific");
  const permanentAddress = lead.addresses.find((address) => address.type === "permanent");
  const currentAddress = lead.addresses.find((address) => address.type === "current");
  const currentResidence = lead.addresses.find((address) => address.type === "residence");
  const primaryRelative = lead.relatives.find((relative) => relative.is_primary);
  const secondaryRelative = lead.relatives.find((relative) => !relative.is_primary);
  const admission = lead.admission_profiles;

  return {
    id: lead.id,
    leadCode: lead.lead_code,
    fullName: lead.full_name,
    phone: canViewSensitive ? lead.phone : null,
    email: canViewSensitive ? lead.email : null,
    gender: lead.gender,
    dateOfBirth: lead.date_of_birth?.toISOString().slice(0, 10) ?? null,
    cccd: canViewSensitive ? lead.cccd : null,
    note: lead.note,
    status: lead.status,
    leadScore: lead.lead_score,
    temperature: lead.temperature,
    createdAt: lead.created_at?.toISOString() ?? null,
    updatedAt: lead.updated_at?.toISOString() ?? null,
    source: lead.lead_sources
      ? { id: lead.lead_sources.id, name: lead.lead_sources.name }
      : null,
    institutionProgram: lead.institution_programs
      ? { id: lead.institution_programs.id, name: lead.institution_programs.name, institutionName: lead.institution_programs.institutions.name }
      : null,
    pipelineStage: lead.pipeline_stages
      ? {
          id: lead.pipeline_stages.id,
          name: lead.pipeline_stages.name,
          color: lead.pipeline_stages.color,
        }
      : null,
    assignee: lead.users_leads_assigned_toTousers
      ? {
          id: lead.users_leads_assigned_toTousers.id,
          fullName: lead.users_leads_assigned_toTousers.full_name,
        }
      : null,
    owner: lead.users_leads_owner_idTousers
      ? { id: lead.users_leads_owner_idTousers.id, fullName: lead.users_leads_owner_idTousers.full_name }
      : null,
    birthPlace: profile?.birth_place ?? null,
    cccdIssueDate: canViewSensitive ? profile?.cccd_issue_date?.toISOString().slice(0, 10) ?? null : null,
    cccdIssuePlace: canViewSensitive ? profile?.cccd_issue_place ?? null : null,
    nationality: profile?.nationality ?? null,
    ethnicity: profile?.ethnicity ?? null,
    religion: profile?.religion ?? null,
    graduationYear: profile?.graduation_year?.toString() ?? null,
    graduationCertificate: profile?.graduation_certificate ?? null,
    previousGraduationCertificate: profile?.previous_graduation_certificate ?? null,
    graduationMajor: profile?.graduation_major ?? null,
    graduationRank: profile?.graduation_rank ?? null,
    diplomaIssuePlace: profile?.diploma_issue_place ?? null,
    academicRank12: profile?.academic_rank_12 ?? null,
    conductRank12: profile?.conduct_rank_12 ?? null,
    highSchoolName: profile?.high_school_name ?? null,
    highSchoolProvince: profile?.high_school_province ?? null,
    highSchoolDistrict: profile?.high_school_district ?? null,
    currentJob: profile?.current_job ?? null,
    companyName: profile?.company_name ?? null,
    specificAddress: canViewSensitive ? specificAddress?.detail_address ?? null : null,
    permanentAddress: canViewSensitive ? permanentAddress?.detail_address ?? null : null,
    currentAddress: canViewSensitive ? currentAddress?.detail_address ?? null : null,
    currentResidence: canViewSensitive ? currentResidence?.detail_address ?? null : null,
    province: canViewSensitive ? currentAddress?.province ?? null : null,
    district: canViewSensitive ? currentAddress?.district ?? null : null,
    ward: canViewSensitive ? currentAddress?.ward ?? null : null,
    hamlet: canViewSensitive ? currentAddress?.hamlet ?? null : null,
    relative1FullName: canViewSensitive ? primaryRelative?.full_name ?? null : null,
    relative1Relationship: canViewSensitive ? primaryRelative?.relationship ?? null : null,
    relative1Phone: canViewSensitive ? primaryRelative?.phone ?? null : null,
    relative1Job: primaryRelative?.job ?? null,
    relative1Address: canViewSensitive ? primaryRelative?.addresses?.detail_address ?? null : null,
    relative2FullName: canViewSensitive ? secondaryRelative?.full_name ?? null : null,
    relative2Relationship: canViewSensitive ? secondaryRelative?.relationship ?? null : null,
    relative2Phone: canViewSensitive ? secondaryRelative?.phone ?? null : null,
    relative2Job: secondaryRelative?.job ?? null,
    relative2Address: canViewSensitive ? secondaryRelative?.addresses?.detail_address ?? null : null,
    institutionProgramId: admission?.institution_program_id ?? lead.institution_programs?.id ?? null,
    majorId: admission?.major_id ?? null,
    admissionStatusId: admission?.admission_status_id ?? null,
    trainingCode: admission?.training_code ?? null,
    classCode: admission?.class_code ?? null,
    subjectGroupCode: admission?.subject_group_code ?? null,
    subjectGroupName: admission?.subject_group_name ?? null,
    score1: admission?.score_1?.toString() ?? null,
    score2: admission?.score_2?.toString() ?? null,
    score3: admission?.score_3?.toString() ?? null,
    admissionScore: admission?.admission_score?.toString() ?? null,
    enrollmentBatch: admission?.enrollment_batch ?? null,
    registrationStation: admission?.registration_station ?? null,
    decisionNumber: admission?.decision_number ?? null,
    decisionSignedDate: admission?.decision_signed_date?.toISOString().slice(0, 10) ?? null,
    monthlyRevenue: admission?.monthly_revenue?.toString() ?? null,
    gclid: lead.utm_trackings[0]?.gclid ?? null,
    tags: relatedTags.flatMap((tag) => tag.tags ? [tag.tags.name] : []).join(", "),
    assignments: lead.lead_assignments.map((assignment) => ({
      id: assignment.id,
      assignedAt: assignment.assigned_at?.toISOString() ?? null,
      isMainOwner: assignment.is_main_owner ?? false,
      assignee: assignment.users_lead_assignments_assigned_toTousers
        ? {
            id: assignment.users_lead_assignments_assigned_toTousers.id,
            fullName: assignment.users_lead_assignments_assigned_toTousers.full_name,
          }
        : null,
      department: assignment.departments
        ? { id: assignment.departments.id, name: assignment.departments.name }
        : null,
    })),
    stageHistory: lead.lead_status_histories.map((history) => ({
      id: history.id,
      changedAt: history.changed_at?.toISOString() ?? null,
      fromStage:
        history.pipeline_stages_lead_status_histories_from_stage_idTopipeline_stages,
      toStage:
        history.pipeline_stages_lead_status_histories_to_stage_idTopipeline_stages,
      changedBy: history.users
        ? { id: history.users.id, fullName: history.users.full_name }
        : null,
    })),
    notes: lead.lead_notes.map((note) => ({
      id: note.id,
      content: note.content,
      createdAt: note.created_at?.toISOString() ?? null,
      author: note.users ? { id: note.users.id, fullName: note.users.full_name } : null,
    })),
    activities: lead.lead_activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      content: activity.content,
      createdAt: activity.created_at?.toISOString() ?? null,
      actor: activity.users ? { id: activity.users.id, fullName: activity.users.full_name } : null,
    })),
    files: relatedFiles.flatMap((relation) =>
      relation.files
        ? [{
            id: relation.files.id,
            fileName: relation.files.file_name,
            fileUrl: relation.files.file_url,
            mimeType: relation.files.mime_type,
            fileSize: relation.files.file_size?.toString() ?? null,
            createdAt: relation.files.created_at?.toISOString() ?? null,
            uploadedBy: relation.files.users
              ? { id: relation.files.users.id, fullName: relation.files.users.full_name }
              : null,
          }]
        : [],
    ),
  };
}
