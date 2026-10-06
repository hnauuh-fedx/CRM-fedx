export const ACTIVE_LEAD_STATUS = "ACTIVE";
export const FAILED_LEAD_STATUS_PREFIX = "FAIL:";

export type LeadLifecycleStatus = "ACTIVE" | "FAIL";

export function createFailedLeadStatus(stageId: string) {
  return `${FAILED_LEAD_STATUS_PREFIX}${stageId}`;
}

export function getFailedLeadStageId(status: string | null | undefined) {
  if (!status?.startsWith(FAILED_LEAD_STATUS_PREFIX)) return null;
  const stageId = status.slice(FAILED_LEAD_STATUS_PREFIX.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stageId)
    ? stageId
    : null;
}

export function isFailedLeadStatus(status: string | null | undefined) {
  return getFailedLeadStageId(status) !== null;
}

export function getPipelineStageMarker(stageName: string | null | undefined) {
  return stageName?.match(/\bL\d+\b/i)?.[0]?.toUpperCase() ?? null;
}

export function toLeadLifecycleStatus(
  status: string | null | undefined,
  failedStageName?: string | null,
) {
  const failedStageId = getFailedLeadStageId(status);
  if (!failedStageId) {
    return {
      value: "ACTIVE" as const,
      label: "Active",
      failedStageId: null,
    };
  }

  const marker = getPipelineStageMarker(failedStageName);
  return {
    value: "FAIL" as const,
    label: marker ? `Fail | ${marker}` : "Fail",
    failedStageId,
  };
}
