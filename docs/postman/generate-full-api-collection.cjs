const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "admission-crm-full-api.postman_collection.json");

const bodies = {
  login: { email: "{{email}}", password: "{{password}}" },
  lead: { fullName: "Nguyen Van Test", phone: "0901234567", sourceId: "{{sourceId}}", pipelineStageId: "{{pipelineStageId}}", email: "lead.test@example.com", status: "new", temperature: "warm", note: "Created from Postman", institutionProgramId: "{{institutionProgramId}}" },
  stage: { stageId: "{{pipelineStageId}}" },
  note: { content: "Ghi chu test tu Postman" },
  leadFile: { fileName: "document.pdf", fileUrl: "https://example.com/document.pdf", mimeType: "application/pdf", fileSize: 123456 },
  assign: { assigneeId: "{{assigneeId}}", departmentId: "{{departmentId}}" },
  leadCustomValues: { values: [{ fieldId: "{{customFieldId}}", value: "Test value" }] },
  activity: { leadId: "{{leadId}}", type: "call", content: "Da goi dien tu Postman" },
  activityUpdate: { type: "call", content: "Da cap nhat hoat dong tu Postman" },
  reminder: { leadId: "{{leadId}}", title: "Nhac viec test", content: "Lien he lai lead", remindAt: "{{isoDateTime}}" },
  reminderUpdate: { title: "Nhac viec da cap nhat", content: "Noi dung cap nhat", remindAt: "{{isoDateTime}}" },
  campaign: { name: "Demo Campaign", type: "digital", status: "planning", startDate: "2026-08-01", endDate: "2026-09-01", institutionProgramId: "{{institutionProgramId}}" },
  marketingForm: { name: "Demo Form", platform: "website", formCode: "DEMO-FORM", campaignId: "{{campaignId}}", formType: "lead_form", title: "Dang ky tu van", description: "Form test Postman", submitButtonLabel: "Gui dang ky", webhookEnabled: false, status: "draft", fields: [{ fieldKey: "full_name", label: "Ho ten", fieldType: "text", isRequired: true, options: [], leadField: "full_name", sortOrder: 0, isActive: true }, { fieldKey: "phone", label: "So dien thoai", fieldType: "text", isRequired: true, options: [], leadField: "phone", sortOrder: 1, isActive: true }], mappings: [{ sourceField: "full_name", leadField: "full_name", isRequired: true }, { sourceField: "phone", leadField: "phone", isRequired: true }] },
  builderForm: { name: "Demo Builder Form", slug: "demo-builder-form", platform: "website", campaignId: "{{campaignId}}", sourceId: "{{sourceId}}", formType: "lead_form", title: "Dang ky tu van", submitButtonText: "Gui", status: "draft", displaySettings: {}, duplicateSettings: {}, successSettings: {}, accessSettings: {}, closeSettings: {}, advancedSettings: {}, fields: [{ fieldKey: "full_name", label: "Ho ten", fieldType: "text", required: true, options: [], crmMappingField: "full_name", sortOrder: 0, isActive: true }, { fieldKey: "phone", label: "So dien thoai", fieldType: "text", required: true, options: [], crmMappingField: "phone", sortOrder: 1, isActive: true }] },
  formField: { fieldKey: "email", label: "Email", fieldType: "email", required: false, options: [], crmMappingField: "email", sortOrder: 2, isActive: true },
  reorderFields: { fieldIds: ["{{formFieldId}}"] },
  publicForm: { full_name: "Nguyen Van Public", phone: "0901111222", email: "public@example.com" },
  admission: { leadId: "{{leadId}}", institutionProgramId: "{{institutionProgramId}}", majorId: "{{majorId}}", admissionStatusId: "{{admissionStatusId}}", trainingType: "Chinh quy", applicationReceivedDate: "2026-08-01", feeStatus: "pending", tuitionStatus: "pending" },
  approve: { statusId: "{{admissionStatusId}}" },
  admissionStatus: { statusId: "{{admissionStatusId}}" },
  convert: { classId: "{{classId}}" },
  admissionDocument: { leadId: "{{leadId}}", documentType: "hoc_ba", fileName: "hoc-ba.pdf", fileUrl: "https://example.com/hoc-ba.pdf", mimeType: "application/pdf", fileSize: 123456 },
  documentStatus: { status: "approved", note: "Da kiem tra" },
  status: { name: "Demo Status", code: "demo_status", color: "#2563eb" },
  statusFlow: { fromStatusId: "{{admissionStatusId}}", toStatusIds: ["{{admissionStatusId}}"] },
  feePayment: { feeStatus: "paid", tuitionStatus: "pending", monthlyRevenue: "1000000", paymentAmount: "1000000", paymentMethod: "cash", paidAt: "2026-08-01", note: "Thanh toan test" },
  debt: { debtStatus: "confirmed", note: "Xac nhan cong no test" },
  major: { name: "Demo Major", code: "DEMO-MAJOR", facultyId: "{{facultyId}}" },
  service: { studentId: "{{studentId}}", type: "support", content: "Yeu cau ho tro tu Postman", handledBy: "{{userId}}", status: "open" },
  serviceUpdate: { type: "support", content: "Da cap nhat yeu cau", handledBy: "{{userId}}", status: "resolved" },
  student: { status: "active", facultyId: "{{facultyId}}", classId: "{{classId}}" },
  user: { fullName: "Demo User", email: "demo.user@example.test", phone: "0900000000", status: "active", password: "password123", roleIds: ["{{roleId}}"], departmentIds: ["{{departmentId}}"], accessScope: "DEPARTMENT" },
  role: { name: "Demo Role", code: "DEMO_ROLE", description: "Created from Postman", scopeCode: "DEPARTMENT", permissionIds: ["{{permissionId}}"] },
  scope: { name: "Department", description: "Department scope", isActive: true },
  permission: { code: "demo.permission", name: "Demo Permission", module: "demo", description: "Created from Postman", isActive: true },
  department: { name: "Demo Department", code: "DEMO-DEPT", managerId: "{{userId}}", memberIds: ["{{userId}}"] },
  pipeline: { name: "Demo Pipeline", module: "lead" },
  pipelineStage: { name: "Demo Stage", position: 1, color: "#2563eb", isFinal: false },
  setting: { key: "demo.setting", value: "demo", type: "string" },
  sla: { name: "Demo SLA", module: "lead", durationMinutes: 60, action: "notify", isActive: true },
  exportSetting: { name: "Demo Export", reportType: "overview", filters: {}, isActive: true },
  customField: { fieldKey: "demo_field", fieldLabel: "Demo Field", description: "Created from Postman", fieldType: "TEXT", entityType: "LEAD", scopeType: "PROGRAM", programId: "{{institutionProgramId}}", isRequired: false, isSearchable: false, isFilterable: false, isSensitive: false, displayOrder: 0 },
  customFieldUpdate: { fieldLabel: "Demo Field Updated", description: "Updated from Postman", isRequired: false, isSearchable: false, isFilterable: false, isSensitive: false, displayOrder: 1 },
  customStatus: { status: "deactivate" },
  customReorder: { fieldIds: ["{{customFieldId}}"] },
  automation: { name: "Demo Automation", description: "Created from Postman", triggerType: "lead_created", graphData: { nodes: [], edges: [] }, institutionProgramId: "{{institutionProgramId}}" },
  automationUpdate: { name: "Demo Automation Updated", description: "Updated from Postman", triggerType: "lead_created", graphData: { nodes: [], edges: [] }, isActive: false, institutionProgramId: "{{institutionProgramId}}" },
  toggle: { isActive: false },
  program: { institutionId: "{{institutionId}}", programTypeId: "{{programTypeId}}", name: "Demo Program", code: "DEMO-2026", status: "active" },
};

