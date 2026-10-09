export type MetaConnection = {
  id: string; pageId: string; pageName: string | null; status: string;
  webhookSubscribedAt: string | null; lastCheckedAt: string | null; lastError: string | null;
  institutionProgramId: string; leadSourceId: string; createdAt: string; updatedAt: string;
};

export type MetaConnectionListResponse = {
  data: MetaConnection[];
  configuration: {
    appIdConfigured: boolean; appSecretConfigured: boolean; verifyTokenConfigured: boolean;
    encryptionKeyConfigured: boolean; oauthRedirectUriConfigured: boolean; graphApiVersion: string;
    gptApiKeyConfigured: boolean; gptModel: string;
  };
};

export type MetaConnectionOptions = {
  leadSources: Array<{ id: string; name: string; type: string | null; institutionProgramId: string | null }>;
  institutionPrograms: Array<{ id: string; name: string; institutionName: string }>;
};

export type MetaPageCandidate = { id: string; name: string; tasks: string[]; canMessage: boolean };
export type MetaProcessingLog = {
  id: string; metaMessageId: string; senderPsid: string; senderName: string | null;
  pageId: string | null; pageName: string | null; messageText: string | null; eventType: string;
  sentAt: string; processingStatus: string; processingError: string | null; leadId: string | null;
};
export type MetaProcessingLogResponse = { data: MetaProcessingLog[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
