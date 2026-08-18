import { hash } from "bcryptjs";

import { prisma } from "./prisma";

const password = "123456";
const baseDate = new Date();
const hours = (value: number) => new Date(baseDate.getTime() + value * 60 * 60 * 1000);
const days = (value: number) => hours(value * 24);

const ids = {
  institutions: [
    "10000000-0000-4000-8000-000000000201",
    "10000000-0000-4000-8000-000000000202",
  ],
  programTypes: [
    "10000000-0000-4000-8000-000000000211",
    "10000000-0000-4000-8000-000000000212",
  ],
  institutionPrograms: [
    "10000000-0000-4000-8000-000000000221",
    "10000000-0000-4000-8000-000000000222",
  ],
  kpiTargets: [
    "10000000-0000-4000-8000-000000000231",
    "10000000-0000-4000-8000-000000000232",
  ],
  reportConfig: "10000000-0000-4000-8000-000000000241",
  pipeline: "10000000-0000-4000-8000-000000000001",
  stages: [
    "10000000-0000-4000-8000-000000000011",
    "10000000-0000-4000-8000-000000000012",
    "10000000-0000-4000-8000-000000000013",
    "10000000-0000-4000-8000-000000000014",
    "10000000-0000-4000-8000-000000000015",
    "10000000-0000-4000-8000-000000000016",
    "10000000-0000-4000-8000-000000000017",
    "10000000-0000-4000-8000-000000000018",
  ],
  sources: [
    "10000000-0000-4000-8000-000000000021",
    "10000000-0000-4000-8000-000000000022",
    "10000000-0000-4000-8000-000000000023",
  ],
  campaigns: [
    "10000000-0000-4000-8000-000000000031",
    "10000000-0000-4000-8000-000000000032",
  ],
  forms: [
    "10000000-0000-4000-8000-000000000041",
    "10000000-0000-4000-8000-000000000042",
  ],
  utms: [
    "10000000-0000-4000-8000-000000000051",
    "10000000-0000-4000-8000-000000000052",
    "10000000-0000-4000-8000-000000000053",
  ],
  assignments: [
    "10000000-0000-4000-8000-000000000061",
    "10000000-0000-4000-8000-000000000062",
    "10000000-0000-4000-8000-000000000063",
    "10000000-0000-4000-8000-000000000064",
    "10000000-0000-4000-8000-000000000065",
    "10000000-0000-4000-8000-000000000066",
  ],
  histories: [
    "10000000-0000-4000-8000-000000000071",
    "10000000-0000-4000-8000-000000000072",
    "10000000-0000-4000-8000-000000000073",
  ],
  activities: [
    "10000000-0000-4000-8000-000000000081",
    "10000000-0000-4000-8000-000000000082",
    "10000000-0000-4000-8000-000000000083",
    "10000000-0000-4000-8000-000000000084",
    "10000000-0000-4000-8000-000000000085",
    "10000000-0000-4000-8000-000000000086",
    "10000000-0000-4000-8000-000000000087",
    "10000000-0000-4000-8000-000000000088",
  ],
  notes: [
    "10000000-0000-4000-8000-000000000091",
    "10000000-0000-4000-8000-000000000092",
  ],
  reminders: [
    "10000000-0000-4000-8000-000000000101",
    "10000000-0000-4000-8000-000000000102",
    "10000000-0000-4000-8000-000000000103",
    "10000000-0000-4000-8000-000000000104",
  ],
  notifications: [
    "10000000-0000-4000-8000-000000000111",
    "10000000-0000-4000-8000-000000000112",
    "10000000-0000-4000-8000-000000000113",
  ],
  files: [
    "10000000-0000-4000-8000-000000000121",
    "10000000-0000-4000-8000-000000000122",
  ],
  fileRelation: "10000000-0000-4000-8000-000000000131",
  documents: [
    "10000000-0000-4000-8000-000000000141",
    "10000000-0000-4000-8000-000000000142",
  ],
  profiles: [
    "10000000-0000-4000-8000-000000000151",
    "10000000-0000-4000-8000-000000000152",
  ],
  services: [
    "10000000-0000-4000-8000-000000000161",
    "10000000-0000-4000-8000-000000000162",
    "10000000-0000-4000-8000-000000000163",
  ],
  audits: [
    "10000000-0000-4000-8000-000000000171",
    "10000000-0000-4000-8000-000000000172",
    "10000000-0000-4000-8000-000000000173",
  ],
  tags: [
    "10000000-0000-4000-8000-000000000181",
    "10000000-0000-4000-8000-000000000182",
  ],
  entityTags: [
    "10000000-0000-4000-8000-000000000191",
    "10000000-0000-4000-8000-000000000192",
  ],
} as const;

