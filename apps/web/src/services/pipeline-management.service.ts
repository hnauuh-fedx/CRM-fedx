import type {
  PipelineInput,
  PipelineListResponse,
  PipelineManagementOptions,
  PipelineSortField,
  PipelineStageInput,
} from "@/modules/management/pipeline-management.types";
import { apiRequest } from "./api";

export function getManagedPipelines(
  params: {
    page: number;
    limit: number;
    search: string;
    module: string;
    sortBy: PipelineSortField;
    sortOrder: "asc" | "desc";
  },
  accessToken: string,
) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search,
    module: params.module,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
  return apiRequest<PipelineListResponse>(`/pipelines?${query.toString()}`, {}, accessToken);
}

export function getPipelineManagementOptions(accessToken: string) {
  return apiRequest<PipelineManagementOptions>("/pipelines/options", {}, accessToken);
}

export function createManagedPipeline(input: PipelineInput, accessToken: string) {
  return apiRequest<{ id: string }>("/pipelines", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateManagedPipeline(pipelineId: string, input: PipelineInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/pipelines/${pipelineId}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function deleteManagedPipeline(pipelineId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/pipelines/${pipelineId}`, { method: "DELETE" }, accessToken);
}

export function createManagedPipelineStage(pipelineId: string, input: PipelineStageInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/pipelines/${pipelineId}/stages`, { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateManagedPipelineStage(pipelineId: string, stageId: string, input: PipelineStageInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/pipelines/${pipelineId}/stages/${stageId}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function deleteManagedPipelineStage(pipelineId: string, stageId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/pipelines/${pipelineId}/stages/${stageId}`, { method: "DELETE" }, accessToken);
}
