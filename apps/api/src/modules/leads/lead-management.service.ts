import type { AuthUser } from "../auth/auth.types";
import { hasValidAdmissionReferences, saveAdmissionProfile } from "../admissions/admission-profile-write.service";
import { saveLeadAttributionAndTags } from "../campaigns/lead-attribution.service";
import { saveCandidateProfile } from "../students/candidate-profile.service";
import { prisma } from "../../database/prisma";
import { getLeadScopeWhere } from "./lead-list.service";
import { triggerAutomation } from "../automations/automation-engine.service";

export const leadUpdatePermissions = [
  "lead.update_all",
  "lead.update_department",
  "lead.update_assigned",
] as const;

export type LeadInput = {
  fullName: string;
  phone: string;
  sourceId: string;
  assigneeId?: string | null;
  pipelineStageId?: string;
  email?: string;
  gender?: string;
  dateOfBirth?: string;
  cccd?: string;
  note?: string;
  status?: string;
  temperature?: string;
  birthPlace?: string;
  cccdIssueDate?: string;
  cccdIssuePlace?: string;
  nationality?: string;
  ethnicity?: string;
  religion?: string;
  graduationYear?: string;
  graduationCertificate?: string;
  previousGraduationCertificate?: string;
  graduationMajor?: string;
  graduationRank?: string;
  diplomaIssuePlace?: string;
  academicRank12?: string;
  conductRank12?: string;
  highSchoolName?: string;
  highSchoolProvince?: string;
  highSchoolDistrict?: string;
  currentJob?: string;
  companyName?: string;
  specificAddress?: string;
  permanentAddress?: string;
  currentAddress?: string;
  currentResidence?: string;
  province?: string;
  district?: string;
  ward?: string;
  hamlet?: string;
  relative1FullName?: string;
  relative1Relationship?: string;
  relative1Phone?: string;
  relative1Job?: string;
  relative1Address?: string;
  relative2FullName?: string;
  relative2Relationship?: string;
  relative2Phone?: string;
  relative2Job?: string;
  relative2Address?: string;
  institutionProgramId?: string;
  majorId?: string;
  admissionStatusId?: string;
  trainingCode?: string;
  classCode?: string;
  subjectGroupCode?: string;
  subjectGroupName?: string;
  score1?: string;
  score2?: string;
  score3?: string;
  admissionScore?: string;
  enrollmentBatch?: string;
  registrationStation?: string;
  decisionNumber?: string;
  decisionSignedDate?: string;
  monthlyRevenue?: string;
  gclid?: string;
  tags?: string;
};

export type LeadFileInput = {
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
};

async function findVisibleLead(user: AuthUser, leadId: string, institutionProgramId?: string) {
  return prisma.leads.findFirst({
    where: { id: leadId, deleted_at: null, ...getLeadScopeWhere(user), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) },
    select: {
      id: true,
      full_name: true,
      phone: true,
      email: true,
      gender: true,
      date_of_birth: true,
      cccd: true,
      note: true,
      source_id: true,
      status: true,
      temperature: true,
      pipeline_stage_id: true,
      assigned_to: true,
    },
  });
}

function emptyToNull(value?: string) {
  return value?.trim() || null;
}

function normalizeLeadStatus(value?: string | null) {
  return value?.trim().slice(0, 50) || null;
}

function toLeadData(input: LeadInput) {
  return {
    full_name: input.fullName.trim(),
    phone: input.phone.trim(),
    source_id: input.sourceId,
    institution_program_id: input.institutionProgramId ?? null,
    major_id: input.majorId ?? null,
    email: emptyToNull(input.email),
    gender: emptyToNull(input.gender),
    date_of_birth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
    cccd: emptyToNull(input.cccd),
    note: emptyToNull(input.note),
    ...(input.status !== undefined ? { status: normalizeLeadStatus(input.status) } : {}),
    ...(input.temperature ? { temperature: input.temperature } : {}),
  };
}

function toStageStatus(stage: { name: string } | null) {
  return normalizeLeadStatus(stage?.name);
}

async function getSelectedStage(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  pipelineStageId?: string,
) {
  if (!pipelineStageId) {
    return null;
  }

  return tx.pipeline_stages.findUnique({
    where: { id: pipelineStageId },
    select: { id: true, name: true },
  });
}

