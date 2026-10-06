import type { AutomationGraphData } from "./automation.types";

export type AutomationContext = {
  ruleId: string;
  actorId?: string;
  leadId?: string;
  admissionProfileId?: string;
  admissionDocumentId?: string;
  studentId?: string;
  institutionProgramId?: string;
  causationRuleIds?: string[];
  payload?: unknown;
};

export type AutomationExecutionSource = "bulk" | "event" | "manual_test";

export type ExecutableAutomationRule = {
  id: string;
  version: number;
  triggerType: string;
  graphData: AutomationGraphData;
  institutionProgramId: string | null;
  createdBy: string | null;
};

export type AutomationActionResult = { nextSourceHandle: string | null; delayMinutes: number };
