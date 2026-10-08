export type AutomationReassignmentPolicy = {
  enabled: boolean;
  interactionCriterion: "not_opened_since_assignment";
  timeoutMinutes: number;
  assignToAnotherSale: boolean;
  excludeCurrentAssignee: true;
  maxReassignments: number;
  recyclePool: boolean;
  maxPoolCycles: number;
  warningEnabled: boolean;
  warningBeforeMinutes: number;
  warningContent: string;
  notifyOnRemoval: boolean;
};