const assignableSaleWhere = {
  user_roles: {
    some: {
      roles: {
        role_permissions: {
          some: { permissions: { code: "lead.view_assigned" } },
          none: { permissions: { code: { in: ["lead.view_department", "lead.view_all"] } } },
        },
      },
    },
  },
};

async function findActiveAssignableSale(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  assigneeId: string,
  departmentId?: string,
) {
  return tx.users.findFirst({
    where: {
      id: assigneeId,
      status: "active",
      deleted_at: null,
      ...assignableSaleWhere,
      ...(departmentId ? { user_departments: { some: { department_id: departmentId } } } : {}),
    },
    select: {
      id: true,
      full_name: true,
      user_departments: { select: { department_id: true }, orderBy: { id: "asc" } },
    },
  });
}

function selectAssigneeDepartment(
  user: AuthUser,
  memberships: Array<{ department_id: string | null }>,
  requestedDepartmentId?: string,
) {
  if (requestedDepartmentId) return requestedDepartmentId;
  return memberships.find((membership) => membership.department_id && user.departmentIds.includes(membership.department_id))?.department_id
    ?? memberships[0]?.department_id
    ?? null;
}

async function recordStageChange(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  user: AuthUser,
  leadId: string,
  fromStageId: string | null,
  toStage: { id: string; name: string } | null,
) {
  const toStageId = toStage?.id ?? null;
  await tx.lead_status_histories.create({
    data: { lead_id: leadId, from_stage_id: fromStageId, to_stage_id: toStageId, changed_by: user.id },
  });
  await tx.lead_activities.create({
    data: {
      lead_id: leadId,
      user_id: user.id,
      type: "pipeline_stage_changed",
      content: toStage ? `Chuyển lead sang tiến trình ${toStage.name}.` : "Bỏ chọn tiến trình của lead.",
      metadata: { fromStageId, toStageId },
    },
  });
  await tx.audit_logs.create({
    data: {
      user_id: user.id,
      entity_type: "lead",
      entity_id: leadId,
      action: "pipeline_stage_changed",
      old_data: { pipelineStageId: fromStageId },
      new_data: { pipelineStageId: toStageId },
    },
  });
}