const permissionDefinitions = {
  DIRECTOR: [
    ["dashboard.view_all", "Xem dashboard điều hành", "dashboard"],
    ["report.view_all", "Xem toàn bộ báo cáo", "report"],
    ["lead.view_all", "Xem toàn bộ lead", "lead"],
    ["lead.sensitive.view", "Xem dữ liệu nhạy cảm của lead", "lead"],
    ["lead.create", "Tạo lead", "lead"],
    ["lead.update_all", "Cập nhật toàn bộ lead", "lead"],
    ["lead.delete", "Xóa lead", "lead"],
    ["lead.assign", "Phân công lead", "lead"],
    ["lead.reassign", "Chuyển người phụ trách lead", "lead"],
    ["lead_note.create", "Thêm ghi chú lead", "lead"],
    ["lead_activity.create", "Ghi hoạt động chăm sóc lead", "lead"],
    ["lead_activity.update", "Cập nhật hoạt động chăm sóc lead", "lead"],
    ["reminder.create", "Tạo nhắc việc", "lead"],
    ["reminder.update", "Cập nhật nhắc việc", "lead"],
    ["reminder.complete", "Hoàn tất nhắc việc", "lead"],
    ["file.upload", "Đính kèm tệp cho lead", "lead"],
    ["campaign.view_all", "Xem toàn bộ chiến dịch", "marketing"],
    ["campaign.create", "Tạo chiến dịch", "marketing"],
    ["campaign.update", "Cập nhật toàn bộ chiến dịch", "marketing"],
    ["campaign.delete", "Xóa chiến dịch", "marketing"],
    ["marketing_form.manage", "Quản lý biểu mẫu Marketing", "marketing"],
    ["admission.view_all", "Xem toàn bộ hồ sơ tuyển sinh", "admission"],
    ["admission.view", "Xem hồ sơ tuyển sinh", "admission"],
    ["admission.update", "Cập nhật hồ sơ tuyển sinh", "admission"],
    ["admission.approve", "Duyệt hồ sơ tuyển sinh", "admission"],
    ["admission_status.update", "Chuyển trạng thái hồ sơ tuyển sinh", "admission"],
    ["admission_document.view", "Xem tài liệu hồ sơ tuyển sinh", "admission"],
    ["document.sensitive.view", "Xem tệp tài liệu hồ sơ tuyển sinh", "admission"],
    ["admission_document.upload", "Upload và cập nhật tài liệu hồ sơ tuyển sinh", "admission"],
    ["student.create_from_admission", "Chuyển hồ sơ tuyển sinh sang sinh viên", "student"],
    ["admission_major.manage", "Quản lý ngành theo chương trình", "admission"],
    ["institution_program.manage", "Quản lý chương trình tuyển sinh", "admission"],
    ["student.view_all", "Xem toàn bộ sinh viên", "student"],
    ["student.update_all", "Cập nhật toàn bộ sinh viên", "student"],
    ["student_service.view", "Xem dịch vụ sinh viên", "student"],
    ["student_service.create", "Tạo yêu cầu dịch vụ sinh viên", "student"],
    ["student_service.update", "Cập nhật dịch vụ sinh viên", "student"],
    ["user.manage", "Quản lý người dùng", "system"],
    ["role.manage", "Quản lý vai trò và scope truy cập", "system"],
    ["permission.manage", "Quản lý danh mục quyền", "system"],
    ["department.manage", "Quản lý phòng ban", "system"],
    ["pipeline.manage", "Quản lý pipeline", "system"],
    ["automation.manage", "Quản lý Rule Automation", "system"],
    ["system.manage", "Quản lý cấu hình hệ thống", "system"],
    ["audit.view", "Xem audit log", "system"],
  ],
  SALE_MANAGER: [
    ["lead.view_department", "Xem lead trong phòng ban", "lead"],
    ["lead.sensitive.view", "Xem dữ liệu nhạy cảm của lead", "lead"],
    ["lead.create", "Tạo lead", "lead"],
    ["lead.assign", "Phân công lead", "lead"],
    ["lead.reassign", "Chuyển người phụ trách lead", "lead"],
    ["lead.update_department", "Cập nhật lead trong phòng ban", "lead"],
    ["lead_activity.view_department", "Xem hoạt động lead trong phòng ban", "lead"],
    ["lead_activity.create", "Ghi hoạt động chăm sóc lead", "lead"],
    ["lead_activity.update", "Cập nhật hoạt động chăm sóc lead", "lead"],
    ["lead_note.view_department", "Xem ghi chú lead trong phòng ban", "lead"],
    ["reminder.create", "Tạo nhắc việc", "lead"],
    ["reminder.update", "Cập nhật nhắc việc", "lead"],
    ["reminder.complete", "Hoàn tất nhắc việc", "lead"],
    ["custom_field.view", "Xem cấu hình trường dữ liệu", "custom_field"],
    ["custom_field.create", "Tạo trường dữ liệu", "custom_field"],
    ["custom_field.update", "Cập nhật trường dữ liệu", "custom_field"],
    ["custom_field.archive", "Lưu trữ trường dữ liệu", "custom_field"],
    ["custom_field.manage_options", "Quản lý lựa chọn trường dữ liệu", "custom_field"],
    ["custom_field.manage_groups", "Quản lý nhóm trường dữ liệu", "custom_field"],
  ],
  TELESALE: [
    ["lead.view_assigned", "Xem lead được phân công", "lead"],
    ["lead.sensitive.view", "Xem dữ liệu nhạy cảm của lead", "lead"],
    ["lead.update_assigned", "Cập nhật lead được phân công", "lead"],
    ["lead_note.create", "Thêm ghi chú lead", "lead"],
    ["lead_activity.create", "Ghi hoạt động chăm sóc lead", "lead"],
    ["lead_activity.update", "Cập nhật hoạt động chăm sóc lead", "lead"],
    ["reminder.create", "Tạo nhắc việc", "lead"],
    ["reminder.update", "Cập nhật nhắc việc", "lead"],
    ["reminder.complete", "Hoàn tất nhắc việc", "lead"],
    ["file.upload", "Đính kèm tệp cho lead", "lead"],
  ],
  MARKETING_MANAGER: [
    ["campaign.view", "Xem chiến dịch phòng Marketing", "marketing"],
    ["campaign.create", "Tạo chiến dịch", "marketing"],
    ["campaign.update", "Cập nhật chiến dịch phòng Marketing", "marketing"],
    ["campaign.delete", "Xóa chiến dịch phòng Marketing", "marketing"],
    ["lead_source.manage", "Quản lý nguồn lead Marketing", "marketing"],
    ["utm.view", "Xem UTM phòng Marketing", "marketing"],
    ["marketing_form.manage", "Quản lý biểu mẫu Marketing", "marketing"],
  ],
  STUDENT_SERVICE: [
    ["student.view", "Xem sinh vien theo pham vi", "student"],
    ["student.update", "Cap nhat sinh vien theo pham vi", "student"],
    ["student_service.view", "Xem dich vu sinh vien", "student"],
    ["student_service.create", "Tao yeu cau dich vu sinh vien", "student"],
    ["student_service.update", "Cap nhat dich vu sinh vien", "student"],
  ],
} as const;

