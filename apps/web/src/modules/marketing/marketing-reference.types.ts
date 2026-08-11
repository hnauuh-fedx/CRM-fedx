export type LeadSourceSortField = "createdAt" | "name" | "type";
export type UtmTrackingSortField = "createdAt" | "source" | "medium";
export type MarketingFormSortField = "createdAt" | "name" | "platform" | "status";

export type LeadSourceFilters = { search: string; type: string };
export type UtmTrackingFilters = {
  search: string;
  source: string;
  medium: string;
  campaignId: string;
  fromDate: string;
  toDate: string;
};
export type MarketingFormFilters = {
  search: string;
  status: string;
  platform: string;
  campaignId: string;
};

export type Pagination = { page: number; limit: number; total: number; totalPages: number };

export type LeadSourceItem = {
  id: string;
  name: string;
  type: string | null;
  createdAt: string | null;
  activeLeadCount: number;
  institutionProgram: { id: string; name: string; institutionName: string } | null;
};

export type UtmTrackingItem = {
  id: string;
  source: string | null;
  medium: string | null;
  campaignName: string | null;
  content: string | null;
  term: string | null;
  landingPage: string | null;
  createdAt: string | null;
  campaign: { id: string; name: string } | null;
  lead: { id: string; leadCode: string | null; fullName: string } | null;
};

export type UtmAnalyticsDimension = "source" | "campaign" | "utm";
export type UtmAnalyticsGroup = {
  groupKey: string;
  source: string | null;
  medium: string | null;
  utmCampaign: string | null;
  campaign: { id: string; name: string } | null;
  budget: number;
  trackingCount: number;
  leadCount: number;
  applicationCount: number;
  enrolledStudentCount: number;
  conversionRate: number;
  costPerLead: number | null;
};
export type UtmAnalyticsResponse = {
  summary: {
    trackingCount: number;
    leadCount: number;
    applicationCount: number;
    enrolledStudentCount: number;
  };
  data: UtmAnalyticsGroup[];
  pagination: Pagination;
  dimension: UtmAnalyticsDimension;
};
export type UtmGeneratedLead = {
  id: string;
  leadCode: string | null;
  fullName: string;
  status: string | null;
  createdAt: string | null;
  sourceName: string | null;
  pipelineStageName: string | null;
  hasApplication: boolean;
  hasStudent: boolean;
  attribution: {
    source: string | null;
    medium: string | null;
    utmCampaign: string | null;
    campaign: { id: string; name: string } | null;
  } | null;
};
export type UtmGeneratedLeadResponse = {
  data: UtmGeneratedLead[];
  pagination: Pagination;
};

export type MarketingFormItem = {
  id: string;
  name: string;
  slug: string | null;
  platform: string | null;
  formCode: string | null;
  campaignId?: string | null;
  sourceId?: string | null;
  formType: MarketingFormType;
  title: string | null;
  subtitle?: string | null;
  description: string | null;
  submitButtonLabel: string | null;
  submitButtonText?: string | null;
  templateId?: string | null;
  primaryColor?: string | null;
  backgroundColor?: string | null;
  publicKey: string | null;
  publicPath: string | null;
  webhookEnabled: boolean;
  webhookPath: string | null;
  submissionCount: number;
  status: string | null;
  createdAt: string | null;
  updatedAt?: string | null;
  displaySettings?: MarketingFormSettings;
  duplicateSettings?: MarketingFormSettings;
  successSettings?: MarketingFormSettings;
  accessSettings?: MarketingFormSettings;
  closeSettings?: MarketingFormSettings;
  advancedSettings?: MarketingFormSettings;
  creator?: { id: string; email: string; fullName: string | null } | null;
  campaign: { id: string; name: string } | null;
  source?: { id: string; name: string } | null;
  template?: MarketingFormTemplate | null;
  fields: MarketingFormField[];
  mappings: MarketingFormMapping[];
};

export type MarketingFormType = "lead_form" | "survey" | "external_webhook";
export type MarketingFormFieldType =
  | "text"
  | "textarea"
  | "phone"
  | "email"
  | "number"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "province"
  | "file"
  | "hidden"
  | "single_select"
  | "multi_select"
  | "rating";
