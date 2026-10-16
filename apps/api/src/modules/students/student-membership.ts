import type { Prisma } from "../../generated/prisma/client";

// A returned candidate keeps their student record and service history.
export const enrolledStudentWhere: Prisma.studentsWhereInput = {
  OR: [{ status: null }, { status: { not: "candidate" } }],
};

export function studentMembershipWhere(audience?: "candidates" | "students" | "all"): Prisma.leadsWhereInput {
  if (audience === "students") return { students: { is: enrolledStudentWhere } };
  if (audience === "candidates") return { NOT: { students: { is: enrolledStudentWhere } } };
  return {};
}

export function isEnrolledStudent(student?: { status: string | null } | null) {
  return Boolean(student && student.status !== "candidate");
}
