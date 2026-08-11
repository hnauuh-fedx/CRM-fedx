import { prisma } from "./prisma";

const permissions = [
  { code: "lead.sensitive.view", name: "Xem dữ liệu nhạy cảm của lead", module: "lead" },
  { code: "document.sensitive.view", name: "Xem tệp tài liệu hồ sơ tuyển sinh", module: "admission" },
] as const;

const roleGrants: Record<string, string[]> = {
  DIRECTOR: ["lead.sensitive.view", "document.sensitive.view"],
  SALE_MANAGER: ["lead.sensitive.view"],
  TELESALE: ["lead.sensitive.view"],
  ADMISSION_OFFICER: ["document.sensitive.view"],
};

async function seedSensitivePermissions() {
  const permissionRows = await Promise.all(
    permissions.map((permission) =>
      prisma.permissions.upsert({
        where: { code: permission.code },
        update: { name: permission.name, module: permission.module, is_active: true },
        create: { ...permission, is_active: true },
      }),
    ),
  );
  const permissionByCode = new Map(permissionRows.map((permission) => [permission.code, permission]));
  let grantCount = 0;

  for (const [roleCode, permissionCodes] of Object.entries(roleGrants)) {
    const role = await prisma.roles.findUnique({ where: { code: roleCode }, select: { id: true } });
    if (!role) continue;

    const data = permissionCodes.flatMap((permissionCode) => {
      const permission = permissionByCode.get(permissionCode);
      return permission ? [{ role_id: role.id, permission_id: permission.id }] : [];
    });
    if (data.length === 0) continue;

    const result = await prisma.role_permissions.createMany({ data, skipDuplicates: true });
    grantCount += result.count;
  }

  console.log(`Sensitive permissions ready: ${permissionRows.length} permission(s), ${grantCount} new grant(s).`);
}

seedSensitivePermissions()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