export type MarketingFormField = {
  id?: string;
  fieldKey: string;
  label: string;
  placeholder: string | null;
  fieldType: MarketingFormFieldType;
  isRequired: boolean;
  required?: boolean;
  options: string[];
  validationRules?: Record<string, unknown> | null;
  leadField?: MarketingFormLeadField | null;
  crmMappingField?: MarketingFormLeadField | null;
  defaultValue?: string | null;
  sortOrder: number;
  isActive: boolean;
};
export type MarketingFormMapping = {
  id?: string;
  formFieldId?: string | null;
  sourceField: string;
  leadField?: MarketingFormLeadField;
  targetTable?: string;
  targetColumn?: MarketingFormLeadField;
  isRequired: boolean;
  transformRule?: Record<string, unknown> | null;
};
export type MarketingFormLeadField =
  | "full_name"
  | "phone"
  | "email"
  | "gender"
  | "date_of_birth"
  | "note"
  | "source_id"
  | "institution_program_id"
  | "major_id";
export type MarketingFormSettings = Record<string, unknown>;
export type MarketingFormInput = {
  name: string;
  slug?: string;
  platform: string;
  formCode: string;
  campaignId?: string;
  sourceId?: string;
  formType: MarketingFormType;
  title: string;
  subtitle?: string;
  description: string;
  submitButtonLabel: string;
  submitButtonText?: string;
  templateId?: string;
  primaryColor?: string;
  backgroundColor?: string;
  webhookEnabled: boolean;
  status: "draft" | "published" | "archived" | "active" | "inactive" | "closed";
  displaySettings?: MarketingFormSettings;
  duplicateSettings?: MarketingFormSettings;
  successSettings?: MarketingFormSettings;
  accessSettings?: MarketingFormSettings;
  closeSettings?: MarketingFormSettings;
  advancedSettings?: MarketingFormSettings;
  fields: MarketingFormField[];
  mappings: MarketingFormMapping[];
};

export type MarketingFormSubmission = {
  id: string;
  leadId: string | null;
  lead: { id: string; leadCode: string | null; fullName: string; phone: string } | null;
  rawPayload: unknown;
  normalizedPayload: unknown;
  answers: unknown;
  source: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string | null;
};

export type LeadSourceListResponse = {
  data: LeadSourceItem[];
  pagination: Pagination;
  sort: { sortBy: LeadSourceSortField; sortOrder: "asc" | "desc" };
  filters: LeadSourceFilters;
};

export type UtmTrackingListResponse = {
  data: UtmTrackingItem[];
  pagination: Pagination;
  sort: { sortBy: UtmTrackingSortField; sortOrder: "asc" | "desc" };
  filters: UtmTrackingFilters;
};

export type MarketingFormListResponse = {
  data: MarketingFormItem[];
  pagination: Pagination;
  sort: { sortBy: MarketingFormSortField; sortOrder: "asc" | "desc" };
  filters: MarketingFormFilters;
};

export type LeadSourceFilterOptions = {
  types: string[];
  institutionPrograms: Array<{ id: string; name: string; institutionName: string }>;
};
export type UtmTrackingFilterOptions = {
  sources: string[];
  media: string[];
  campaigns: Array<{ id: string; name: string }>;
};
export type MarketingFormFilterOptions = {
  statuses: string[];
  platforms: string[];
  campaigns: Array<{ id: string; name: string }>;
  templates?: MarketingFormTemplate[];
  leadFields: MarketingFormLeadField[];
  fieldTypes: MarketingFormFieldType[];
  formTypes: MarketingFormType[];
};
export type MarketingFormTemplate = {
  id: string;
  name: string;
  previewImage: string | null;
  config: unknown;
  isDefault: boolean;
  createdAt?: string | null;
};

export type MarketingFormSubmissionListResponse = {
  data: MarketingFormSubmission[];
  pagination: Pagination;
  filters: { status: string };
};

export type PublicMarketingFormConfig = {
  id: string;
  name: string;
  slug?: string | null;
  formType: MarketingFormType;
  title: string;
  subtitle?: string | null;
  description: string | null;
  submitButtonLabel: string;
  primaryColor?: string;
  backgroundColor?: string;
  displaySettings?: MarketingFormSettings;
  closeSettings?: MarketingFormSettings;
  successSettings?: MarketingFormSettings;
  template?: { id: string; name: string; config: unknown } | null;
  platform: string | null;
  campaign: { id: string; name: string } | null;
  fields: Array<{
    fieldKey: string;
    label: string;
    placeholder: string | null;
    fieldType: MarketingFormFieldType;
    isRequired: boolean;
    options: string[];
    validationRules?: Record<string, unknown> | null;
    defaultValue?: string | null;
    sortOrder: number;
  }>;
};
