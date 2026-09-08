import { prisma } from "./prisma";

const confirmationFlag = "--confirm-clear-test-data";

async function getCounts() {
  const [activeLeads, archivedLeads, admissions, students, studentServices] = await Promise.all([
    prisma.leads.count({ where: { deleted_at: null } }),
    prisma.leads.count({ where: { deleted_at: { not: null } } }),
    prisma.admission_profiles.count(),
    prisma.students.count(),
    prisma.student_services.count(),
  ]);
  return { activeLeads, archivedLeads, admissions, students, studentServices };
}

async function clearTestCrmData() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Từ chối dọn dữ liệu khi NODE_ENV=production.");
  }

  const before = await getCounts();
  if (!process.argv.includes(confirmationFlag)) {
    console.log(JSON.stringify({
      dryRun: true,
      before,
      actions: [
        "Xóa " + before.students + " sinh viên; " + before.studentServices + " dịch vụ sinh viên liên quan sẽ bị cascade theo khóa ngoại.",
        "Xóa " + before.admissions + " hồ sơ tuyển sinh.",
        "Soft-delete " + before.activeLeads + " lead đang hoạt động; giữ " + before.archivedLeads + " lead đã lưu trữ và toàn bộ lịch sử Sale.",
      ],
      confirmCommand: "npm run data:clear-test-crm -- " + confirmationFlag,
    }, null, 2));
    return;
  }

  const archivedAt = new Date();
  const result = await prisma.$transaction(async (transaction) => {
    const deletedStudents = await transaction.students.deleteMany();
    const deletedAdmissions = await transaction.admission_profiles.deleteMany();
    const archivedLeads = await transaction.leads.updateMany({
      where: { deleted_at: null },
      data: { deleted_at: archivedAt, updated_at: archivedAt },
    });
    return {
      deletedStudents: deletedStudents.count,
      deletedAdmissions: deletedAdmissions.count,
      archivedLeads: archivedLeads.count,
    };
  });

  const after = await getCounts();
  if (after.activeLeads !== 0 || after.admissions !== 0 || after.students !== 0) {
    throw new Error("Dọn dữ liệu chưa hoàn tất; một trong ba danh sách vẫn còn bản ghi.");
  }

  console.log(JSON.stringify({ cleared: true, before, result, after }, null, 2));
}

clearTestCrmData()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
