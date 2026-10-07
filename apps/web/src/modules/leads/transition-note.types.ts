export type TransitionNoteTemplate = {
  id: string;
  content: string;
  isActive: boolean;
};

export type TransitionNoteConfiguration = {
  target: string;
  label: string;
  pipelineName: string | null;
  templates: TransitionNoteTemplate[];
};

export type TransitionNoteOptions = {
  target: string;
  label: string;
  templates: Array<Pick<TransitionNoteTemplate, "id" | "content">>;
};
