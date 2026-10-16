import { leadDisplayFields } from "@admission-crm/shared/display-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { LeadListItem } from "@/modules/leads/lead.types";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}
const dateFields = new Set(['cccdIssueDate', 'decisionSignedDate']);
const leadInformationFields = leadDisplayFields.slice(9).map(field => ({
  key: field.key as keyof LeadListItem, label: field.label,
  format: dateFields.has(field.key) ? formatDate : undefined,
}));
function getLeadWorkflowLabel(lead: LeadListItem) {
  return lead.pipelineStage?.name ?? "Chưa chọn tiến trình";
}
function TableValue({ value }: { value: unknown }) {
  const text = typeof value === "string" && value.trim() ? value : "-";
  return (
    <span
      className="block max-w-56 truncate"
      title={text === "-" ? undefined : text}
    >
      {text}
    </span>
  );
}
export function useLeadListColumns(detailBasePath: string) {
  return useMemo<ColumnDef<LeadListItem>[]>(
    () => [
      {
        id: "select",
        size: 48,
        minSize: 48,
        maxSize: 48,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(Boolean(checked))
            }
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label="Chọn tất cả lead trên trang này"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label={`Chọn lead ${row.original.fullName}`}
          />
        ),
        enableSorting: false,
      },
      {
        id: "view",
        size: 56,
        minSize: 56,
        maxSize: 56,
        header: () => <span className="sr-only">Xem chi tiết</span>,
        cell: ({ row }) => (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
          >
            <Link
              to={`${detailBasePath}/${row.original.id}`}
              aria-label={`Xem chi tiết ${row.original.fullName}`}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Eye aria-hidden="true" />
            </Link>
          </Button>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "fullName",
        header: "Họ và tên",
        cell: ({ row }) => (
          <div className="min-w-0 truncate" title={row.original.fullName}>
            <span className="font-medium">{row.original.fullName}</span>
          </div>
        ),
      },
      {
        accessorKey: "phone",
        header: "Số điện thoại",
        enableSorting: false,
        cell: ({ row }) => <TableValue value={row.original.phone} />,
      },
      {
        id: "pipelineStage",
        header: "Quy trình Telesale",
        cell: ({ row }) => (
          <Badge variant="secondary">
            {getLeadWorkflowLabel(row.original)}
          </Badge>
        ),
      },
      {
        id: "origin",
        header: "Nhóm nguồn",
        enableSorting: false,
        cell: ({ row }) => row.original.origin?.name ?? "-",
      },
      {
        id: "source",
        header: "Nguồn học viên",
        enableSorting: false,
        cell: ({ row }) => row.original.source?.name ?? "-",
      },
      {
        id: "assignee",
        header: "Nhân viên sale",
        enableSorting: false,
        cell: ({ row }) => (
          <TableValue value={row.original.assignee?.fullName} />
        ),
      },
      {
        accessorKey: "gender",
        header: "Giới tính",
        enableSorting: false,
        cell: ({ row }) => <TableValue value={row.original.gender} />,
      },
      {
        accessorKey: "dateOfBirth",
        header: "Ngày sinh",
        enableSorting: false,
        cell: ({ row }) => (
          <TableValue value={formatDate(row.original.dateOfBirth)} />
        ),
      },
      {
        accessorKey: "majorName",
        header: "Ngành đăng ký",
        enableSorting: false,
        cell: ({ row }) => <TableValue value={row.original.majorName} />,
      },
      ...leadInformationFields.map(({ key, label, format }) => ({
        id: key,
        header: label,
        enableSorting: false,
        cell: ({ row }: { row: { original: LeadListItem } }) => (
          <TableValue
            value={
              format
                ? format((row.original[key] as string | null) ?? null)
                : row.original[key]
            }
          />
        ),
      })),
    ],
    [detailBasePath],
  );
}
