import { LeadPhoneLines } from "./lead-phone";
import { LeadAssigneeLines } from "./lead-assignee";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDisplayFields,
  normalizeVisibleFields,
} from "@admission-crm/shared/display-layout";
import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import { updateLead, updateLeadCustomFields } from "@/services/lead.service";
import { toLeadFormOptions, toLeadFormValues } from "../lead-form.helpers";
import type {
  LeadDetail,
  LeadActionOptions,
  LeadFormInput,
} from "../lead.types";
import { LeadForm } from "./lead-form";
import { useLeadSurfaceLayout } from "./use-lead-surface-layout";

type Props = {
  lead: LeadDetail;
  enabled: boolean;
  children: ReactNode;
  onEdit?: () => void;
  canUpdate?: boolean;
  options?: LeadActionOptions;
};
export function LeadDetailLayout({
  lead,
  enabled,
  children,
  onEdit,
  canUpdate,
  options,
}: Props) {
  const layout = useLeadSurfaceLayout(
    "LEAD_DETAIL",
    enabled,
    lead.institutionProgramId ?? undefined,
  );
  const [editing, setEditing] = useState(false);
  if (!enabled) return children;
  if (layout.isLoading) return <Skeleton className="h-72 w-full" />;
  if (layout.isError)
    return (
      <>
        <p role="status" className="text-sm text-muted-foreground">
          Chưa tải được mẫu hiển thị. Đang dùng giao diện mặc định.
        </p>
        {children}
      </>
    );
  if (!layout.data?.baseTemplateId) return children;
  if (editing)
    return (
      <ConfiguredInlineLeadEditor
        lead={lead}
        options={options}
        onCancel={() => setEditing(false)}
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin ứng viên</CardTitle>
        <CardDescription>{layout.data.name}</CardDescription>
        {canUpdate && (
          <Button
            type="button"
            variant="outline"
            onClick={onEdit ?? (() => setEditing(true))}
          >
            Chỉnh sửa thông tin
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <LeadDetailFields lead={lead} visible={layout.data.visibleFields} />
      </CardContent>
    </Card>
  );
}

const dates = new Set(
  leadFormFieldCatalog
    .flatMap((group) => group.fields)
    .filter((field) => field.dataType === "DATE")
    .map((field) => field.key),
);
function LeadDetailFields({
  lead,
  visible,
}: {
  lead: LeadDetail;
  visible: string[];
}) {
  const fields = getDisplayFields("LEAD_DETAIL");
  const labels = new Map(fields.map((field) => [field.key, field.label]));
  const values = toLeadFormValues(lead);
  const named: Record<string, string | null | undefined> = {
    sourceId: lead.source?.name,
    assigneeId: lead.assignee?.fullName,
    pipelineStageId: lead.pipelineStage?.name,
    majorId: lead.majorName,
    admissionStatusId: lead.admissionStatusName,
    institutionProgramId: lead.institutionProgram
      ? `${lead.institutionProgram.institutionName} - ${lead.institutionProgram.name}`
      : undefined,
    gender: (
      { male: "Nam", female: "Nữ", other: "Khác" } as Record<string, string>
    )[lead.gender ?? ""],
  };
  function value(key: string) {
    const raw = key in named ? named[key] : values[key as keyof LeadFormInput];
    if (!raw || typeof raw !== "string") return "Chưa có thông tin";
    if (dates.has(key) && !Number.isNaN(Date.parse(raw)))
      return new Date(raw).toLocaleDateString("vi-VN");
    return raw;
  }
  return (
    <dl
      className="grid min-w-0 gap-4 sm:grid-cols-2"
      data-testid="configured-lead-detail"
    >
      {normalizeVisibleFields(visible, fields).map((key) => (
        <div key={key} className="min-w-0" data-layout-field={key}>
          <dt className="text-sm text-muted-foreground">{labels.get(key)}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">
            {key === "phone" ? <LeadPhoneLines lead={lead} /> : key === "assigneeId" ? <LeadAssigneeLines lead={lead} /> : value(key)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ConfiguredInlineLeadEditor({
  lead,
  options,
  onCancel,
}: {
  lead: LeadDetail;
  options?: LeadActionOptions;
  onCancel: () => void;
}) {
  const auth = useAuth();
  const defaultValues = useMemo(() => toLeadFormValues(lead), [lead]);
  const formOptions = useMemo(
    () => toLeadFormOptions(lead, options),
    [lead, options],
  );
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: LeadFormInput) => {
      await updateLead(lead.id, input, auth.accessToken!);
      const values = Object.entries(input.customFieldValues).map(
        ([fieldId, value]) => ({ fieldId, value }),
      );
      if (values.length)
        await updateLeadCustomFields(lead.id, { values }, auth.accessToken!);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["leads"] });
      void client.invalidateQueries({ queryKey: ["sale"] });
      onCancel();
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chỉnh sửa thông tin</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mutation.error && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
        <LeadForm
          useDisplayLayout
          leadId={lead.id}
          defaultValues={defaultValues}
          options={formOptions}
          isPending={mutation.isPending}
          submitLabel="Lưu thay đổi"
          onSubmit={(input) => mutation.mutate(input)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending}
          onClick={onCancel}
        >
          Hủy chỉnh sửa
        </Button>
      </CardContent>
    </Card>
  );
}
