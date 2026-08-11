import { prisma } from "./prisma";

const directorEmail = "director@tvu.edu.vn";
const directorPermissions = [
  { code: "dashboard.view_all", name: "Xem dashboard điều hành", module: "dashboard" },
  { code: "report.view_all", name: "Xem toàn bộ báo cáo", module: "report" },
  { code: "lead.view_all", name: "Xem toàn bộ lead", module: "lead" },
  { code: "lead.sensitive.view", name: "Xem dữ liệu nhạy cảm của lead", module: "lead" },
  { code: "lead.create", name: "Tạo lead", module: "lead" },
  { code: "lead.update_all", name: "Cập nhật toàn bộ lead", module: "lead" },
  { code: "lead.delete", name: "Xóa lead", module: "lead" },
  { code: "lead.assign", name: "Phân công lead", module: "lead" },
  { code: "lead.reassign", name: "Chuyển người phụ trách lead", module: "lead" },
  { code: "lead_note.create", name: "Thêm ghi chú lead", module: "lead" },
  { code: "lead_activity.create", name: "Ghi hoạt động chăm sóc lead", module: "lead" },
  { code: "lead_activity.update", name: "Cập nhật hoạt động chăm sóc lead", module: "lead" },
  { code: "reminder.create", name: "Tạo nhắc việc", module: "lead" },
  { code: "reminder.update", name: "Cập nhật nhắc việc", module: "lead" },
  { code: "reminder.complete", name: "Hoàn tất nhắc việc", module: "lead" },
  { code: "file.upload", name: "Đính kèm tệp cho lead", module: "lead" },
  { code: "campaign.view_all", name: "Xem toàn bộ chiến dịch", module: "marketing" },
  { code: "campaign.create", name: "Tạo chiến dịch", module: "marketing" },
  { code: "campaign.update", name: "Cập nhật toàn bộ chiến dịch", module: "marketing" },
  { code: "campaign.delete", name: "Xóa chiến dịch", module: "marketing" },
  { code: "marketing_form.manage", name: "Quản lý biểu mẫu Marketing", module: "marketing" },
  { code: "admission.view_all", name: "Xem toàn bộ hồ sơ tuyển sinh", module: "admission" },
  { code: "admission.view", name: "Xem hồ sơ tuyển sinh", module: "admission" },
  { code: "admission.update", name: "Cập nhật hồ sơ tuyển sinh", module: "admission" },
  { code: "admission.approve", name: "Duyệt hồ sơ tuyển sinh", module: "admission" },
  { code: "admission_status.update", name: "Chuyển trạng thái hồ sơ tuyển sinh", module: "admission" },
  { code: "admission_document.view", name: "Xem tài liệu hồ sơ tuyển sinh", module: "admission" },
  { code: "document.sensitive.view", name: "Xem tệp tài liệu hồ sơ tuyển sinh", module: "admission" },
  { code: "admission_document.upload", name: "Upload và cập nhật tài liệu hồ sơ tuyển sinh", module: "admission" },
  { code: "student.create_from_admission", name: "Chuyển hồ sơ tuyển sinh sang sinh viên", module: "student" },
  { code: "admission_major.manage", name: "Quản lý ngành theo chương trình", module: "admission" },
  { code: "institution_program.manage", name: "Quản lý chương trình tuyển sinh", module: "admission" },
  { code: "student.view_all", name: "Xem toàn bộ sinh viên", module: "student" },
  { code: "student.update_all", name: "Cập nhật toàn bộ sinh viên", module: "student" },
  { code: "student_service.view", name: "Xem dịch vụ sinh viên", module: "student" },
  { code: "student_service.create", name: "Tạo yêu cầu dịch vụ sinh viên", module: "student" },
  { code: "student_service.update", name: "Cập nhật dịch vụ sinh viên", module: "student" },
  { code: "user.manage", name: "Quản lý người dùng", module: "system" },
  { code: "role.manage", name: "Quản lý vai trò và scope truy cập", module: "system" },
  { code: "permission.manage", name: "Quản lý danh mục quyền", module: "system" },
  { code: "department.manage", name: "Quản lý phòng ban", module: "system" },
  { code: "pipeline.manage", name: "Quản lý pipeline", module: "system" },
  { code: "automation.manage", name: "Quản lý Rule Automation", module: "system" },
  { code: "system.manage", name: "Quản lý cấu hình hệ thống", module: "system" },
  { code: "audit.view", name: "Xem audit log", module: "system" },
  { code: "custom_field.view", name: "Xem cấu hình trường dữ liệu", module: "custom_field" },
  { code: "custom_field.create", name: "Tạo trường dữ liệu", module: "custom_field" },
  { code: "custom_field.update", name: "Cập nhật trường dữ liệu", module: "custom_field" },
  { code: "custom_field.archive", name: "Lưu trữ trường dữ liệu", module: "custom_field" },
  { code: "custom_field.manage_options", name: "Quản lý lựa chọn trường dữ liệu", module: "custom_field" },
  { code: "custom_field.view_sensitive", name: "Xem cấu hình trường nhạy cảm", module: "custom_field" },
  { code: "custom_field.edit_sensitive", name: "Chỉnh sửa cấu hình trường nhạy cảm", module: "custom_field" },
] as const;

async function seedDirectorAccess() {
  const result = await prisma.$transaction(async (transaction) => {
    const role = await transaction.roles.upsert({
      where: { code: "DIRECTOR" },
      update: {},
      create: {
        code: "DIRECTOR",
        name: "Giám đốc",
        description: "Quyền xem tổng quan nghiệp vụ và báo cáo toàn hệ thống.",
      },
    });
    const user = await transaction.users.findUnique({
      where: { email: directorEmail },
      select: { id: true },
    });

    if (!user) {
      throw new Error(`Không tìm thấy tài khoản demo ${directorEmail}.`);
    }

    const permissions = await Promise.all(
      directorPermissions.map((permission) =>
        transaction.permissions.upsert({
          where: { code: permission.code },
          update: {
            name: permission.name,
            module: permission.module,
          },
          create: permission,
        }),
      ),
    );
    const grants = await transaction.role_permissions.createMany({
      data: permissions.map((permission) => ({
        role_id: role.id,
        permission_id: permission.id,
      })),
      skipDuplicates: true,
    });
    const assignments = await transaction.user_roles.createMany({
      data: [{ user_id: user.id, role_id: role.id }],
      skipDuplicates: true,
    });

    if (grants.count > 0 || assignments.count > 0) {
      await transaction.audit_logs.create({
        data: {
          entity_type: "role",
          entity_id: role.id,
          action: "seed_director_access",
          new_data: {
            permissionCodes: directorPermissions.map((permission) => permission.code),
            userEmail: directorEmail,
          },
        },
      });
    }

    return {
      createdGrants: grants.count,
      createdAssignments: assignments.count,
      permissions: directorPermissions.map((permission) => permission.code),
    };
  });

  console.log(
    `Director access ready: ${result.createdGrants} grant(s), ${result.createdAssignments} user assignment(s).`,
  );
}

seedDirectorAccess()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