async function seedAccess() {
  const passwordHash = await hash(password, 10);
  const roles = await Promise.all([
    prisma.roles.upsert({ where: { code: "DIRECTOR" }, update: { name: "Giám đốc" }, create: { code: "DIRECTOR", name: "Giám đốc" } }),
    prisma.roles.upsert({ where: { code: "SALE_MANAGER" }, update: { name: "Quản lý Sale" }, create: { code: "SALE_MANAGER", name: "Quản lý Sale" } }),
    prisma.roles.upsert({ where: { code: "TELESALE" }, update: { name: "Telesale" }, create: { code: "TELESALE", name: "Telesale" } }),
    prisma.roles.upsert({ where: { code: "MARKETING_MANAGER" }, update: { name: "Quản lý Marketing" }, create: { code: "MARKETING_MANAGER", name: "Quản lý Marketing" } }),
    prisma.roles.upsert({ where: { code: "STUDENT_SERVICE" }, update: { name: "Dịch vụ sinh viên" }, create: { code: "STUDENT_SERVICE", name: "Dịch vụ sinh viên" } }),
  ]);
  const roleByCode = new Map(roles.map((role) => [role.code, role]));

  for (const [roleCode, definitions] of Object.entries(permissionDefinitions)) {
    const role = roleByCode.get(roleCode)!;
    const permissions = await Promise.all(
      definitions.map(([code, name, module]) =>
        prisma.permissions.upsert({
          where: { code },
          update: { name, module },
          create: { code, name, module },
        }),
      ),
    );
    await prisma.role_permissions.createMany({
      data: permissions.map((permission) => ({ role_id: role.id, permission_id: permission.id })),
      skipDuplicates: true,
    });
  }
  const legacyMarketingPermission = await prisma.permissions.findUnique({
    where: { code: "campaign.view_all" },
    select: { id: true },
  });
  if (legacyMarketingPermission) {
    await prisma.role_permissions.deleteMany({
      where: {
        role_id: roleByCode.get("MARKETING_MANAGER")!.id,
        permission_id: legacyMarketingPermission.id,
      },
    });
  }

  const users = await Promise.all([
    prisma.users.upsert({
      where: { email: "director@tvu.edu.vn" },
      update: { password_hash: passwordHash, full_name: "Nguyễn Minh Giám đốc", status: "active", deleted_at: null },
      create: { email: "director@tvu.edu.vn", password_hash: passwordHash, full_name: "Nguyễn Minh Giám đốc" },
    }),
    prisma.users.upsert({
      where: { email: "sale.manager@tvu.edu.vn" },
      update: { password_hash: passwordHash, full_name: "Trần Thu Quản lý Sale", status: "active", deleted_at: null },
      create: { email: "sale.manager@tvu.edu.vn", password_hash: passwordHash, full_name: "Trần Thu Quản lý Sale" },
    }),
    prisma.users.upsert({
      where: { email: "telesale@tvu.edu.vn" },
      update: { password_hash: passwordHash, full_name: "Lê Lan Telesale", status: "active", deleted_at: null },
      create: { email: "telesale@tvu.edu.vn", password_hash: passwordHash, full_name: "Lê Lan Telesale" },
    }),
    prisma.users.upsert({
      where: { email: "telesale.2@tvu.edu.vn" },
      update: { password_hash: passwordHash, full_name: "Phạm An Telesale", status: "active", deleted_at: null },
      create: { email: "telesale.2@tvu.edu.vn", password_hash: passwordHash, full_name: "Phạm An Telesale" },
    }),
    prisma.users.upsert({
      where: { email: "student.service@tvu.edu.vn" },
      update: { password_hash: passwordHash, full_name: "Do Ha Dich vu sinh vien", status: "active", deleted_at: null },
      create: { email: "student.service@tvu.edu.vn", password_hash: passwordHash, full_name: "Do Ha Dich vu sinh vien" },
    }),
    prisma.users.upsert({
      where: { email: "marketing@tvu.edu.vn" },
      update: { password_hash: passwordHash, full_name: "Võ Mai Marketing", status: "active", deleted_at: null },
      create: { email: "marketing@tvu.edu.vn", password_hash: passwordHash, full_name: "Võ Mai Marketing" },
    }),
  ]);
  const [director, manager, telesale, telesaleTwo, studentService, marketing] = users;
  const saleDepartment = await prisma.departments.upsert({
    where: { code: "SALE" },
    update: { name: "Kinh doanh / Telesale", manager_id: manager.id },
    create: { code: "SALE", name: "Kinh doanh / Telesale", manager_id: manager.id },
  });
  const marketingDepartment = await prisma.departments.upsert({
    where: { code: "MARKETING" },
    update: { name: "Marketing", manager_id: marketing.id },
    create: { code: "MARKETING", name: "Marketing", manager_id: marketing.id },
  });
  const studentServiceDepartment = await prisma.departments.upsert({
    where: { code: "STUDENT_SERVICE" },
    update: { name: "Dich vu sinh vien", manager_id: studentService.id },
    create: { code: "STUDENT_SERVICE", name: "Dich vu sinh vien", manager_id: studentService.id },
  });

  await prisma.user_roles.createMany({
    data: [
      { user_id: director.id, role_id: roleByCode.get("DIRECTOR")!.id },
      { user_id: manager.id, role_id: roleByCode.get("SALE_MANAGER")!.id },
      { user_id: telesale.id, role_id: roleByCode.get("TELESALE")!.id },
      { user_id: telesaleTwo.id, role_id: roleByCode.get("TELESALE")!.id },
      { user_id: marketing.id, role_id: roleByCode.get("MARKETING_MANAGER")!.id },
      { user_id: studentService.id, role_id: roleByCode.get("STUDENT_SERVICE")!.id },
    ],
    skipDuplicates: true,
  });
  await prisma.user_departments.createMany({
    data: [
      { user_id: manager.id, department_id: saleDepartment.id },
      { user_id: telesale.id, department_id: saleDepartment.id },
      { user_id: telesaleTwo.id, department_id: saleDepartment.id },
      { user_id: marketing.id, department_id: marketingDepartment.id },
      { user_id: studentService.id, department_id: studentServiceDepartment.id },
    ],
    skipDuplicates: true,
  });

  return { director, manager, telesale, telesaleTwo, marketing, studentService, saleDepartment };
}

