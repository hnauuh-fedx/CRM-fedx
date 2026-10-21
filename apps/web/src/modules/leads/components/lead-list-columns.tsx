import { LeadPhoneCell } from "./lead-phone";
import { LeadAssigneeCell } from "./lead-assignee";
import { getLatestLeadNoteText } from "../lead-note.helpers";
import { getReadableTextColor, normalizeHexColor } from "../lead-stage-color.helpers";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
function getLeadWorkflowLabel(lead: LeadListItem) {
  if (lead.lifecycleStatus.value === "FAIL") return lead.lifecycleStatus.label;
  return lead.pipelineStage?.name ?? "Chưa chọn tiến trình";
}
// Columns size to their longest value; only the multi-line note keeps a short ellipsis.
function TableValue({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const text = typeof value === "string" && value.trim() ? value : "-";
  return (
    <span
      className={compact ? "block max-w-56 truncate" : "block max-w-150 truncate"}
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
      ...leadDisplayFields.map((field) => dataColumns[field.key] ?? informationColumn(field.key as keyof LeadListItem, field.label)),
    ],
    [detailBasePath],
  );
}

// Columns with a dedicated cell; other display fields use informationColumn. Order follows leadDisplayFields.
const dataColumns: Record<string, ColumnDef<LeadListItem>> = Object.fromEntries(
  ([
      {
        accessorKey: "fullName",
        header: "Họ và tên",
        cell: ({ row }) => (
          <div className="max-w-150 truncate" title={row.original.fullName}>
            <span className="font-medium">{row.original.fullName}</span>
          </div>
        ),
      },
      {
        accessorKey: "phone",
        header: "Số điện thoại",
        enableSorting: false,
        cell: ({ row }) => <LeadPhoneCell lead={row.original} />,
      },
      {
        id: "pipelineStage",
        header: "Quy trình Telesale",
        cell: ({ row }) => (
          <LeadWorkflowCell lead={row.original} />
        ),
      },
      {
        id: "origin",
        header: "Nhóm nguồn",
        enableSorting: false,
        cell: ({ row }) => <TableValue value={row.original.origin?.name} />,
      },
      {
        id: "source",
        header: "Nguồn học viên",
        enableSorting: false,
        cell: ({ row }) => <TableValue value={row.original.source?.name} />,
      },
      {
        id: "assignee",
        header: "Nhân viên sale",
        enableSorting: false,
        cell: ({ row }) => (
          <LeadAssigneeCell lead={row.original} />
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
  ] satisfies ColumnDef<LeadListItem>[]).map((column) => [
    "accessorKey" in column ? String(column.accessorKey) : column.id!,
    column,
  ]),
);

function informationColumn(key: keyof LeadListItem, label: string): ColumnDef<LeadListItem> {
  const format = dateFields.has(key) ? formatDate : undefined;
  return {
    id: key,
    header: label,
    enableSorting: false,
    cell: ({ row }) => (
      <TableValue
        compact={key === "note"}
        value={
          key === "note" ? getLatestLeadNoteText(row.original.latestNote ?? row.original.note) : format
            ? format((row.original[key] as string | null) ?? null)
            : row.original[key]
        }
      />
    ),
  };
}

function LeadWorkflowCell({ lead }: { lead: LeadListItem }) {
  const note = getLatestLeadNoteText(lead.latestNote ?? lead.note);
  const stageColor = lead.pipelineStage?.color ? normalizeHexColor(lead.pipelineStage.color, "") : "";
  const isFailed = lead.lifecycleStatus.value === "FAIL";
  return (
    <div className="flex min-w-48 max-w-72 flex-col items-start gap-1.5">
      <Badge
        variant={isFailed ? "destructive" : "secondary"}
        style={!isFailed && stageColor ? { backgroundColor: stageColor, borderColor: stageColor, color: getReadableTextColor(stageColor) } : undefined}
      >
        {getLeadWorkflowLabel(lead)}
      </Badge>
      {note && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                className="line-clamp-1 max-w-full cursor-default whitespace-pre-line break-words text-sm text-muted-foreground"
                tabIndex={0}
              >
                {note}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-80 whitespace-pre-line text-pretty">
              {note}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