const api = [
  ["Health", "Health Check", "GET", "/health", "noauth"],
  ["Auth", "Login", "POST", "/auth/login", "noauth", "login", "token"],
  ["Auth", "Me", "GET", "/auth/me"],
  ["Institution Programs", "Options", "GET", "/institution-programs/options", "", "", "program"],
  ["Institution Programs", "List Managed Programs", "GET", "/institution-programs?page={{page}}&limit={{limit}}&search={{search}}&status={{programStatus}}&institutionId={{institutionId}}&programTypeId={{programTypeId}}&sortBy=name&sortOrder=asc", "", "", "institutionProgramId"],
  ["Institution Programs", "Management Options", "GET", "/institution-programs/management-options"],
  ["Institution Programs", "Create Program", "POST", "/institution-programs", "", "program"],
  ["Institution Programs", "Update Program", "PATCH", "/institution-programs/{{institutionProgramId}}", "", "program"],
  ["Institution Programs", "Delete Program", "DELETE", "/institution-programs/{{institutionProgramId}}"],
  ["Dashboard", "Director Dashboard", "GET", "/dashboard/director", "program"],
  ["Leads", "List Leads", "GET", "/leads?page={{page}}&limit={{limit}}&search={{search}}&status={{leadStatus}}&pipelineStageId={{pipelineStageId}}&sourceId={{sourceId}}&institutionProgramId={{institutionProgramId}}&assigneeId={{assigneeId}}&sortBy=createdAt&sortOrder=desc", "program", "", "leadId"],
  ["Leads", "Lead Filter Options", "GET", "/leads/options", "program"],
  ["Leads", "Lead Action Options", "GET", "/leads/action-options", "program"],
  ["Leads", "Lead Custom Field Definitions", "GET", "/leads/custom-fields?institutionProgramId={{institutionProgramId}}"],
  ["Leads", "Create Lead", "POST", "/leads", "program", "lead"],
  ["Leads", "Import Leads From Excel", "POST", "/leads/import", "program", "file"],
  ["Leads", "Update Lead", "PATCH", "/leads/{{leadId}}", "program", "lead"],
  ["Leads", "Change Lead Stage", "PATCH", "/leads/{{leadId}}/stage", "program", "stage"],
  ["Leads", "Delete Lead", "DELETE", "/leads/{{leadId}}", "program"],
  ["Leads", "Add Lead Note", "POST", "/leads/{{leadId}}/notes", "program", "note"],
  ["Leads", "Attach Lead File Metadata", "POST", "/leads/{{leadId}}/files", "program", "leadFile"],
  ["Leads", "Assign Lead", "POST", "/leads/{{leadId}}/assign", "program", "assign"],
  ["Leads", "Get Lead Custom Fields", "GET", "/leads/{{leadId}}/custom-fields"],
  ["Leads", "Patch Lead Custom Fields", "PATCH", "/leads/{{leadId}}/custom-fields", "", "leadCustomValues"],
  ["Leads", "Lead Detail", "GET", "/leads/{{leadId}}", "program"],
  ["Sale", "Sale Options", "GET", "/sale/options", "program"],
  ["Sale", "Lead Assignments", "GET", "/sale/assignments?page={{page}}&limit={{limit}}&search={{search}}&assigneeId={{assigneeId}}&departmentId={{departmentId}}&sortOrder=desc", "program"],
  ["Sale", "Lead Activities", "GET", "/sale/activities?page={{page}}&limit={{limit}}&search={{search}}&type={{activityType}}&userId={{userId}}&sortOrder=desc", "program", "", "activityId"],
  ["Sale", "Create Manual Activity", "POST", "/sale/activities", "program", "activity"],
  ["Sale", "Update Manual Activity", "PATCH", "/sale/activities/{{activityId}}", "program", "activityUpdate"],
  ["Sale", "Reminders", "GET", "/sale/reminders?page={{page}}&limit={{limit}}&search={{search}}&status={{reminderStatus}}&userId={{userId}}&sortOrder=desc", "program", "", "reminderId"],
  ["Sale", "Create Reminder", "POST", "/sale/reminders", "program", "reminder"],
  ["Sale", "Update Reminder", "PATCH", "/sale/reminders/{{reminderId}}", "program", "reminderUpdate"],
  ["Sale", "Complete Reminder", "PATCH", "/sale/reminders/{{reminderId}}/complete", "program"],
  ["Sale", "Sale KPI", "GET", "/sale/kpi", "program"],
  ["Marketing - Campaigns", "List Campaigns", "GET", "/campaigns?page={{page}}&limit={{limit}}&search={{search}}&status={{campaignStatus}}&type={{campaignType}}&institutionProgramId={{institutionProgramId}}&sortBy=createdAt&sortOrder=desc", "program", "", "campaignId"],
  ["Marketing - Campaigns", "Campaign Options", "GET", "/campaigns/options", "program"],
  ["Marketing - Campaigns", "Create Campaign", "POST", "/campaigns", "program", "campaign"],
  ["Marketing - Campaigns", "Update Campaign", "PATCH", "/campaigns/{{campaignId}}", "program", "campaign"],
  ["Marketing - Campaigns", "Delete Campaign", "DELETE", "/campaigns/{{campaignId}}"],
  ["Marketing - References", "List Lead Sources", "GET", "/lead-sources?page={{page}}&limit={{limit}}&search={{search}}&type={{sourceType}}&institutionProgramId={{institutionProgramId}}&sortBy=createdAt&sortOrder=desc", "program", "", "sourceId"],
  ["Marketing - References", "Lead Source Options", "GET", "/lead-sources/options"],
  ["Marketing - References", "List UTM Trackings", "GET", "/utm-trackings?page={{page}}&limit={{limit}}&search={{search}}&source={{utmSource}}&medium={{utmMedium}}&campaignId={{campaignId}}&fromDate={{fromDate}}&toDate={{toDate}}&sortBy=createdAt&sortOrder=desc", "program"],
  ["Marketing - References", "UTM Options", "GET", "/utm-trackings/options"],
  ["Marketing - References", "UTM Analytics", "GET", "/utm-trackings/analytics?page={{page}}&limit={{limit}}&source={{utmSource}}&medium={{utmMedium}}&campaignId={{campaignId}}&fromDate={{fromDate}}&toDate={{toDate}}&dimension=source", "program"],
  ["Marketing - References", "UTM Generated Leads", "GET", "/utm-trackings/leads?page={{page}}&limit={{limit}}&source={{utmSource}}&medium={{utmMedium}}&campaignId={{campaignId}}&fromDate={{fromDate}}&toDate={{toDate}}&groupSource={{utmSource}}&groupMedium={{utmMedium}}&groupCampaign={{campaignName}}&groupCampaignId={{campaignId}}", "program"],
  ["Marketing - Forms Legacy", "List Marketing Forms", "GET", "/marketing-forms?page={{page}}&limit={{limit}}&search={{search}}&status={{formStatus}}&platform={{platform}}&campaignId={{campaignId}}&sortBy=createdAt&sortOrder=desc", "program", "", "formId"],
  ["Marketing - Forms Legacy", "Marketing Form Options", "GET", "/marketing-forms/options", "program"],
  ["Marketing - Forms Legacy", "Create Marketing Form", "POST", "/marketing-forms", "program", "marketingForm"],
  ["Marketing - Forms Legacy", "Marketing Form Submissions", "GET", "/marketing-forms/{{formId}}/submissions?page={{page}}&limit={{limit}}&status={{submissionStatus}}"],
  ["Marketing - Forms Legacy", "Rotate Marketing Form Secret", "POST", "/marketing-forms/{{formId}}/rotate-secret"],
  ["Marketing - Forms Legacy", "Update Marketing Form", "PATCH", "/marketing-forms/{{formId}}", "program", "marketingForm"],
  ["Marketing - Forms Legacy", "Delete Marketing Form", "DELETE", "/marketing-forms/{{formId}}"],
  ["Forms Builder", "List Forms", "GET", "/forms?page={{page}}&limit={{limit}}&search={{search}}&status={{formStatus}}&platform={{platform}}&campaignId={{campaignId}}&sortBy=createdAt&sortOrder=desc", "program", "", "formId"],
  ["Forms Builder", "Form Options", "GET", "/forms/options", "program"],
  ["Forms Builder", "Create Form", "POST", "/forms", "program", "builderForm"],
  ["Forms Builder", "Get Form", "GET", "/forms/{{formId}}"],
  ["Forms Builder", "Put Form", "PUT", "/forms/{{formId}}", "program", "builderForm"],
  ["Forms Builder", "Patch Form", "PATCH", "/forms/{{formId}}", "program", "builderForm"],
  ["Forms Builder", "Delete Form", "DELETE", "/forms/{{formId}}"],
  ["Forms Builder", "Publish Form", "POST", "/forms/{{formId}}/publish"],
  ["Forms Builder", "Duplicate Form", "POST", "/forms/{{formId}}/duplicate"],
  ["Forms Builder", "List Form Fields", "GET", "/forms/{{formId}}/fields"],
  ["Forms Builder", "Create Form Field", "POST", "/forms/{{formId}}/fields", "", "formField"],
  ["Forms Builder", "Reorder Form Fields", "PATCH", "/forms/{{formId}}/fields/reorder", "", "reorderFields"],
  ["Forms Builder", "Form Submissions", "GET", "/forms/{{formId}}/submissions?page={{page}}&limit={{limit}}&status={{submissionStatus}}"],
  ["Forms Builder", "Update Form Field", "PUT", "/form-fields/{{formFieldId}}", "", "formField"],
  ["Forms Builder", "Delete Form Field", "DELETE", "/form-fields/{{formFieldId}}"],
  ["Public Forms", "Get Public Form", "GET", "/public/forms/{{publicKey}}", "noauth"],
  ["Public Forms", "Submit Public Form", "POST", "/public/forms/{{publicKey}}/submit", "noauth", "publicForm"],
  ["Public Forms", "Submit Public Form Webhook", "POST", "/public/webhooks/forms/{{publicKey}}", "noauth webhook", "publicForm"],
  ["Admissions", "List Admissions", "GET", "/admissions?page={{page}}&limit={{limit}}&search={{search}}&statusId={{admissionStatusId}}&institutionProgramId={{institutionProgramId}}&majorId={{majorId}}&sortBy=createdAt&sortOrder=desc", "program", "", "admissionId"],
  ["Admissions", "Admission Options", "GET", "/admissions/options", "program"],
  ["Admissions", "Admission Action Options", "GET", "/admissions/action-options", "program"],
  ["Admissions", "Create Admission Profile", "POST", "/admissions", "program", "admission"],
  ["Admissions", "Update Admission Profile", "PUT", "/admissions/{{admissionId}}", "program", "admission"],
  ["Admissions", "Approve Admission", "POST", "/admissions/{{admissionId}}/approve", "program", "approve"],
  ["Admissions", "Change Admission Status", "POST", "/admissions/{{admissionId}}/status", "program", "admissionStatus"],
  ["Admissions", "Convert Admission To Student", "POST", "/admissions/{{admissionId}}/convert-to-student", "program", "convert"],
  ["Admission Documents", "List Documents", "GET", "/admissions/documents?page={{page}}&limit={{limit}}&search={{search}}&status={{documentStatus}}&type={{documentType}}&sortBy=uploadedAt&sortOrder=desc", "program", "", "admissionDocumentId"],
  ["Admission Documents", "Document Options", "GET", "/admissions/documents/options", "program"],
  ["Admission Documents", "Document Action Options", "GET", "/admissions/documents/action-options", "program"],
  ["Admission Documents", "Upload Document Metadata", "POST", "/admissions/documents", "program", "admissionDocument"],
  ["Admission Documents", "Update Document Status", "POST", "/admissions/documents/{{admissionDocumentId}}/status", "program", "documentStatus"],
  ["Admission Statuses And Fees", "List Statuses", "GET", "/admissions/statuses?page={{page}}&limit={{limit}}&search={{search}}&sortBy=createdAt&sortOrder=desc", "", "", "admissionStatusId"],
  ["Admission Statuses And Fees", "Status Flow", "GET", "/admissions/statuses/flow"],
  ["Admission Statuses And Fees", "Create Status", "POST", "/admissions/statuses", "", "status"],
  ["Admission Statuses And Fees", "Update Status Flow", "PUT", "/admissions/statuses/flow", "", "statusFlow"],
  ["Admission Statuses And Fees", "Update Status", "PUT", "/admissions/statuses/{{admissionStatusId}}", "", "status"],
  ["Admission Statuses And Fees", "Delete Status", "DELETE", "/admissions/statuses/{{admissionStatusId}}"],
  ["Admission Statuses And Fees", "List Fees", "GET", "/admissions/fees?page={{page}}&limit={{limit}}&search={{search}}&status={{feeStatus}}&sortBy=createdAt&sortOrder=desc", "program"],
  ["Admission Statuses And Fees", "Fee Options", "GET", "/admissions/fees/options", "program"],
  ["Admission Statuses And Fees", "Fee History", "GET", "/admissions/fees/{{admissionId}}/history", "program"],
  ["Admission Statuses And Fees", "Update Fee Payment", "POST", "/admissions/fees/{{admissionId}}/payment", "program", "feePayment"],
  ["Admission Statuses And Fees", "Confirm Debt", "POST", "/admissions/fees/{{admissionId}}/debt-confirmation", "program", "debt"],
  ["Majors", "List Majors", "GET", "/majors?page={{page}}&limit={{limit}}&search={{search}}&sortBy=createdAt&sortOrder=desc", "program", "", "majorId"],
  ["Majors", "Major Options", "GET", "/majors/options", "program"],
  ["Majors", "Create Major", "POST", "/majors", "program", "major"],
  ["Majors", "Update Major", "PATCH", "/majors/{{majorId}}", "program", "major"],
  ["Majors", "Delete Major", "DELETE", "/majors/{{majorId}}", "program"],
  ["Students", "List Students", "GET", "/students?page={{page}}&limit={{limit}}&search={{search}}&status={{studentStatus}}&institutionProgramId={{institutionProgramId}}&majorId={{majorId}}&facultyId={{facultyId}}&classId={{classId}}&sortBy=enrolledAt&sortOrder=desc", "program", "", "studentId"],
  ["Students", "Student Options", "GET", "/students/options", "program"],
  ["Students", "List Student Services", "GET", "/students/services?page={{page}}&limit={{limit}}&search={{search}}&type={{serviceType}}&status={{serviceStatus}}&studentId={{studentId}}&sortBy=createdAt&sortOrder=desc", "program", "", "studentServiceId"],
  ["Students", "Create Student Service", "POST", "/students/services", "program", "service"],
  ["Students", "Student Service Options", "GET", "/students/services/options", "program"],
  ["Students", "Update Student Service", "PATCH", "/students/services/{{studentServiceId}}", "program", "serviceUpdate"],
  ["Students", "Support History", "GET", "/students/support-history?page={{page}}&limit={{limit}}&search={{search}}&type={{serviceType}}&status={{serviceStatus}}&studentId={{studentId}}&sortBy=createdAt&sortOrder=desc", "program"],
  ["Students", "Student Detail", "GET", "/students/{{studentId}}", "program"],
  ["Students", "Update Student", "PATCH", "/students/{{studentId}}", "program", "student"],
  ["Reports", "Overview Report", "GET", "/reports/overview?institutionProgramId={{institutionProgramId}}", "program"],
  ["Reports", "Overview Report Options", "GET", "/reports/overview/options"],
  ["Reports", "Marketing Detail Report", "GET", "/reports/marketing-detail?institutionProgramId={{institutionProgramId}}&fromDate={{fromDate}}&toDate={{toDate}}", "program"],
  ["Reports", "Sale Detail Report", "GET", "/reports/sale-detail?institutionProgramId={{institutionProgramId}}&fromDate={{fromDate}}&toDate={{toDate}}", "program"],
  ["Reports", "Admission Detail Report", "GET", "/reports/admission-detail?institutionProgramId={{institutionProgramId}}&fromDate={{fromDate}}&toDate={{toDate}}", "program"],
  ["Reports", "Student Detail Report", "GET", "/reports/student-detail?institutionProgramId={{institutionProgramId}}&fromDate={{fromDate}}&toDate={{toDate}}", "program"],
  ["Notifications", "My Notifications", "GET", "/notifications?page={{page}}&limit={{limit}}", "", "", "notificationId"],
  ["Notifications", "Mark Notification Read", "PATCH", "/notifications/{{notificationId}}/read"],
  ["Audit Logs", "List Audit Logs", "GET", "/audit-logs?page={{page}}&limit={{limit}}&search={{search}}&action={{auditAction}}&entityType={{entityType}}&userId={{userId}}&fromDate={{fromDate}}&toDate={{toDate}}&sortBy=createdAt&sortOrder=desc", "", "", "auditLogId"],
  ["Audit Logs", "Audit Log Options", "GET", "/audit-logs/options"],
  ["Audit Logs", "Audit Log Detail", "GET", "/audit-logs/{{auditLogId}}"],
  ["Management - Users Roles Permissions", "List Users", "GET", "/users?page={{page}}&limit={{limit}}&search={{search}}&status={{userStatus}}&roleId={{roleId}}&departmentId={{departmentId}}&sortBy=createdAt&sortOrder=desc", "", "", "userId"],
  ["Management - Users Roles Permissions", "User Options", "GET", "/users/options"],
  ["Management - Users Roles Permissions", "Create User", "POST", "/users", "", "user"],
  ["Management - Users Roles Permissions", "Update User", "PATCH", "/users/{{userId}}", "", "user"],
  ["Management - Users Roles Permissions", "List Roles", "GET", "/roles", "", "", "roleId"],
  ["Management - Users Roles Permissions", "Role Options", "GET", "/roles/options"],
  ["Management - Users Roles Permissions", "Access Scopes", "GET", "/roles/scopes"],
  ["Management - Users Roles Permissions", "Create Role", "POST", "/roles", "", "role"],
  ["Management - Users Roles Permissions", "Update Role", "PATCH", "/roles/{{roleId}}", "", "role"],
  ["Management - Users Roles Permissions", "Delete Role", "DELETE", "/roles/{{roleId}}"],
  ["Management - Users Roles Permissions", "Update Access Scope", "PATCH", "/roles/scopes/{{scopeCode}}", "", "scope"],
  ["Management - Users Roles Permissions", "List Permissions", "GET", "/permissions?page={{page}}&limit={{limit}}&search={{search}}&module={{permissionModule}}&status={{permissionStatus}}&sortBy=code&sortOrder=asc", "", "", "permissionId"],
  ["Management - Users Roles Permissions", "Permission Options", "GET", "/permissions/options"],
  ["Management - Users Roles Permissions", "Create Permission", "POST", "/permissions", "", "permission"],
  ["Management - Users Roles Permissions", "Update Permission", "PATCH", "/permissions/{{permissionId}}", "", "permission"],
  ["Management - Users Roles Permissions", "Delete Permission", "DELETE", "/permissions/{{permissionId}}"],
  ["Management - Departments Pipelines System", "List Departments", "GET", "/departments?page={{page}}&limit={{limit}}&search={{search}}&sortBy=name&sortOrder=asc", "", "", "departmentId"],
  ["Management - Departments Pipelines System", "Department Options", "GET", "/departments/options"],
  ["Management - Departments Pipelines System", "Create Department", "POST", "/departments", "", "department"],
  ["Management - Departments Pipelines System", "Update Department", "PATCH", "/departments/{{departmentId}}", "", "department"],
  ["Management - Departments Pipelines System", "Delete Department", "DELETE", "/departments/{{departmentId}}"],
  ["Management - Departments Pipelines System", "List Pipelines", "GET", "/pipelines?page={{page}}&limit={{limit}}&search={{search}}&module={{pipelineModule}}&sortBy=name&sortOrder=asc", "", "", "pipelineId"],
  ["Management - Departments Pipelines System", "Pipeline Options", "GET", "/pipelines/options"],
  ["Management - Departments Pipelines System", "Create Pipeline", "POST", "/pipelines", "", "pipeline"],
  ["Management - Departments Pipelines System", "Update Pipeline", "PATCH", "/pipelines/{{pipelineId}}", "", "pipeline"],
  ["Management - Departments Pipelines System", "Delete Pipeline", "DELETE", "/pipelines/{{pipelineId}}"],
  ["Management - Departments Pipelines System", "Create Pipeline Stage", "POST", "/pipelines/{{pipelineId}}/stages", "", "pipelineStage"],
  ["Management - Departments Pipelines System", "Update Pipeline Stage", "PATCH", "/pipelines/{{pipelineId}}/stages/{{pipelineStageId}}", "", "pipelineStage"],
  ["Management - Departments Pipelines System", "Delete Pipeline Stage", "DELETE", "/pipelines/{{pipelineId}}/stages/{{pipelineStageId}}"],
  ["Management - Departments Pipelines System", "System Dashboard", "GET", "/system"],
  ["Management - Departments Pipelines System", "Upsert Setting", "POST", "/system/settings", "", "setting"],
  ["Management - Departments Pipelines System", "Delete Setting", "DELETE", "/system/settings/{{settingId}}"],
  ["Management - Departments Pipelines System", "Create SLA Rule", "POST", "/system/sla-rules", "", "sla"],
  ["Management - Departments Pipelines System", "Update SLA Rule", "PATCH", "/system/sla-rules/{{slaRuleId}}", "", "sla"],
  ["Management - Departments Pipelines System", "Delete SLA Rule", "DELETE", "/system/sla-rules/{{slaRuleId}}"],
  ["Management - Departments Pipelines System", "Create Export Setting", "POST", "/system/export-settings", "", "exportSetting"],
  ["Management - Departments Pipelines System", "Update Export Setting", "PATCH", "/system/export-settings/{{reportConfigId}}", "", "exportSetting"],
  ["Management - Departments Pipelines System", "Delete Export Setting", "DELETE", "/system/export-settings/{{reportConfigId}}"],
  ["Custom Fields", "List Custom Fields", "GET", "/custom-fields?entityType={{customFieldEntityType}}&scopeType={{customFieldScopeType}}&programId={{institutionProgramId}}&includeArchived=false", "", "", "customFieldId"],
  ["Custom Fields", "Reorder Custom Fields", "PATCH", "/custom-fields/reorder", "", "customReorder"],
  ["Custom Fields", "Custom Fields By Entity", "GET", "/custom-fields/entity/{{customFieldEntityType}}"],
  ["Custom Fields", "Create Custom Field", "POST", "/custom-fields", "", "customField"],
  ["Custom Fields", "Set Custom Field Status", "PATCH", "/custom-fields/{{customFieldId}}/status", "", "customStatus"],
  ["Custom Fields", "Get Custom Field", "GET", "/custom-fields/{{customFieldId}}"],
  ["Custom Fields", "Update Custom Field", "PATCH", "/custom-fields/{{customFieldId}}", "", "customFieldUpdate"],
  ["Automations", "List Automations", "GET", "/automations?page={{page}}&limit={{limit}}&search={{search}}&isActive={{automationIsActive}}&triggerType={{triggerType}}&institutionProgramId={{institutionProgramId}}", "", "", "automationId"],
  ["Automations", "Automation Options", "GET", "/automations/options"],
  ["Automations", "Get Automation", "GET", "/automations/{{automationId}}"],
  ["Automations", "Create Automation", "POST", "/automations", "", "automation"],
  ["Automations", "Update Automation", "PATCH", "/automations/{{automationId}}", "", "automationUpdate"],
  ["Automations", "Toggle Automation", "PATCH", "/automations/{{automationId}}/toggle", "", "toggle"],
  ["Automations", "Delete Automation", "DELETE", "/automations/{{automationId}}"],
  ["Automations", "Automation Logs", "GET", "/automations/{{automationId}}/logs?page={{page}}&limit={{limit}}"],
];

