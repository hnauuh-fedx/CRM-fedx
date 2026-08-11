export type SystemSetting = { id: string; key: string; value: string | null; type: string | null; createdAt: string | null };
export type SlaRule = { id: string; name: string; module: string | null; durationMinutes: number; action: string | null; isActive: boolean; createdAt: string | null };
export type ExportSetting = { id: string; name: string; reportType: string; filters: unknown; isActive: boolean; createdAt: string | null; updatedAt: string | null };
export type QueueJob = { id: string; type: string; status: string; runAt: string | null; completedAt: string | null; createdAt: string | null };

export type SystemDashboard = {
  settings: SystemSetting[];
  notificationRules: SystemSetting[];
  slaRules: SlaRule[];
  exportSettings: ExportSetting[];
  health: {
    status: "ok" | "warning";
    pendingJobs: number;
    failedJobs: number;
    unreadNotifications: number;
    jobStatusCounts: Array<{ status: string; count: number }>;
    recentJobs: QueueJob[];
  };
};

export type SettingInput = { key: string; value: string; type: string };
export type SlaRuleInput = { name: string; module: string; durationMinutes: number; action: string; isActive: boolean };
export type ExportSettingInput = { name: string; reportType: string; filters: unknown; isActive: boolean };
