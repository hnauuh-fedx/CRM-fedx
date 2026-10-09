export type AutomationReassignmentPolicy = {
  enabled: boolean;
  interactionCriterion:
    | "not_opened_since_assignment"
    | "no_care_activity_since_assignment"
    | "no_data_update_since_assignment";
  timeoutMinutes: number;
  assignToAnotherSale: boolean;
  excludeCurrentAssignee: true;
  maxReassignments: number;
  recyclePool: boolean;
  maxPoolCycles: number;
  warningEnabled: boolean;
  warningBeforeMinutes: number;
  warningContent: string;
  warningEmailEnabled?: boolean;
  secondWarningEnabled?: boolean;
  secondWarningBeforeMinutes?: number;
  secondWarningContent?: string;
  secondWarningEmailEnabled?: boolean;
  notifyOnRemoval: boolean;
};