const variables = [
  ["baseUrl", "http://localhost:3000/api"], ["email", "director@example.test"], ["password", "password"],
  ["accessToken", ""], ["page", "1"], ["limit", "20"], ["search", ""], ["institutionProgramId", ""],
  ["leadId", ""], ["sourceId", ""], ["pipelineId", ""], ["pipelineStageId", ""], ["assigneeId", ""],
  ["departmentId", ""], ["userId", ""], ["roleId", ""], ["permissionId", ""], ["campaignId", ""],
  ["formId", ""], ["formFieldId", ""], ["publicKey", ""], ["webhookSecret", ""], ["admissionId", ""],
  ["admissionStatusId", ""], ["admissionDocumentId", ""], ["majorId", ""], ["facultyId", ""], ["classId", ""],
  ["studentId", ""], ["studentServiceId", ""], ["notificationId", ""], ["auditLogId", ""], ["customFieldId", ""],
  ["automationId", ""], ["activityId", ""], ["reminderId", ""], ["settingId", ""], ["slaRuleId", ""],
  ["reportConfigId", ""], ["institutionId", ""], ["programTypeId", ""], ["fromDate", "2026-07-01"],
  ["toDate", "2026-07-29"], ["isoDateTime", "2026-08-01T09:00:00+07:00"], ["scopeCode", "DEPARTMENT"],
  ["customFieldEntityType", "LEAD"], ["customFieldScopeType", "PROGRAM"], ["leadStatus", ""], ["campaignStatus", ""],
  ["campaignType", ""], ["sourceType", ""], ["utmSource", ""], ["utmMedium", ""], ["campaignName", ""],
  ["formStatus", ""], ["platform", ""], ["submissionStatus", ""], ["documentStatus", ""], ["documentType", ""],
  ["feeStatus", ""], ["studentStatus", ""], ["serviceType", ""], ["serviceStatus", ""], ["auditAction", ""],
  ["entityType", ""], ["userStatus", ""], ["programStatus", ""], ["permissionModule", ""], ["permissionStatus", ""],
  ["pipelineModule", ""], ["activityType", ""], ["reminderStatus", ""], ["automationIsActive", ""], ["triggerType", ""],
];

