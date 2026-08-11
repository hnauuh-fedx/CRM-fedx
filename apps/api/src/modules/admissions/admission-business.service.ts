import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";

type ListQuery<TSort extends string> = {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  type?: string;
  institutionProgramId?: string;
  sortBy: TSort;
  sortOrder: "asc" | "desc";
};

const toIso = (value?: Date | null) => value?.toISOString() ?? null;
const toMoney = (value: unknown) => (value == null ? null : String(value));
const documentSensitivePermissions = new Set([
  "document.sensitive.view",
  "admission_document.upload",
  "admission.approve",
]);

function canViewDocumentSensitiveData(user: AuthUser) {
  return user.permissions.some((permission) => documentSensitivePermissions.has(permission));
}

export async function listAdmissionDocuments(
  user: AuthUser,
  query: ListQuery<"uploadedAt" | "documentType" | "status">,
) {
  const canViewSensitive = canViewDocumentSensitiveData(user);
  const where = {
    AND: [
      ...(query.search
        ? [
            {
              OR: [
                { document_type: { contains: query.search, mode: "insensitive" as const } },
                { leads: { is: { full_name: { contains: query.search, mode: "insensitive" as const } } } },
                {
                  leads: {
                    is: {
                      admission_profiles: {
                        is: { admission_code: { contains: query.search, mode: "insensitive" as const } },
                      },
                    },
                  },
                },
              ],
            },
          ]
        : []),
      ...(query.status ? [{ status: query.status }] : []),
      ...(query.type ? [{ document_type: query.type }] : []),
      ...(query.institutionProgramId
        ? [{ leads: { is: { admission_profiles: { is: { institution_program_id: query.institutionProgramId } } } } }]
        : []),
    ],
  };
  const sortFields = {
    uploadedAt: "uploaded_at",
    documentType: "document_type",
    status: "status",
  } as const;
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.admission_documents.findMany({
      where,
      select: {
        id: true,
        document_type: true,
        status: true,
        uploaded_at: true,
        files: { select: { file_name: true, file_url: true, mime_type: true, file_size: true } },
        leads: {
          select: {
            full_name: true,
            lead_code: true,
            admission_profiles: { select: { admission_code: true } },
          },
        },
      },
      orderBy: [{ [sortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip,
      take: query.limit,
    }),
    prisma.admission_documents.count({ where }),
  ]);

  return {
    data: items.map((item) => ({
      id: item.id,
      candidateName: item.leads?.full_name ?? null,
      leadCode: item.leads?.lead_code ?? null,
      admissionCode: item.leads?.admission_profiles?.admission_code ?? null,
      documentType: item.document_type,
      status: item.status,
      fileName: canViewSensitive ? item.files?.file_name ?? null : null,
      fileUrl: canViewSensitive ? item.files?.file_url ?? null : null,
      mimeType: canViewSensitive ? item.files?.mime_type ?? null : null,
      fileSize: canViewSensitive && item.files?.file_size != null ? String(item.files.file_size) : null,
      uploadedAt: toIso(item.uploaded_at),
    })),
    pagination: getPagination(query.page, query.limit, total),
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
  };
}

export async function getAdmissionDocumentOptions() {
  const [statuses, types] = await prisma.$transaction([
    prisma.admission_documents.findMany({ select: { status: true }, distinct: ["status"], take: 100 }),
    prisma.admission_documents.findMany({
      select: { document_type: true },
      distinct: ["document_type"],
      orderBy: { document_type: "asc" },
      take: 200,
    }),
  ]);

  return {
    statuses: statuses.flatMap((item) => (item.status ? [item.status] : [])).sort(),
    types: types.map((item) => item.document_type),
  };
}

export async function listAdmissionStatuses(query: ListQuery<"createdAt" | "name" | "code">) {
  const where = query.search
    ? {
        OR: [
          { name: { contains: query.search, mode: "insensitive" as const } },
          { code: { contains: query.search, mode: "insensitive" as const } },
        ],
      }
    : {};
  const sortFields = { createdAt: "created_at", name: "name", code: "code" } as const;
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.admission_statuses.findMany({
      where,
      select: {
        id: true,
        name: true,
        code: true,
        color: true,
        created_at: true,
        _count: { select: { admission_profiles: true } },
      },
      orderBy: [{ [sortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip,
      take: query.limit,
    }),
    prisma.admission_statuses.count({ where }),
  ]);

  return {
    data: items.map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code,
      color: item.color,
      profileCount: item._count.admission_profiles,
      createdAt: toIso(item.created_at),
    })),
    pagination: getPagination(query.page, query.limit, total),
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
  };
}

export async function listAdmissionFees(
  query: ListQuery<"createdAt" | "admissionCode" | "monthlyRevenue" | "feeStatus" | "tuitionStatus">,
) {
  const where = {
    AND: [
      ...(query.search
        ? [
            {
              OR: [
                { admission_code: { contains: query.search, mode: "insensitive" as const } },
                { fee_status: { contains: query.search, mode: "insensitive" as const } },
                { tuition_status: { contains: query.search, mode: "insensitive" as const } },
                { leads: { is: { full_name: { contains: query.search, mode: "insensitive" as const } } } },
              ],
            },
          ]
        : []),
      ...(query.status ? [{ OR: [{ fee_status: query.status }, { tuition_status: query.status }] }] : []),
      ...(query.institutionProgramId ? [{ institution_program_id: query.institutionProgramId }] : []),
    ],
  };
  const sortFields = {
    createdAt: "created_at",
    admissionCode: "admission_code",
    monthlyRevenue: "monthly_revenue",
    feeStatus: "fee_status",
    tuitionStatus: "tuition_status",
  } as const;
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.admission_profiles.findMany({
      where,
      select: {
        id: true,
        admission_code: true,
        fee_status: true,
        tuition_status: true,
        monthly_revenue: true,
        lead_id: true,
        institution_program_id: true,
        created_at: true,
        leads: { select: { full_name: true, lead_code: true } },
        majors: { select: { name: true, faculties: { select: { name: true } } } },
      },
      orderBy: [{ [sortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip,
      take: query.limit,
    }),
    prisma.admission_profiles.count({ where }),
  ]);

  return {
    data: items.map((item) => ({
      id: item.id,
      admissionCode: item.admission_code,
      leadId: item.lead_id,
      institutionProgramId: item.institution_program_id,
      candidateName: item.leads?.full_name ?? null,
      leadCode: item.leads?.lead_code ?? null,
      majorName: item.majors?.name ?? null,
      facultyName: item.majors?.faculties?.name ?? null,
      feeStatus: item.fee_status,
      tuitionStatus: item.tuition_status,
      monthlyRevenue: toMoney(item.monthly_revenue),
      createdAt: toIso(item.created_at),
    })),
    pagination: getPagination(query.page, query.limit, total),
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
  };
}

export async function getAdmissionFeeOptions() {
  const [feeStatuses, tuitionStatuses] = await prisma.$transaction([
    prisma.admission_profiles.findMany({ select: { fee_status: true }, distinct: ["fee_status"], take: 100 }),
    prisma.admission_profiles.findMany({
      select: { tuition_status: true },
      distinct: ["tuition_status"],
      take: 100,
    }),
  ]);

  return {
    statuses: Array.from(
      new Set([
        ...feeStatuses.flatMap((item) => (item.fee_status ? [item.fee_status] : [])),
        ...tuitionStatuses.flatMap((item) => (item.tuition_status ? [item.tuition_status] : [])),
      ]),
    ).sort(),
  };
}

function getPagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
