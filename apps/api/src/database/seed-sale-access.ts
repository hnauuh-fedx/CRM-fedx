import { prisma } from "./prisma";

const demoTelesaleEmail = "telesale@tvu.edu.vn";
const saleDepartment = {
  code: "SALE",
  name: "Kinh doanh / Telesale",
};

const roleDefinitions = {
  SALE_MANAGER: {
    name: "Quản lý Sale",
    description: "Quản lý lead và phân công theo phạm vi phòng ban.",
    permissions: [
      { code: "lead.view_department", name: "Xem lead trong phòng ban", module: "lead" },
      { code: "lead.create", name: "Tạo lead", module: "lead" },
      { code: "lead.assign", name: "Phân công lead", module: "lead" },
      { code: "lead.reassign", name: "Chuyển người phụ trách lead", module: "lead" },
      { code: "lead.update_department", name: "Cập nhật lead trong phòng ban", module: "lead" },
      { code: "lead_activity.view_department", name: "Xem hoạt động lead trong phòng ban", module: "lead" },
      { code: "lead_activity.create", name: "Ghi hoạt động chăm sóc lead", module: "lead" },
      { code: "lead_activity.update", name: "Cập nhật hoạt động chăm sóc lead", module: "lead" },
      { code: "lead_note.view_department", name: "Xem ghi chú lead trong phòng ban", module: "lead" },
      { code: "reminder.create", name: "Tạo nhắc việc", module: "lead" },
      { code: "reminder.update", name: "Cập nhật nhắc việc", module: "lead" },
      { code: "reminder.complete", name: "Hoàn tất nhắc việc", module: "lead" },
      { code: "custom_field.view", name: "Xem cấu hình trường dữ liệu", module: "custom_field" },
      { code: "custom_field.create", name: "Tạo trường dữ liệu", module: "custom_field" },
      { code: "custom_field.update", name: "Cập nhật trường dữ liệu", module: "custom_field" },
      { code: "custom_field.archive", name: "Lưu trữ trường dữ liệu", module: "custom_field" },
      { code: "custom_field.manage_options", name: "Quản lý lựa chọn trường dữ liệu", module: "custom_field" },
      { code: "custom_field.manage_groups", name: "Quản lý nhóm trường dữ liệu", module: "custom_field" },
    ],
  },
  TELESALE: {
    name: "Telesale",
    description: "Chăm sóc các lead được phân công.",
    permissions: [
      { code: "lead.view_assigned", name: "Xem lead được phân công", module: "lead" },
      { code: "lead.update_assigned", name: "Cập nhật lead được phân công", module: "lead" },
      { code: "lead_note.create", name: "Thêm ghi chú lead", module: "lead" },
      { code: "lead_activity.create", name: "Ghi hoạt động chăm sóc lead", module: "lead" },
      { code: "lead_activity.update", name: "Cập nhật hoạt động chăm sóc lead", module: "lead" },
      { code: "reminder.create", name: "Tạo nhắc việc", module: "lead" },
      { code: "reminder.update", name: "Cập nhật nhắc việc", module: "lead" },
      { code: "reminder.complete", name: "Hoàn tất nhắc việc", module: "lead" },
      { code: "file.upload", name: "Đính kèm tệp cho lead", module: "lead" },
    ],
  },
} as const;

async function seedSaleAccess() {
  const result = await prisma.$transaction(async (transaction) => {
    const department = await transaction.departments.upsert({
      where: { code: saleDepartment.code },
      update: { name: saleDepartment.name },
      create: saleDepartment,
    });

    let grantedPermissions = 0;
    const permissionCodes: Record<string, string[]> = {};

    for (const [code, definition] of Object.entries(roleDefinitions)) {
      const role = await transaction.roles.upsert({
        where: { code },
        update: { name: definition.name, description: definition.description },
        create: { code, name: definition.name, description: definition.description },
      });
      const permissions = await Promise.all(
        definition.permissions.map((permission) =>
          transaction.permissions.upsert({
            where: { code: permission.code },
            update: { name: permission.name, module: permission.module },
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
      grantedPermissions += grants.count;
      permissionCodes[code] = permissions.map((permission) => permission.code);
    }

    const telesaleRole = await transaction.roles.findUniqueOrThrow({ where: { code: "TELESALE" } });
    const demoTelesale = await transaction.users.findUnique({
      where: { email: demoTelesaleEmail },
      select: { id: true },
    });
    let roleAssignments = 0;
    let departmentAssignments = 0;

    if (demoTelesale) {
      const roles = await transaction.user_roles.createMany({
        data: [{ user_id: demoTelesale.id, role_id: telesaleRole.id }],
        skipDuplicates: true,
      });
      const departments = await transaction.user_departments.createMany({
        data: [{ user_id: demoTelesale.id, department_id: department.id }],
        skipDuplicates: true,
      });
      roleAssignments = roles.count;
      departmentAssignments = departments.count;
    }

    if (grantedPermissions > 0 || roleAssignments > 0 || departmentAssignments > 0) {
      await transaction.audit_logs.create({
        data: {
          entity_type: "role",
          action: "seed_sale_access",
          new_data: {
            departmentCode: saleDepartment.code,
            permissionCodes,
            demoTelesaleAssigned: Boolean(demoTelesale),
          },
        },
      });
    }

    return {
      grantedPermissions,
      roleAssignments,
      departmentAssignments,
      permissionCodes,
      demoTelesaleAssigned: Boolean(demoTelesale),
    };
  });

  console.log(
    `Sale access ready: ${result.grantedPermissions} grant(s), ${result.roleAssignments} role assignment(s), ${result.departmentAssignments} department assignment(s).`,
  );
  console.log(JSON.stringify(result.permissionCodes));
}

seedSaleAccess()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