export async function getLeadActionOptions(user: AuthUser, institutionProgramId?: string) {
  const canAssign = user.permissions.includes("lead.assign") || user.permissions.includes("lead.reassign");
  const canAssignAll = user.accessScope === "ALL" && user.permissions.includes("lead.view_all");
  const [sources, stages, assignees, telesales, departments, institutionPrograms, majors, admissionStatuses, tags] = await prisma.$transaction([
    prisma.lead_sources.findMany({
      where: institutionProgramId
        ? { OR: [{ institution_program_id: institutionProgramId }, { institution_program_id: null }] }
        : undefined,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.pipeline_stages.findMany({
      select: { id: true, name: true, color: true, pipeline_id: true, pipelines: { select: { name: true } } },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    canAssign
      ? prisma.users.findMany({
          where: { status: "active", deleted_at: null },
          select: { id: true, full_name: true },
          orderBy: { full_name: "asc" },
        })
      : prisma.users.findMany({ where: { id: user.id }, select: { id: true, full_name: true } }),
    prisma.users.findMany({
      where: {
        status: "active",
        deleted_at: null,
        ...assignableSaleWhere,
        ...(canAssign && !canAssignAll
          ? { user_departments: { some: { department_id: { in: user.departmentIds } } } }
          : {}),
      },
      select: { id: true, full_name: true },
      orderBy: { full_name: "asc" },
    }),
    canAssign
      ? prisma.departments.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : prisma.departments.findMany({
          where: { id: { in: user.departmentIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
    prisma.institution_programs.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true, institutions: { select: { name: true } }, program_types: { select: { name: true } } },
      orderBy: [{ institutions: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.majors.findMany({
      where: institutionProgramId
        ? { OR: [{ institution_program_id: institutionProgramId }, { institution_program_id: null }] }
        : undefined,
      select: { id: true, name: true, code: true, faculties: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.admission_statuses.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.tags.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 200 }),
  ]);

  return {
    sources,
    stages: stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      pipelineId: stage.pipeline_id,
      pipelineName: stage.pipelines?.name ?? null,
    })),
    assignees: assignees.map((assignee) => ({ id: assignee.id, fullName: assignee.full_name })),
    telesales: telesales.map((telesale) => ({ id: telesale.id, fullName: telesale.full_name })),
    departments,
    institutionPrograms: institutionPrograms.map((program) => ({
      id: program.id,
      name: program.name,
      code: program.code,
      institutionName: program.institutions.name,
      programTypeName: program.program_types.name,
    })),
    majors: majors.map((major) => ({
      id: major.id,
      name: major.name,
      code: major.code,
      facultyName: major.faculties?.name ?? null,
    })),
    admissionStatuses,
    tags: tags.map((tag) => tag.name),
  };
}

export async function createLead(user: AuthUser, input: LeadInput) {
  const result = await prisma.$transaction(async (tx) => {
    const duplicate = await tx.leads.findFirst({
      where: { phone: input.phone.trim(), deleted_at: null },
      select: { id: true },
    });
    if (duplicate) {
      return { ok: false as const, reason: "phone_already_exists" as const };
    }
    const source = await tx.lead_sources.findUnique({ where: { id: input.sourceId }, select: { id: true } });
    if (!source) {
      return { ok: false as const, reason: "source_not_found" as const };
    }
    if (!await hasValidAdmissionReferences(tx, input)) {
      return { ok: false as const, reason: "admission_reference_not_found" as const };
    }
    const selectedStage = await getSelectedStage(tx, input.pipelineStageId);
    if (input.pipelineStageId && !selectedStage) {
      return { ok: false as const, reason: "stage_not_found" as const };
    }
    const assignee = input.assigneeId ? await findActiveAssignableSale(tx, input.assigneeId) : null;
    if (input.assigneeId && !assignee) {
      return { ok: false as const, reason: "assignee_not_telesale" as const };
    }

    const lead = await tx.leads.create({
      data: {
        ...toLeadData(input),
        pipeline_stage_id: selectedStage?.id ?? null,
        ...(input.pipelineStageId !== undefined ? { status: toStageStatus(selectedStage) } : {}),
        lead_code: `LD-${Date.now().toString(36).toUpperCase()}`,
        owner_id: user.id,
        assigned_to: assignee?.id ?? null,
      },
      select: { id: true },
    });

    await saveCandidateProfile(tx, lead.id, input);
    await saveAdmissionProfile(tx, lead.id, input);
    await saveLeadAttributionAndTags(tx, lead.id, input);

    await tx.lead_activities.create({
      data: { lead_id: lead.id, user_id: user.id, type: "lead_created", content: "Tạo lead mới." },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "lead",
        entity_id: lead.id,
        action: "create",
        new_data: { fullName: input.fullName, sourceId: input.sourceId, assigneeId: assignee?.id ?? null },
      },
    });
    if (assignee) {
      const departmentId = selectAssigneeDepartment(user, assignee.user_departments);
      await tx.lead_assignments.create({
        data: {
          lead_id: lead.id,
          assigned_to: assignee.id,
          assigned_by: user.id,
          department_id: departmentId,
          is_main_owner: true,
        },
      });
      await tx.lead_activities.create({
        data: { lead_id: lead.id, user_id: user.id, type: "lead_assigned", content: `Phân công lead cho ${assignee.full_name}.` },
      });
      await tx.notifications.create({
        data: {
          user_id: assignee.id,
          title: "Bạn được phân công lead mới",
          content: `Lead ${input.fullName.trim()} đã được phân công cho bạn.`,
          type: "lead_assignment",
        },
      });
      await tx.audit_logs.create({
        data: {
          user_id: user.id,
          entity_type: "lead",
          entity_id: lead.id,
          action: "assign",
          old_data: { assigneeId: null },
          new_data: { assigneeId: assignee.id, departmentId },
        },
      });
    }
    if (selectedStage) {
      await recordStageChange(tx, user, lead.id, null, selectedStage);
    }
    return { ok: true as const, data: { id: lead.id, assigneeId: assignee?.id ?? null } };
  });

  if (result.ok) {
    triggerAutomation("lead_created", { 
      leadId: result.data.id, 
      institutionProgramId: input.institutionProgramId ?? undefined 
    }).catch(console.error);
    if (result.data.assigneeId) {
      triggerAutomation("lead_assigned", {
        leadId: result.data.id,
        institutionProgramId: input.institutionProgramId ?? undefined,
      }).catch(console.error);
    }
  }
  return result;
}

export async function updateLead(user: AuthUser, leadId: string, input: LeadInput, institutionProgramId?: string) {
  const existing = await findVisibleLead(user, leadId, institutionProgramId);
  if (!existing) {
    return { ok: false as const, reason: "lead_not_found" as const };
  }

  const result = await prisma.$transaction(async (tx) => {
    const duplicate = await tx.leads.findFirst({
      where: { phone: input.phone.trim(), deleted_at: null, id: { not: leadId } },
      select: { id: true },
    });
    if (duplicate) {
      return { ok: false as const, reason: "phone_already_exists" as const };
    }
    const source = await tx.lead_sources.findUnique({ where: { id: input.sourceId }, select: { id: true } });
    if (!source) {
      return { ok: false as const, reason: "source_not_found" as const };
    }
    if (!await hasValidAdmissionReferences(tx, input, leadId)) {
      return { ok: false as const, reason: "admission_reference_not_found" as const };
    }
    const hasStageSelection = input.pipelineStageId !== undefined;
    const selectedStage = await getSelectedStage(tx, input.pipelineStageId);
    if (input.pipelineStageId && !selectedStage) {
      return { ok: false as const, reason: "stage_not_found" as const };
    }
    const nextStageId = selectedStage?.id ?? null;
    const assignmentChanged = input.assigneeId !== undefined && input.assigneeId !== existing.assigned_to;
    if (assignmentChanged && !user.permissions.some((permission) => ["lead.assign", "lead.reassign"].includes(permission))) {
      return { ok: false as const, reason: "assignment_forbidden" as const };
    }
    const nextAssignee = assignmentChanged && input.assigneeId
      ? await findActiveAssignableSale(tx, input.assigneeId)
      : null;
    const canAssignAll = user.accessScope === "ALL" && user.permissions.includes("lead.view_all");
    const assigneeInScope = nextAssignee && (
      canAssignAll
      || nextAssignee.user_departments.some((membership) => membership.department_id && user.departmentIds.includes(membership.department_id))
    );
    if (assignmentChanged && input.assigneeId && (!nextAssignee || !assigneeInScope)) {
      return { ok: false as const, reason: "assignee_not_telesale" as const };
    }

    await tx.leads.update({
      where: { id: leadId },
      data: {
        ...toLeadData(input),
        ...(hasStageSelection ? { pipeline_stage_id: nextStageId } : {}),
        ...(hasStageSelection ? { status: toStageStatus(selectedStage) } : {}),
        ...(assignmentChanged ? { assigned_to: nextAssignee?.id ?? null } : {}),
        updated_at: new Date(),
      },
    });
    await saveCandidateProfile(tx, leadId, input);
    await saveAdmissionProfile(tx, leadId, input);
    await saveLeadAttributionAndTags(tx, leadId, input);
    await tx.lead_activities.create({
      data: { lead_id: leadId, user_id: user.id, type: "lead_updated", content: "Cập nhật thông tin lead." },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "lead",
        entity_id: leadId,
        action: "update",
        old_data: {
          fullName: existing.full_name,
          sourceId: existing.source_id,
          status: existing.status,
        },
        new_data: { fullName: input.fullName, sourceId: input.sourceId, status: hasStageSelection ? toStageStatus(selectedStage) : input.status ?? existing.status },
      },
    });
    if (hasStageSelection && existing.pipeline_stage_id !== nextStageId) {
      await recordStageChange(tx, user, leadId, existing.pipeline_stage_id, selectedStage);
    }
    if (assignmentChanged) {
      await tx.lead_assignments.updateMany({
        where: { lead_id: leadId, is_main_owner: true },
        data: { is_main_owner: false },
      });
      if (nextAssignee) {
        const departmentId = selectAssigneeDepartment(user, nextAssignee.user_departments);
        await tx.lead_assignments.create({
          data: {
            lead_id: leadId,
            assigned_to: nextAssignee.id,
            assigned_by: user.id,
            department_id: departmentId,
            is_main_owner: true,
          },
        });
        await tx.lead_activities.create({
          data: { lead_id: leadId, user_id: user.id, type: "lead_assigned", content: `Phân công lead cho ${nextAssignee.full_name}.` },
        });
        await tx.notifications.create({
          data: {
            user_id: nextAssignee.id,
            title: "Bạn được phân công lead mới",
            content: `Lead ${input.fullName.trim()} đã được phân công cho bạn.`,
            type: "lead_assignment",
          },
        });
      } else {
        await tx.lead_activities.create({
          data: { lead_id: leadId, user_id: user.id, type: "lead_unassigned", content: "Thu hồi Sale phụ trách khỏi lead." },
        });
      }
      await tx.audit_logs.create({
        data: {
          user_id: user.id,
          entity_type: "lead",
          entity_id: leadId,
          action: nextAssignee ? (existing.assigned_to ? "reassign" : "assign") : "unassign",
          old_data: { assigneeId: existing.assigned_to },
          new_data: { assigneeId: nextAssignee?.id ?? null },
        },
      });
    }
    return {
      ok: true as const,
      data: { id: leadId, assignmentEvent: assignmentChanged ? (nextAssignee ? "lead_assigned" as const : "lead_unassigned" as const) : null },
    };
  });

  if (result.ok && result.data.assignmentEvent) {
    triggerAutomation(result.data.assignmentEvent, {
      leadId: result.data.id,
      institutionProgramId: institutionProgramId ?? undefined,
    }).catch(console.error);
  }
  return result;
}

export async function deleteLead(user: AuthUser, leadId: string, institutionProgramId?: string) {
  const lead = await findVisibleLead(user, leadId, institutionProgramId);
  if (!lead) {
    return { ok: false as const, reason: "lead_not_found" as const };
  }

  return prisma.$transaction(async (tx) => {
    await tx.leads.update({
      where: { id: leadId },
      data: { deleted_at: new Date(), updated_at: new Date() },
    });
    await tx.lead_activities.create({
      data: { lead_id: leadId, user_id: user.id, type: "lead_deleted", content: "Xóa lead khỏi danh sách hoạt động." },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "lead",
        entity_id: leadId,
        action: "delete",
        old_data: { fullName: lead.full_name, status: lead.status, assigneeId: lead.assigned_to },
        new_data: { deleted: true },
      },
    });
    return { ok: true as const, data: { id: leadId } };
  });
}

export async function changeLeadStage(user: AuthUser, leadId: string, stageId: string, institutionProgramId?: string) {
  const lead = await findVisibleLead(user, leadId, institutionProgramId);
  if (!lead) {
    return { ok: false as const, reason: "lead_not_found" as const };
  }

  const result = await prisma.$transaction(async (tx) => {
    const stage = await tx.pipeline_stages.findUnique({ where: { id: stageId }, select: { id: true, name: true } });
    if (!stage) {
      return { ok: false as const, reason: "stage_not_found" as const };
    }
    if (lead.pipeline_stage_id === stageId) {
      if (lead.status !== toStageStatus(stage)) {
        await tx.leads.update({ where: { id: leadId }, data: { status: toStageStatus(stage), updated_at: new Date() } });
      }
      return { ok: true as const, data: { id: leadId, pipelineStageId: stageId } };
    }

    await tx.leads.update({ where: { id: leadId }, data: { pipeline_stage_id: stageId, status: toStageStatus(stage), updated_at: new Date() } });
    await tx.lead_status_histories.create({
      data: { lead_id: leadId, from_stage_id: lead.pipeline_stage_id, to_stage_id: stageId, changed_by: user.id },
    });
    await tx.lead_activities.create({
      data: {
        lead_id: leadId,
        user_id: user.id,
        type: "pipeline_stage_changed",
        content: `Chuyển lead sang giai đoạn ${stage.name}.`,
        metadata: { fromStageId: lead.pipeline_stage_id, toStageId: stageId },
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "lead",
        entity_id: leadId,
        action: "pipeline_stage_changed",
        old_data: { pipelineStageId: lead.pipeline_stage_id },
        new_data: { pipelineStageId: stageId, status: toStageStatus(stage) },
      },
    });
    return { ok: true as const, data: { id: leadId, pipelineStageId: stageId } };
  });

  if (result.ok) {
    triggerAutomation("lead_status_changed", {
      leadId: result.data.id,
      institutionProgramId: institutionProgramId ?? undefined
    }).catch(console.error);
  }
  return result;
}

export async function addLeadNote(user: AuthUser, leadId: string, content: string, institutionProgramId?: string) {
  const lead = await findVisibleLead(user, leadId, institutionProgramId);
  if (!lead) {
    return { ok: false as const, reason: "lead_not_found" as const };
  }

  return prisma.$transaction(async (tx) => {
    const note = await tx.lead_notes.create({
      data: { lead_id: leadId, user_id: user.id, content: content.trim() },
      select: { id: true },
    });
    await tx.lead_activities.create({
      data: { lead_id: leadId, user_id: user.id, type: "note_created", content: "Thêm ghi chú chăm sóc." },
    });
    await tx.audit_logs.create({
      data: { user_id: user.id, entity_type: "lead", entity_id: leadId, action: "note_created", new_data: { noteId: note.id } },
    });
    return { ok: true as const, data: { id: note.id } };
  });
}

export async function attachLeadFile(user: AuthUser, leadId: string, input: LeadFileInput, institutionProgramId?: string) {
  const lead = await findVisibleLead(user, leadId, institutionProgramId);
  if (!lead) {
    return { ok: false as const, reason: "lead_not_found" as const };
  }

  return prisma.$transaction(async (tx) => {
    const file = await tx.files.create({
      data: {
        file_name: input.fileName.trim(),
        file_url: input.fileUrl.trim(),
        mime_type: emptyToNull(input.mimeType),
        file_size: input.fileSize ? BigInt(input.fileSize) : null,
        uploaded_by: user.id,
      },
      select: { id: true },
    });
    await tx.file_relations.create({ data: { file_id: file.id, entity_type: "lead", entity_id: leadId } });
    await tx.lead_activities.create({
      data: { lead_id: leadId, user_id: user.id, type: "file_attached", content: `Đính kèm tệp ${input.fileName.trim()}.` },
    });
    await tx.audit_logs.create({
      data: { user_id: user.id, entity_type: "lead", entity_id: leadId, action: "file_attached", new_data: { fileId: file.id } },
    });
    return { ok: true as const, data: { id: file.id } };
  });
}

export async function assignLead(
  user: AuthUser,
  leadId: string,
  input: { assigneeId: string; departmentId?: string },
  institutionProgramId?: string,
) {
  const lead = await findVisibleLead(user, leadId, institutionProgramId);
  if (!lead) {
    return { ok: false as const, reason: "lead_not_found" as const };
  }

  const result = await prisma.$transaction(async (tx) => {
    const assignee = await findActiveAssignableSale(tx, input.assigneeId, input.departmentId);
    const canAssignAll = user.accessScope === "ALL" && user.permissions.includes("lead.view_all");
    const assigneeInScope = assignee && (
      canAssignAll
      || assignee.user_departments.some((membership) => membership.department_id && user.departmentIds.includes(membership.department_id))
    );
    if (!assignee || !assigneeInScope) {
      return { ok: false as const, reason: "assignee_not_found" as const };
    }
    const departmentId = selectAssigneeDepartment(user, assignee.user_departments, input.departmentId);

    await tx.lead_assignments.updateMany({ where: { lead_id: leadId, is_main_owner: true }, data: { is_main_owner: false } });
    await tx.lead_assignments.create({
      data: {
        lead_id: leadId,
        assigned_to: assignee.id,
        assigned_by: user.id,
        department_id: departmentId,
        is_main_owner: true,
      },
    });
    await tx.leads.update({ where: { id: leadId }, data: { assigned_to: assignee.id, updated_at: new Date() } });
    await tx.lead_activities.create({
      data: { lead_id: leadId, user_id: user.id, type: "lead_assigned", content: `Phân công lead cho ${assignee.full_name}.` },
    });
    await tx.notifications.create({
      data: {
        user_id: assignee.id,
        title: "Bạn được phân công lead mới",
        content: `Lead ${lead.full_name} đã được phân công cho bạn.`,
        type: "lead_assignment",
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "lead",
        entity_id: leadId,
        action: lead.assigned_to ? "reassign" : "assign",
        old_data: { assigneeId: lead.assigned_to },
        new_data: { assigneeId: assignee.id, departmentId },
      },
    });
    return { ok: true as const, data: { id: leadId, assigneeId: assignee.id } };
  });

  if (result.ok) {
    triggerAutomation("lead_assigned", {
      leadId: result.data.id,
      institutionProgramId: institutionProgramId ?? undefined
    }).catch(console.error);
  }
  return result;
}
