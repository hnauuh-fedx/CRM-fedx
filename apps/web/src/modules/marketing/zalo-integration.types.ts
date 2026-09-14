export type ZaloConnection = {
  id: string;
  oaId: string;
  oaName: string | null;
  appId: string;
  status: string;
  institutionProgramId: string | null;
  leadSourceId: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string | null;
  nextRefreshAt: string;
  lastRefreshAt: string | null;
  lastRefreshError: string | null;
  refreshFailureCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ZaloConnectionListResponse = {
  data: ZaloConnection[];
  configuration: {
    appIdConfigured: boolean;
    appSecretConfigured: boolean;
    webhookSecretConfigured: boolean;
    encryptionKeyConfigured: boolean;
    gptApiKeyConfigured: boolean;
    gptModel: string;
  };
};

export type ZaloConnectionOptions = {
  leadSources: Array<{ id: string; name: string; type: string | null; institutionProgramId: string | null }>;
  institutionPrograms: Array<{ id: string; name: string; institutionName: string }>;
};

export type SaveZaloConnectionInput = {
  appId?: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInHours: number;
  refreshTokenExpiresInDays: number | null;
  institutionProgramId: string;
  leadSourceId: string;
};

export type ZaloProcessingLog = {
  id: string;
  zaloMessageId: string;
  zaloUserId: string;
  zaloUserName: string | null;
  messageText: string | null;
  sentAt: string;
  processingStatus: string;
  processingError: string | null;
  leadId: string | null;
};

export type ZaloProcessingLogResponse = {
  data: ZaloProcessingLog[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};