async function seedBusinessData(principals: Awaited<ReturnType<typeof seedAccess>>) {
  const { director, manager, telesale, telesaleTwo, marketing, saleDepartment } = principals;
  const institutions = await Promise.all([
    prisma.institutions.upsert({ where: { code: "TVU" }, update: { name: "Đại học Trà Vinh - từ xa", status: "active" }, create: { id: ids.institutions[0], code: "TVU", name: "Đại học Trà Vinh - từ xa", status: "active" } }),
    prisma.institutions.upsert({ where: { code: "TVU-LI" }, update: { name: "Đại học Trà Vinh - chính quy", status: "active" }, create: { id: ids.institutions[1], code: "TVU-LI", name: "Đại học Trà Vinh - chính quy", status: "active" } }),
  ]);
  const programTypes = await Promise.all([
    prisma.program_types.upsert({ where: { code: "FULL_TIME" }, update: { name: "Chinh quy" }, create: { id: ids.programTypes[0], code: "FULL_TIME", name: "Chinh quy" } }),
    prisma.program_types.upsert({ where: { code: "PART_TIME" }, update: { name: "Vua lam vua hoc" }, create: { id: ids.programTypes[1], code: "PART_TIME", name: "Vua lam vua hoc" } }),
  ]);
  const institutionPrograms = await Promise.all([
    prisma.institution_programs.upsert({ where: { code: "TVU-CQ-2026" }, update: { institution_id: institutions[0].id, program_type_id: programTypes[0].id, name: "Chinh quy 2026", status: "active" }, create: { id: ids.institutionPrograms[0], code: "TVU-CQ-2026", institution_id: institutions[0].id, program_type_id: programTypes[0].id, name: "Chinh quy 2026", status: "active" } }),
    prisma.institution_programs.upsert({ where: { code: "TVU-LI-VLVH-2026" }, update: { institution_id: institutions[1].id, program_type_id: programTypes[1].id, name: "Lien ket VLVH 2026", status: "active" }, create: { id: ids.institutionPrograms[1], code: "TVU-LI-VLVH-2026", institution_id: institutions[1].id, program_type_id: programTypes[1].id, name: "Lien ket VLVH 2026", status: "active" } }),
  ]);
  const demoRoles = await prisma.roles.findMany({
    where: { code: { in: ["DIRECTOR", "SALE_MANAGER", "TELESALE", "MARKETING_MANAGER", "STUDENT_SERVICE"] } },
    select: { id: true },
  });
  await prisma.role_institution_programs.createMany({
    data: demoRoles.flatMap((role) =>
      institutionPrograms.map((program) => ({
        role_id: role.id,
        institution_program_id: program.id,
      })),
    ),
    skipDuplicates: true,
  });
  const pipeline = await prisma.pipelines.upsert({
    where: { id: ids.pipeline },
    update: { name: "Tiến trình tuyển sinh 2026", module: "sale" },
    create: { id: ids.pipeline, name: "Tiến trình tuyển sinh 2026", module: "sale" },
  });
  const stages = await Promise.all([
    prisma.pipeline_stages.upsert({ where: { id: ids.stages[0] }, update: { pipeline_id: pipeline.id, name: "Đã tiếp nhận (L0)", position: 1, color: "#64748B", is_final: false }, create: { id: ids.stages[0], pipeline_id: pipeline.id, name: "Đã tiếp nhận (L0)", position: 1, color: "#64748B" } }),
    prisma.pipeline_stages.upsert({ where: { id: ids.stages[1] }, update: { pipeline_id: pipeline.id, name: "Tiếp cận (L1)", position: 2, color: "#2563EB", is_final: false }, create: { id: ids.stages[1], pipeline_id: pipeline.id, name: "Tiếp cận (L1)", position: 2, color: "#2563EB" } }),
    prisma.pipeline_stages.upsert({ where: { id: ids.stages[2] }, update: { pipeline_id: pipeline.id, name: "Tư vấn (L2)", position: 3, color: "#0EA5E9", is_final: false }, create: { id: ids.stages[2], pipeline_id: pipeline.id, name: "Tư vấn (L2)", position: 3, color: "#0EA5E9" } }),
    prisma.pipeline_stages.upsert({ where: { id: ids.stages[3] }, update: { pipeline_id: pipeline.id, name: "Đăng ký học (L3)", position: 4, color: "#8B5CF6", is_final: false }, create: { id: ids.stages[3], pipeline_id: pipeline.id, name: "Đăng ký học (L3)", position: 4, color: "#8B5CF6" } }),
    prisma.pipeline_stages.upsert({ where: { id: ids.stages[4] }, update: { pipeline_id: pipeline.id, name: "Hoàn thành (L5)", position: 5, color: "#10B981", is_final: false }, create: { id: ids.stages[4], pipeline_id: pipeline.id, name: "Hoàn thành (L5)", position: 5, color: "#10B981" } }),
    prisma.pipeline_stages.upsert({ where: { id: ids.stages[5] }, update: { pipeline_id: pipeline.id, name: "Nhập học (L8)", position: 6, color: "#16A34A", is_final: true }, create: { id: ids.stages[5], pipeline_id: pipeline.id, name: "Nhập học (L8)", position: 6, color: "#16A34A", is_final: true } }),
    prisma.pipeline_stages.upsert({ where: { id: ids.stages[6] }, update: { pipeline_id: pipeline.id, name: "CSKH", position: 7, color: "#F59E0B", is_final: false }, create: { id: ids.stages[6], pipeline_id: pipeline.id, name: "CSKH", position: 7, color: "#F59E0B" } }),
    prisma.pipeline_stages.upsert({ where: { id: ids.stages[7] }, update: { pipeline_id: pipeline.id, name: "Fail", position: 8, color: "#DC2626", is_final: true }, create: { id: ids.stages[7], pipeline_id: pipeline.id, name: "Fail", position: 8, color: "#DC2626", is_final: true } }),
  ]);
  const legacyStages = await prisma.pipeline_stages.findMany({
    where: { id: { notIn: [...ids.stages] } },
    select: { id: true, name: true },
  });
  const canonicalStageByLegacyName = new Map([
    ["Lead mới", stages[0].id],
    ["Đã tiếp nhận", stages[0].id],
    ["Đã tiếp nhận (L0)", stages[0].id],
    ["Tiếp cận", stages[1].id],
    ["Tiếp cận (L1)", stages[1].id],
    ["Đang tư vấn", stages[2].id],
    ["Tư vấn", stages[2].id],
    ["Tư vấn (L2)", stages[2].id],
    ["Nộp hồ sơ", stages[3].id],
    ["Đăng ký học", stages[3].id],
    ["Đăng ký học (L3)", stages[3].id],
    ["Hoàn thành", stages[4].id],
    ["Hoàn thành (L5)", stages[4].id],
    ["Đã nhập học", stages[5].id],
    ["Nhập học", stages[5].id],
    ["Nhập học (L8)", stages[5].id],
    ["CSKH", stages[6].id],
    ["Fail", stages[7].id],
  ]);
  for (const legacyStage of legacyStages) {
    const replacementStageId = canonicalStageByLegacyName.get(legacyStage.name) ?? stages[0].id;
    await prisma.$transaction([
      prisma.leads.updateMany({ where: { pipeline_stage_id: legacyStage.id }, data: { pipeline_stage_id: replacementStageId } }),
      prisma.lead_status_histories.updateMany({ where: { from_stage_id: legacyStage.id }, data: { from_stage_id: replacementStageId } }),
      prisma.lead_status_histories.updateMany({ where: { to_stage_id: legacyStage.id }, data: { to_stage_id: replacementStageId } }),
    ]);
  }
  await prisma.pipeline_stages.deleteMany({ where: { id: { notIn: [...ids.stages] } } });
  await prisma.pipelines.deleteMany({ where: { id: { not: pipeline.id } } });
  const sources = await Promise.all([
    prisma.lead_sources.upsert({ where: { id: ids.sources[0] }, update: { name: "Facebook Ads", type: "paid_social", institution_program_id: institutionPrograms[0].id }, create: { id: ids.sources[0], name: "Facebook Ads", type: "paid_social", institution_program_id: institutionPrograms[0].id } }),
    prisma.lead_sources.upsert({ where: { id: ids.sources[1] }, update: { name: "Website đăng ký", type: "organic", institution_program_id: institutionPrograms[1].id }, create: { id: ids.sources[1], name: "Website đăng ký", type: "organic", institution_program_id: institutionPrograms[1].id } }),
    prisma.lead_sources.upsert({ where: { id: ids.sources[2] }, update: { name: "Sự kiện tư vấn", type: "offline" }, create: { id: ids.sources[2], name: "Sự kiện tư vấn", type: "offline" } }),
  ]);
  const campaigns = await Promise.all([
    prisma.campaigns.upsert({
      where: { id: ids.campaigns[0] },
      update: { name: "Tuyển sinh đại học 2026", institution_program_id: institutionPrograms[0].id, type: "digital", start_date: days(-60), end_date: days(60), budget: 150000000, status: "active", created_by: marketing.id },
      create: { id: ids.campaigns[0], name: "Tuyển sinh đại học 2026", institution_program_id: institutionPrograms[0].id, type: "digital", start_date: days(-60), end_date: days(60), budget: 150000000, status: "active", created_by: marketing.id },
    }),
    prisma.campaigns.upsert({
      where: { id: ids.campaigns[1] },
      update: { name: "Ngày hội hướng nghiệp", institution_program_id: institutionPrograms[1].id, type: "event", start_date: days(-30), end_date: days(-10), budget: 45000000, status: "completed", created_by: marketing.id },
      create: { id: ids.campaigns[1], name: "Ngày hội hướng nghiệp", institution_program_id: institutionPrograms[1].id, type: "event", start_date: days(-30), end_date: days(-10), budget: 45000000, status: "completed", created_by: marketing.id },
    }),
  ]);

  const leads = await Promise.all([
    prisma.leads.upsert({
      where: { lead_code: "DEMO-LD-001" },
      update: { full_name: "Nguyễn Hải Anh", phone: "0901000001", email: "hai.anh@example.test", source_id: sources[0].id, institution_program_id: institutionPrograms[0].id, pipeline_stage_id: stages[1].id, owner_id: manager.id, assigned_to: telesale.id, status: "contacted", lead_score: 78, temperature: "hot", deleted_at: null },
      create: { lead_code: "DEMO-LD-001", full_name: "Nguyễn Hải Anh", phone: "0901000001", email: "hai.anh@example.test", source_id: sources[0].id, institution_program_id: institutionPrograms[0].id, pipeline_stage_id: stages[1].id, owner_id: manager.id, assigned_to: telesale.id, status: "contacted", lead_score: 78, temperature: "hot", created_at: days(-7) },
    }),
    prisma.leads.upsert({
      where: { lead_code: "DEMO-LD-002" },
      update: { full_name: "Trần Minh Khoa", phone: "0901000002", source_id: sources[1].id, institution_program_id: institutionPrograms[1].id, pipeline_stage_id: stages[0].id, owner_id: manager.id, assigned_to: telesaleTwo.id, status: "new", lead_score: 42, temperature: "warm", deleted_at: null },
      create: { lead_code: "DEMO-LD-002", full_name: "Trần Minh Khoa", phone: "0901000002", source_id: sources[1].id, institution_program_id: institutionPrograms[1].id, pipeline_stage_id: stages[0].id, owner_id: manager.id, assigned_to: telesaleTwo.id, status: "new", lead_score: 42, temperature: "warm", created_at: days(-4) },
    }),
    prisma.leads.upsert({
      where: { lead_code: "DEMO-LD-003" },
      update: { full_name: "Lê Thu Trang", phone: "0901000003", email: "thu.trang@example.test", source_id: sources[0].id, institution_program_id: institutionPrograms[0].id, pipeline_stage_id: stages[2].id, owner_id: manager.id, assigned_to: telesale.id, status: "qualified", lead_score: 91, temperature: "hot", deleted_at: null },
      create: { lead_code: "DEMO-LD-003", full_name: "Lê Thu Trang", phone: "0901000003", email: "thu.trang@example.test", source_id: sources[0].id, institution_program_id: institutionPrograms[0].id, pipeline_stage_id: stages[2].id, owner_id: manager.id, assigned_to: telesale.id, status: "qualified", lead_score: 91, temperature: "hot", created_at: days(-18) },
    }),
    prisma.leads.upsert({
      where: { lead_code: "DEMO-LD-004" },
      update: { full_name: "Phạm Quốc Bảo", phone: "0901000004", source_id: sources[2].id, institution_program_id: institutionPrograms[0].id, pipeline_stage_id: stages[5].id, owner_id: manager.id, assigned_to: telesale.id, status: "converted", lead_score: 96, temperature: "hot", deleted_at: null },
      create: { lead_code: "DEMO-LD-004", full_name: "Phạm Quốc Bảo", phone: "0901000004", source_id: sources[2].id, institution_program_id: institutionPrograms[0].id, pipeline_stage_id: stages[5].id, owner_id: manager.id, assigned_to: telesale.id, status: "converted", lead_score: 96, temperature: "hot", created_at: days(-42) },
    }),
    prisma.leads.upsert({
      where: { lead_code: "DEMO-LD-005" },
      update: { full_name: "Vũ Thanh Mai", phone: "0901000005", source_id: sources[1].id, pipeline_stage_id: stages[1].id, owner_id: manager.id, assigned_to: telesaleTwo.id, status: "contacted", lead_score: 62, temperature: "warm", deleted_at: null },
      create: { lead_code: "DEMO-LD-005", full_name: "Vũ Thanh Mai", phone: "0901000005", source_id: sources[1].id, pipeline_stage_id: stages[1].id, owner_id: manager.id, assigned_to: telesaleTwo.id, status: "contacted", lead_score: 62, temperature: "warm", created_at: days(-3) },
    }),
    prisma.leads.upsert({
      where: { lead_code: "DEMO-LD-006" },
      update: { full_name: "Đỗ Gia Huy", phone: "0901000006", source_id: sources[0].id, pipeline_stage_id: stages[0].id, owner_id: manager.id, assigned_to: telesale.id, status: "new", lead_score: 34, temperature: "cold", deleted_at: null },
      create: { lead_code: "DEMO-LD-006", full_name: "Đỗ Gia Huy", phone: "0901000006", source_id: sources[0].id, pipeline_stage_id: stages[0].id, owner_id: manager.id, assigned_to: telesale.id, status: "new", lead_score: 34, temperature: "cold", created_at: days(-1) },
    }),
  ]);

  for (const [index, lead] of leads.entries()) {
    const assignee = index === 1 || index === 4 ? telesaleTwo : telesale;
    await prisma.lead_assignments.upsert({
      where: { id: ids.assignments[index] },
      update: { lead_id: lead.id, assigned_to: assignee.id, assigned_by: manager.id, department_id: saleDepartment.id, is_main_owner: true },
      create: { id: ids.assignments[index], lead_id: lead.id, assigned_to: assignee.id, assigned_by: manager.id, department_id: saleDepartment.id, is_main_owner: true, assigned_at: days(-6 + index) },
    });
  }

  await prisma.lead_status_histories.upsert({ where: { id: ids.histories[0] }, update: { lead_id: leads[0].id, from_stage_id: stages[0].id, to_stage_id: stages[1].id, changed_by: telesale.id }, create: { id: ids.histories[0], lead_id: leads[0].id, from_stage_id: stages[0].id, to_stage_id: stages[1].id, changed_by: telesale.id, changed_at: days(-5) } });
  await prisma.lead_status_histories.upsert({ where: { id: ids.histories[1] }, update: { lead_id: leads[2].id, from_stage_id: stages[1].id, to_stage_id: stages[2].id, changed_by: telesale.id }, create: { id: ids.histories[1], lead_id: leads[2].id, from_stage_id: stages[1].id, to_stage_id: stages[2].id, changed_by: telesale.id, changed_at: days(-10) } });
  await prisma.lead_status_histories.upsert({ where: { id: ids.histories[2] }, update: { lead_id: leads[3].id, from_stage_id: stages[4].id, to_stage_id: stages[5].id, changed_by: telesale.id }, create: { id: ids.histories[2], lead_id: leads[3].id, from_stage_id: stages[4].id, to_stage_id: stages[5].id, changed_by: telesale.id, changed_at: days(-20) } });

  const activityData = [
    [leads[0].id, telesale.id, "lead_assigned", "Đã phân công lead cho Lê Lan Telesale.", null, days(-7)],
    [leads[0].id, telesale.id, "call", "Đã gọi tư vấn ngành học và lịch nộp hồ sơ.", { origin: "manual" }, days(-5)],
    [leads[0].id, telesale.id, "reminder_created", "Tạo nhắc việc: Gọi lại xác nhận lịch tư vấn.", null, days(-2)],
    [leads[0].id, null, "reminder_due", "Nhắc việc đã đến hạn: Xác nhận nhu cầu nhập học.", null, days(-1)],
    [leads[2].id, telesale.id, "meeting", "Phụ huynh đã xác nhận nộp hồ sơ.", { origin: "manual" }, days(-8)],
    [leads[2].id, null, "reminder_overdue", "Nhắc việc đã quá hạn: Kiểm tra hồ sơ còn thiếu.", null, hours(-28)],
    [leads[3].id, telesale.id, "pipeline_stage_changed", "Chuyển lead sang tiến trình Nhập học (L8).", null, days(-20)],
    [leads[3].id, telesale.id, "file_attached", "Đính kèm giấy báo nhập học.", null, days(-18)],
  ] as const;
  for (const [index, activity] of activityData.entries()) {
    const [leadId, userId, type, content, metadata, createdAt] = activity;
    await prisma.lead_activities.upsert({
      where: { id: ids.activities[index] },
      update: { lead_id: leadId, user_id: userId, type, content, ...(metadata ? { metadata } : {}) },
      create: { id: ids.activities[index], lead_id: leadId, user_id: userId, type, content, ...(metadata ? { metadata } : {}), created_at: createdAt },
    });
  }
  await prisma.lead_notes.upsert({ where: { id: ids.notes[0] }, update: { lead_id: leads[0].id, user_id: telesale.id, content: "Ứng viên quan tâm Công nghệ thông tin, cần tư vấn học phí." }, create: { id: ids.notes[0], lead_id: leads[0].id, user_id: telesale.id, content: "Ứng viên quan tâm Công nghệ thông tin, cần tư vấn học phí.", created_at: days(-5) } });
  await prisma.lead_notes.upsert({ where: { id: ids.notes[1] }, update: { lead_id: leads[2].id, user_id: telesale.id, content: "Đã nhận bản scan học bạ, chờ bổ sung CCCD." }, create: { id: ids.notes[1], lead_id: leads[2].id, user_id: telesale.id, content: "Đã nhận bản scan học bạ, chờ bổ sung CCCD.", created_at: days(-7) } });

  await prisma.reminders.upsert({ where: { id: ids.reminders[0] }, update: { lead_id: leads[0].id, user_id: telesale.id, title: "Gọi lại xác nhận lịch tư vấn", content: "Gửi thông tin học phí trước khi gọi.", remind_at: days(1), status: "pending", due_notified_at: null, overdue_notified_at: null }, create: { id: ids.reminders[0], lead_id: leads[0].id, user_id: telesale.id, title: "Gọi lại xác nhận lịch tư vấn", content: "Gửi thông tin học phí trước khi gọi.", remind_at: days(1), status: "pending", created_at: days(-2) } });
  await prisma.reminders.upsert({ where: { id: ids.reminders[1] }, update: { lead_id: leads[0].id, user_id: telesale.id, title: "Xác nhận nhu cầu nhập học", remind_at: days(-1), status: "pending", due_notified_at: days(-1), overdue_notified_at: null }, create: { id: ids.reminders[1], lead_id: leads[0].id, user_id: telesale.id, title: "Xác nhận nhu cầu nhập học", remind_at: days(-1), status: "pending", due_notified_at: days(-1), created_at: days(-3) } });
  await prisma.reminders.upsert({ where: { id: ids.reminders[2] }, update: { lead_id: leads[2].id, user_id: telesale.id, title: "Kiểm tra hồ sơ còn thiếu", remind_at: days(-3), status: "pending", due_notified_at: days(-3), overdue_notified_at: days(-2) }, create: { id: ids.reminders[2], lead_id: leads[2].id, user_id: telesale.id, title: "Kiểm tra hồ sơ còn thiếu", remind_at: days(-3), status: "pending", due_notified_at: days(-3), overdue_notified_at: days(-2), created_at: days(-6) } });
  await prisma.reminders.upsert({ where: { id: ids.reminders[3] }, update: { lead_id: leads[3].id, user_id: telesale.id, title: "Xác nhận đã nhập học", remind_at: days(-20), status: "done", due_notified_at: days(-20) }, create: { id: ids.reminders[3], lead_id: leads[3].id, user_id: telesale.id, title: "Xác nhận đã nhập học", remind_at: days(-20), status: "done", due_notified_at: days(-20), created_at: days(-22) } });

  await prisma.notifications.upsert({ where: { id: ids.notifications[0] }, update: { user_id: telesale.id, title: "Bạn được phân công lead mới", content: "Lead Nguyễn Hải Anh đã được phân công cho bạn.", type: "lead_assignment", is_read: false }, create: { id: ids.notifications[0], user_id: telesale.id, title: "Bạn được phân công lead mới", content: "Lead Nguyễn Hải Anh đã được phân công cho bạn.", type: "lead_assignment", is_read: false, created_at: days(-7) } });
  await prisma.notifications.upsert({ where: { id: ids.notifications[1] }, update: { user_id: telesale.id, title: "Nhắc việc đã đến hạn", content: "Nhắc việc \"Xác nhận nhu cầu nhập học\" của lead Nguyễn Hải Anh đã đến hạn xử lý.", type: "reminder_due", is_read: false }, create: { id: ids.notifications[1], user_id: telesale.id, title: "Nhắc việc đã đến hạn", content: "Nhắc việc \"Xác nhận nhu cầu nhập học\" của lead Nguyễn Hải Anh đã đến hạn xử lý.", type: "reminder_due", is_read: false, created_at: days(-1) } });
  await prisma.notifications.upsert({ where: { id: ids.notifications[2] }, update: { user_id: telesale.id, title: "Nhắc việc đã quá hạn", content: "Nhắc việc \"Kiểm tra hồ sơ còn thiếu\" của lead Lê Thu Trang vẫn chưa hoàn tất sau 24 giờ.", type: "reminder_overdue", is_read: false }, create: { id: ids.notifications[2], user_id: telesale.id, title: "Nhắc việc đã quá hạn", content: "Nhắc việc \"Kiểm tra hồ sơ còn thiếu\" của lead Lê Thu Trang vẫn chưa hoàn tất sau 24 giờ.", type: "reminder_overdue", is_read: false, created_at: days(-2) } });

  await prisma.marketing_forms.upsert({ where: { id: ids.forms[0] }, update: { name: "Form tư vấn ngành học", platform: "facebook", form_code: "FB-DEMO-2026", campaign_id: campaigns[0].id, status: "active" }, create: { id: ids.forms[0], name: "Form tư vấn ngành học", platform: "facebook", form_code: "FB-DEMO-2026", campaign_id: campaigns[0].id, status: "active", created_at: days(-50) } });
  await prisma.marketing_forms.upsert({ where: { id: ids.forms[1] }, update: { name: "Form đăng ký tham quan", platform: "website", form_code: "WEB-DEMO-2026", campaign_id: campaigns[1].id, status: "closed" }, create: { id: ids.forms[1], name: "Form đăng ký tham quan", platform: "website", form_code: "WEB-DEMO-2026", campaign_id: campaigns[1].id, status: "closed", created_at: days(-25) } });
  await prisma.marketing_form_field_mappings.createMany({
    data: [
      { marketing_form_id: ids.forms[0], source_field: "full_name", lead_field: "full_name", is_required: true },
      { marketing_form_id: ids.forms[0], source_field: "phone_number", lead_field: "phone", is_required: true },
      { marketing_form_id: ids.forms[0], source_field: "email", lead_field: "email", is_required: false },
      { marketing_form_id: ids.forms[1], source_field: "name", lead_field: "full_name", is_required: true },
      { marketing_form_id: ids.forms[1], source_field: "phone", lead_field: "phone", is_required: true },
    ],
    skipDuplicates: true,
  });
  await prisma.utm_trackings.upsert({ where: { id: ids.utms[0] }, update: { lead_id: leads[0].id, campaign_id: campaigns[0].id, utm_source: "facebook", utm_medium: "cpc", utm_campaign: "tuyen-sinh-2026", landing_page: "https://demo.tvu.edu.vn/tuyen-sinh" }, create: { id: ids.utms[0], lead_id: leads[0].id, campaign_id: campaigns[0].id, utm_source: "facebook", utm_medium: "cpc", utm_campaign: "tuyen-sinh-2026", landing_page: "https://demo.tvu.edu.vn/tuyen-sinh", created_at: days(-7) } });
  await prisma.utm_trackings.upsert({ where: { id: ids.utms[1] }, update: { lead_id: leads[2].id, campaign_id: campaigns[0].id, utm_source: "google", utm_medium: "search", utm_campaign: "dai-hoc-chinh-quy", landing_page: "https://demo.tvu.edu.vn/dang-ky" }, create: { id: ids.utms[1], lead_id: leads[2].id, campaign_id: campaigns[0].id, utm_source: "google", utm_medium: "search", utm_campaign: "dai-hoc-chinh-quy", landing_page: "https://demo.tvu.edu.vn/dang-ky", created_at: days(-18) } });
  await prisma.utm_trackings.upsert({ where: { id: ids.utms[2] }, update: { lead_id: leads[3].id, campaign_id: campaigns[1].id, utm_source: "offline", utm_medium: "event", utm_campaign: "huong-nghiep", landing_page: null }, create: { id: ids.utms[2], lead_id: leads[3].id, campaign_id: campaigns[1].id, utm_source: "offline", utm_medium: "event", utm_campaign: "huong-nghiep", created_at: days(-42) } });

  return { leads, stages, institutionPrograms };
}