function toUrl(raw) {
  const [pathPart, queryPart] = raw.split("?");
  const query = queryPart ? queryPart.split("&").map((pair) => {
    const [key, value = ""] = pair.split("=");
    return { key, value };
  }) : undefined;
  return {
    raw: `{{baseUrl}}${raw}`,
    host: ["{{baseUrl}}"],
    path: pathPart.replace(/^\//, "").split("/").filter(Boolean),
    ...(query ? { query } : {}),
  };
}

function tests(kind) {
  if (kind === "token") return [
    "pm.test('Login successful', function () { pm.response.to.have.status(200); });",
    "const json = pm.response.json();",
    "if (json.accessToken) pm.collectionVariables.set('accessToken', json.accessToken);",
  ];
  if (kind === "program") return [
    "pm.test('Programs loaded', function () { pm.response.to.have.status(200); });",
    "const json = pm.response.json();",
    "if (Array.isArray(json.data) && json.data.length) pm.collectionVariables.set('institutionProgramId', json.data[0].id);",
  ];
  if (kind) return [
    "pm.test('Request succeeded', function () { pm.expect(pm.response.code).to.be.oneOf([200, 201]); });",
    "const json = pm.response.json();",
    "const list = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);",
    `if (list.length && list[0].id) pm.collectionVariables.set('${kind}', list[0].id);`,
  ];
  return null;
}

function item([folder, name, method, rawUrl, flags = "", bodyKey = "", testKind = ""]) {
  const request = { method, header: [], url: toUrl(rawUrl) };
  if (flags.includes("noauth")) request.auth = { type: "noauth" };
  if (flags.includes("program")) {
    request.header.push({ key: "X-Institution-Program-Id", value: "{{institutionProgramId}}", disabled: false });
  }
  if (flags.includes("webhook")) request.header.push({ key: "x-webhook-secret", value: "{{webhookSecret}}" });
  if (bodyKey === "file") {
    request.body = { mode: "formdata", formdata: [{ key: "file", type: "file", src: [] }] };
  } else if (bodyKey) {
    request.header.unshift({ key: "Content-Type", value: "application/json" });
    request.body = { mode: "raw", raw: JSON.stringify(bodies[bodyKey], null, 2) };
  }
  const event = tests(testKind);
  return { folder, value: { name, request, response: [], ...(event ? { event: [{ listen: "test", script: { type: "text/javascript", exec: event } }] } : {}) } };
}

const folders = new Map();
for (const row of api) {
  const built = item(row);
  if (!folders.has(built.folder)) folders.set(built.folder, []);
  folders.get(built.folder).push(built.value);
}

const collection = {
  info: {
    _postman_id: "d7b7f3dd-8a13-44f6-bc95-66a9f9127a71",
    name: "Admission CRM - Full API",
    description: "Full collection generated from Admission CRM Express routers. Run Auth/Login first, then Institution Programs/Options. Replace placeholder ids as needed for write requests.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }] },
  item: [...folders.entries()].map(([name, items]) => ({ name, item: items })),
  variable: variables.map(([key, value]) => ({ key, value, type: "string" })),
};

fs.writeFileSync(out, JSON.stringify(collection, null, 2) + "\n", "utf8");
console.log(`Wrote ${out}`);
console.log(`Folders: ${collection.item.length}`);
console.log(`Requests: ${api.length}`);
