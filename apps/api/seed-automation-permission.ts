import { prisma } from "./src/database/prisma";


async function main() {
  // Add permission
  const permission = await prisma.permissions.upsert({
    where: { code: "automation.manage" },
    update: {
      name: "Quản lý Automation",
      description: "Tạo, sửa, xoá và cấu hình các Rule Automation",
      module: "System",
    },
    create: {
      code: "automation.manage",
      name: "Quản lý Automation",
      description: "Tạo, sửa, xoá và cấu hình các Rule Automation",
      module: "System",
    },
  });
  console.log("Permission ensured:", permission.id);

  const roles = await prisma.roles.findMany();

  for (const role of roles) {
    // try adding permission to role
    try {
      await prisma.role_permissions.create({
        data: {
          role_id: role.id,
          permission_id: permission.id,
        }
      });
      console.log("Added to role:", role.code);
    } catch (e) {
      console.log("Already in role:", role.code);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
