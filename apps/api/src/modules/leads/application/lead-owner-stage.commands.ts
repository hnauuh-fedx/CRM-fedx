import type { AuthUser } from "../../auth/auth.types";
import { triggerAutomation } from "../../automations/automation-engine.service";
import {
  assignVisibleLead,
  changeVisibleLeadStage,
} from "./lead-owner-stage.use-cases";

export async function changeLeadStage(
  actor: AuthUser,
  leadId: string,
  stageId: string,
  institutionProgramId?: string,
  ipAddress?: string,
) {
  const result = await changeVisibleLeadStage(
    actor,
    leadId,
    stageId,
    institutionProgramId,
    undefined,
    ipAddress,
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