async function seedAdmissionAndStudents(principals: Awaited<ReturnType<typeof seedAccess>>, data: Awaited<ReturnType<typeof seedBusinessData>>) {
  const { director, manager, telesale } = principals;
  const { leads, institutionPrograms } = data;
  const faculty = await prisma.faculties.upsert({ where: { code: "CNTT" }, update: { name: "Công nghệ thông tin" }, create: { code: "CNTT", name: "Công nghệ thông tin" } });
  const economicsFaculty = await prisma.faculties.upsert({ where: { code: "KT" }, update: { name: "Kinh tế" }, create: { code: "KT", name: "Kinh tế" } });
  await prisma.majors.updateMany({ where: { code: "7480201", institution_program_id: null }, data: { institution_program_id: institutionPrograms[0].id } });
  await prisma.majors.updateMany({ where: { code: "7340101", institution_program_id: null }, data: { institution_program_id: institutionPrograms[1].id } });
  const major = await prisma.majors.upsert({ where: { institution_program_id_code: { institution_program_id: institutionPrograms[0].id, code: "7480201" } }, update: { name: "Công nghệ thông tin", faculty_id: faculty.id }, create: { institution_program_id: institutionPrograms[0].id, code: "7480201", name: "Công nghệ thông tin", faculty_id: faculty.id } });
  const economicsMajor = await prisma.majors.upsert({ where: { institution_program_id_code: { institution_program_id: institutionPrograms[1].id, code: "7340101" } }, update: { name: "Quản trị kinh doanh", faculty_id: economicsFaculty.id }, create: { institution_program_id: institutionPrograms[1].id, code: "7340101", name: "Quản trị kinh doanh", faculty_id: economicsFaculty.id } });
  const classItem = await prisma.student_classes.upsert({ where: { code: "DA26CNTT01" }, update: { name: "Đại học CNTT K26 - Lớp 01", faculty_id: faculty.id }, create: { code: "DA26CNTT01", name: "Đại học CNTT K26 - Lớp 01", faculty_id: faculty.id } });
  const submitted = await prisma.admission_statuses.upsert({ where: { code: "SUBMITTED" }, update: { name: "Đã nộp hồ sơ", color: "#F59E0B" }, create: { code: "SUBMITTED", name: "Đã nộp hồ sơ", color: "#F59E0B" } });
  const enrolled = await prisma.admission_statuses.upsert({ where: { code: "ENROLLED" }, update: { name: "Đã nhập học", color: "#16A34A" }, create: { code: "ENROLLED", name: "Đã nhập học", color: "#16A34A" } });
  await prisma.admission_statuses.upsert({ where: { code: "NEEDS_DOCUMENTS" }, update: { name: "Cần bổ sung", color: "#DC2626" }, create: { code: "NEEDS_DOCUMENTS", name: "Cần bổ sung", color: "#DC2626" } });

  const profileOne = await prisma.admission_profiles.upsert({
    where: { lead_id: leads[2].id },
    update: { admission_code: "DEMO-HS-001", institution_program_id: institutionPrograms[0].id, major_id: major.id, admission_status_id: submitted.id, training_type: "Chính quy", fee_status: "paid", tuition_status: "pending", monthly_revenue: 12500000 },
    create: { id: ids.profiles[0], lead_id: leads[2].id, admission_code: "DEMO-HS-001", institution_program_id: institutionPrograms[0].id, major_id: major.id, admission_status_id: submitted.id, training_type: "Chính quy", fee_status: "paid", tuition_status: "pending", monthly_revenue: 12500000, application_received_date: days(-10), created_at: days(-10) },
  });
  const profileTwo = await prisma.admission_profiles.upsert({
    where: { lead_id: leads[3].id },
    update: { admission_code: "DEMO-HS-002", institution_program_id: institutionPrograms[0].id, major_id: major.id, admission_status_id: enrolled.id, training_type: "Chính quy", fee_status: "paid", tuition_status: "paid", monthly_revenue: 14500000 },
    create: { id: ids.profiles[1], lead_id: leads[3].id, admission_code: "DEMO-HS-002", institution_program_id: institutionPrograms[0].id, major_id: major.id, admission_status_id: enrolled.id, training_type: "Chính quy", fee_status: "paid", tuition_status: "paid", monthly_revenue: 14500000, application_received_date: days(-32), created_at: days(-32) },
  });
  await prisma.student_profiles.upsert({ where: { lead_id: leads[3].id }, update: { high_school_name: "THPT Trà Vinh", graduation_year: 2026, nationality: "Việt Nam" }, create: { lead_id: leads[3].id, high_school_name: "THPT Trà Vinh", graduation_year: 2026, nationality: "Việt Nam" } });

  const leadFile = await prisma.files.upsert({ where: { id: ids.files[0] }, update: { file_name: "tu-van-nganh-hoc.pdf", file_url: "https://storage.example.test/demo/tu-van-nganh-hoc.pdf", mime_type: "application/pdf", file_size: BigInt(240000), uploaded_by: telesale.id }, create: { id: ids.files[0], file_name: "tu-van-nganh-hoc.pdf", file_url: "https://storage.example.test/demo/tu-van-nganh-hoc.pdf", mime_type: "application/pdf", file_size: BigInt(240000), uploaded_by: telesale.id, created_at: days(-4) } });
  const documentFile = await prisma.files.upsert({ where: { id: ids.files[1] }, update: { file_name: "hoc-ba-demo.pdf", file_url: "https://storage.example.test/demo/hoc-ba-demo.pdf", mime_type: "application/pdf", file_size: BigInt(610000), uploaded_by: telesale.id }, create: { id: ids.files[1], file_name: "hoc-ba-demo.pdf", file_url: "https://storage.example.test/demo/hoc-ba-demo.pdf", mime_type: "application/pdf", file_size: BigInt(610000), uploaded_by: telesale.id, created_at: days(-9) } });
  await prisma.file_relations.upsert({ where: { id: ids.fileRelation }, update: { file_id: leadFile.id, entity_type: "lead", entity_id: leads[0].id }, create: { id: ids.fileRelation, file_id: leadFile.id, entity_type: "lead", entity_id: leads[0].id, created_at: days(-4) } });
  await prisma.admission_documents.upsert({ where: { id: ids.documents[0] }, update: { lead_id: leads[2].id, document_type: "Học bạ THPT", file_id: documentFile.id, status: "approved" }, create: { id: ids.documents[0], lead_id: leads[2].id, document_type: "Học bạ THPT", file_id: documentFile.id, status: "approved", uploaded_at: days(-9) } });
  await prisma.admission_documents.upsert({ where: { id: ids.documents[1] }, update: { lead_id: leads[2].id, document_type: "Căn cước công dân", status: "missing" }, create: { id: ids.documents[1], lead_id: leads[2].id, document_type: "Căn cước công dân", status: "missing", uploaded_at: days(-8) } });

  const student = await prisma.students.upsert({
    where: { student_code: "DEMO-SV-001" },
    update: { lead_id: leads[3].id, admission_profile_id: profileTwo.id, institution_program_id: institutionPrograms[0].id, major_id: major.id, faculty_id: faculty.id, class_id: classItem.id, status: "active" },
    create: { student_code: "DEMO-SV-001", lead_id: leads[3].id, admission_profile_id: profileTwo.id, institution_program_id: institutionPrograms[0].id, major_id: major.id, faculty_id: faculty.id, class_id: classItem.id, status: "active", enrolled_at: days(-14), created_at: days(-14) },
  });
  await prisma.leads.updateMany({ where: { id: { in: [leads[2].id, leads[3].id] } }, data: { major_id: major.id } });
  await prisma.kpi_targets.upsert({ where: { id: ids.kpiTargets[0] }, update: { institution_program_id: institutionPrograms[0].id, target_type: "enrolled_students", period_start: days(-30), period_end: days(30), target_value: 120 }, create: { id: ids.kpiTargets[0], institution_program_id: institutionPrograms[0].id, target_type: "enrolled_students", period_start: days(-30), period_end: days(30), target_value: 120 } });
  await prisma.kpi_targets.upsert({ where: { id: ids.kpiTargets[1] }, update: { institution_program_id: institutionPrograms[1].id, target_type: "qualified_leads", period_start: days(-30), period_end: days(30), target_value: 80 }, create: { id: ids.kpiTargets[1], institution_program_id: institutionPrograms[1].id, target_type: "qualified_leads", period_start: days(-30), period_end: days(30), target_value: 80 } });
  await prisma.report_configs.upsert({ where: { id: ids.reportConfig }, update: { institution_program_id: institutionPrograms[0].id, name: "Tong hop tuyen sinh chinh quy", report_type: "overview", filters: { status: "active" }, is_active: true }, create: { id: ids.reportConfig, institution_program_id: institutionPrograms[0].id, name: "Tong hop tuyen sinh chinh quy", report_type: "overview", filters: { status: "active" }, is_active: true } });
  await prisma.student_services.upsert({ where: { id: ids.services[0] }, update: { student_id: student.id, type: "tuition_support", status: "resolved", content: "Hướng dẫn tra cứu học phí học kỳ đầu.", handled_by: director.id }, create: { id: ids.services[0], student_id: student.id, type: "tuition_support", status: "resolved", content: "Hướng dẫn tra cứu học phí học kỳ đầu.", handled_by: director.id, created_at: days(-10) } });
  await prisma.student_services.upsert({ where: { id: ids.services[1] }, update: { student_id: student.id, type: "student_card", status: "in_progress", content: "Tiếp nhận yêu cầu cấp thẻ sinh viên.", handled_by: director.id }, create: { id: ids.services[1], student_id: student.id, type: "student_card", status: "in_progress", content: "Tiếp nhận yêu cầu cấp thẻ sinh viên.", handled_by: director.id, created_at: days(-7) } });
  await prisma.student_services.upsert({ where: { id: ids.services[2] }, update: { student_id: student.id, type: "academic_advice", status: "open", content: "Tư vấn kế hoạch học tập năm nhất.", handled_by: director.id }, create: { id: ids.services[2], student_id: student.id, type: "academic_advice", status: "open", content: "Tư vấn kế hoạch học tập năm nhất.", handled_by: director.id, created_at: days(-2) } });

  await prisma.audit_logs.upsert({ where: { id: ids.audits[0] }, update: { user_id: manager.id, entity_type: "lead", entity_id: leads[0].id, action: "assign", new_data: { assigneeEmail: telesale.email } }, create: { id: ids.audits[0], user_id: manager.id, entity_type: "lead", entity_id: leads[0].id, action: "assign", new_data: { assigneeEmail: telesale.email }, created_at: days(-7) } });
  await prisma.audit_logs.upsert({ where: { id: ids.audits[1] }, update: { user_id: telesale.id, entity_type: "reminder", entity_id: ids.reminders[0], action: "create", new_data: { title: "Gọi lại xác nhận lịch tư vấn" } }, create: { id: ids.audits[1], user_id: telesale.id, entity_type: "reminder", entity_id: ids.reminders[0], action: "create", new_data: { title: "Gọi lại xác nhận lịch tư vấn" }, created_at: days(-2) } });
  await prisma.audit_logs.upsert({ where: { id: ids.audits[2] }, update: { user_id: director.id, entity_type: "student", entity_id: student.id, action: "create_from_admission", new_data: { studentCode: student.student_code, profileId: profileTwo.id } }, create: { id: ids.audits[2], user_id: director.id, entity_type: "student", entity_id: student.id, action: "create_from_admission", new_data: { studentCode: student.student_code, profileId: profileTwo.id }, created_at: days(-14) } });
  await prisma.tags.upsert({ where: { id: ids.tags[0] }, update: { name: "Quan tâm cao", color: "#DC2626" }, create: { id: ids.tags[0], name: "Quan tâm cao", color: "#DC2626" } });
  await prisma.tags.upsert({ where: { id: ids.tags[1] }, update: { name: "Cần bổ sung hồ sơ", color: "#F59E0B" }, create: { id: ids.tags[1], name: "Cần bổ sung hồ sơ", color: "#F59E0B" } });
  await prisma.entity_tags.upsert({ where: { id: ids.entityTags[0] }, update: { tag_id: ids.tags[0], entity_type: "lead", entity_id: leads[0].id }, create: { id: ids.entityTags[0], tag_id: ids.tags[0], entity_type: "lead", entity_id: leads[0].id } });
  await prisma.entity_tags.upsert({ where: { id: ids.entityTags[1] }, update: { tag_id: ids.tags[1], entity_type: "lead", entity_id: leads[2].id }, create: { id: ids.entityTags[1], tag_id: ids.tags[1], entity_type: "lead", entity_id: leads[2].id } });

  return { profileOne, profileTwo, student };
}

async function seedDemoData() {
  const principals = await seedAccess();
  const business = await seedBusinessData(principals);
  await seedAdmissionAndStudents(principals, business);
  const counts = await Promise.all([
    prisma.leads.count({ where: { lead_code: { startsWith: "DEMO-" } } }),
    prisma.campaigns.count({ where: { id: { in: [...ids.campaigns] } } }),
    prisma.admission_profiles.count({ where: { admission_code: { startsWith: "DEMO-" } } }),
    prisma.students.count({ where: { student_code: { startsWith: "DEMO-" } } }),
    prisma.reminders.count({ where: { id: { in: [...ids.reminders] } } }),
  ]);
  console.log(`Demo data ready: ${counts[0]} leads, ${counts[1]} campaigns, ${counts[2]} admissions, ${counts[3]} students, ${counts[4]} reminders.`);
  console.log("Demo accounts: director@tvu.edu.vn, sale.manager@tvu.edu.vn, telesale@tvu.edu.vn, telesale.2@tvu.edu.vn, marketing@tvu.edu.vn (password: 123456).");
}

seedDemoData()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
