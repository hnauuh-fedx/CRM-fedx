export type ManagedPipelineStage = {
  id: string;
  name: string;
  position: number;
  color: string | null;
  isFinal: boolean;
  leadCount: number;
  historyCount: number;
  createdAt: string | null;
};

export type ManagedPipeline = {
  id: string;
  name: string;
  module: string | null;
  stages: ManagedPipelineStage[];
  stageCount: number;
  finalStageCount: number;
  leadCount: number;
  historyCount: number;
  createdAt: string | null;
};

export type PipelineInput = {
  name: string;
  module: string;
};

export type PipelineStageInput = {
  name: string;
  position: number;
  color: string;
  isFinal: boolean;
};

export type PipelineSortField = "createdAt" | "name" | "module";

export type PipelineListResponse = {
  data: ManagedPipeline[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  sort: { sortBy: PipelineSortField; sortOrder: "asc" | "desc" };
  filters: { search: string; module: string };
};

export type PipelineManagementOptions = {
  modules: string[];
};
