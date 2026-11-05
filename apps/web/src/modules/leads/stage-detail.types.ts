/** Value used for the Fail status in the "Quy trình Telesale/Trạng thái" field and its configuration. */
export const FAIL_STAGE_VALUE = "FAIL";
export const PIPELINE_STAGE_FIELD_LABEL = "Quy trình Telesale/Trạng thái";

/** Level 3 of the multi-level field. */
export type StageDetailChildOption = { id: string; label: string };

/** Level 2 of the multi-level field; level 1 is the stage or Fail itself. */
export type StageDetailOption = {
  id: string;
  label: string;
  children: StageDetailChildOption[];
};

export type StageDetailConfiguration = {
  revision?: string;
  target: string;
  label: string;
  pipelineName: string | null;
  options: StageDetailOption[];
};

export type StageDetailOptions = {
  target: string;
  label: string;
  options: StageDetailOption[];
};

/** What the user picked when moving a lead: level 2, optional level 3, optional edited text. */
export type StageDetailSelection = {
  optionId: string;
  childOptionId?: string;
  content?: string;
};

export function composeStageDetailContent(option: { label: string }, child?: { label: string }) {
  return child ? `${option.label} - ${child.label}` : option.label;
}
