import type { AuthUser } from "../../auth/auth.types";
import { triggerAutomation } from "../../automations/automation-engine.service";
import {
  assignVisibleLead,
  changeVisibleLeadStatus,
  changeVisibleLeadStage,
} from "./lead-owner-stage.use-cases";
import type { LeadLifecycleStatus } from "../domain/lead-lifecycle-status";

export async function changeLeadStage(
  actor: AuthUser,
  leadId: string,
  stageId: string,
  institutionProgramId?: string,
  ipAddress?: string,
  noteTemplateId?: string,
  noteContent?: string,
) {
  const result = await changeVisibleLeadStage(
    actor,
    leadId,
    stageId,
    institutionProgramId,
    undefined,
    ipAddress,
    noteTemplateId,
    noteContent,
  );

  if (result.ok && result.data.changed) {
    triggerAutomation("lead_pipeline_stage_changed", {
      leadId: result.data.id,
      actorId: actor.id,
      institutionProgramId: institutionProgramId ?? undefined,
    }).catch(console.error);
  }
  return result;
}

export async function changeLeadStatus(
  actor: AuthUser,
  leadId: string,
  status: LeadLifecycleStatus,
  institutionProgramId?: string,
  ipAddress?: string,
  noteTemplateId?: string,
  noteContent?: string,
) {
  const result = await changeVisibleLeadStatus(
    actor,
    leadId,
    status,
    institutionProgramId,
    ipAddress,
    noteTemplateId,
    noteContent,
  );

  if (result.ok && result.data.changed && result.data.status === "ACTIVE") {
    triggerAutomation("lead_pipeline_stage_changed", {
      leadId: result.data.id,
      actorId: actor.id,
      institutionProgramId: institutionProgramId ?? undefined,
    }).catch(console.error);
  }
  return result;
}

export async function assignLead(
  actor: AuthUser,
  leadId: string,
  input: { assigneeId: string; departmentId?: string },
  institutionProgramId?: string,
  ipAddress?: string,
) {
  const result = await assignVisibleLead(
    actor,
    leadId,
    input,
    institutionProgramId,
    undefined,
    ipAddress,
  );

  if (result.ok) {
    triggerAutomation("lead_assigned", {
      leadId: result.data.id,
      actorId: actor.id,
      institutionProgramId: institutionProgramId ?? undefined,
    }).catch(console.error);
  }
  return result;
}
