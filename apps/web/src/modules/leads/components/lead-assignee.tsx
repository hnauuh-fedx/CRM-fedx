import { ArrowUpDown, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HoverMorePopover } from "./hover-more-popover";

type AssigneeRef = { id: string; fullName: string } | null | undefined;
type LeadAssignees = { assignee: AssigneeRef; secondaryAssignee?: AssigneeRef };

const EMPTY_VALUE = "__empty__";

/** Table cell: main assignee, then a "+1" badge revealing the secondary assignee on hover. */
export function LeadAssigneeCell({ lead }: { lead: LeadAssignees }) {
  const main = lead.assignee ?? lead.secondaryAssignee;
  const secondary = lead.assignee ? lead.secondaryAssignee : null;
  if (!main) return <span>-</span>;
  return (
    <span className="inline-flex max-w-64 items-center gap-1.5">
      <span className="truncate" title={main.fullName}>{main.fullName}</span>
      {secondary && (
        <HoverMorePopover count={1} label={`Xem nhân viên phụ: ${secondary.fullName}`} title="Nhân viên phụ">
          <li className="px-1 text-sm font-medium">{secondary.fullName}</li>
        </HoverMorePopover>
      )}
    </span>
  );
}

/** Detail view: main assignee (marked with a star) and secondary assignee on separate rows. */
export function LeadAssigneeLines({ lead, emptyLabel = "Chưa phân công" }: { lead: LeadAssignees; emptyLabel?: string }) {
  const main = lead.assignee ?? lead.secondaryAssignee;
  const secondary = lead.assignee ? lead.secondaryAssignee : null;
  if (!main) return <span>{emptyLabel}</span>;
  return (
    <span className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-1">
        {main.fullName}
        <Star className="size-3.5 fill-amber-400 text-amber-400" role="img" aria-label="Nhân viên chính" />
      </span>
      {secondary && <span>{secondary.fullName}</span>}
    </span>
  );
}

/** Mirrors the server rule: without a main assignee the secondary one is promoted, never both the same person. */
export function normalizeAssigneeSelection(primaryId: string, secondaryId: string) {
  if (!primaryId && secondaryId) return { primaryId: secondaryId, secondaryId: "" };
  return { primaryId, secondaryId: secondaryId === primaryId ? "" : secondaryId };
}

export function LeadAssigneeSelects({
  idPrefix,
  primaryId,
  secondaryId,
  options,
  onChange,
  autoFocus = false,
}: {
  idPrefix: string;
  primaryId: string;
  secondaryId: string;
  options: Array<{ id: string; fullName: string }>;
  onChange: (value: { primaryId: string; secondaryId: string }) => void;
  autoFocus?: boolean;
}) {
  const change = (nextPrimary: string, nextSecondary: string) => onChange(normalizeAssigneeSelection(nextPrimary, nextSecondary));
  const toValue = (value: string) => (value === EMPTY_VALUE ? "" : value);
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-primary`} className="inline-flex items-center gap-1">
          Nhân viên chính
          <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
        </FieldLabel>
        <Select value={primaryId || EMPTY_VALUE} onValueChange={(value) => change(toValue(value), secondaryId)}>
          <SelectTrigger id={`${idPrefix}-primary`} className="w-full" autoFocus={autoFocus}><SelectValue placeholder="Chọn nhân viên chính" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={EMPTY_VALUE}>Chưa phân công</SelectItem>
              {options.map((user) => <SelectItem key={user.id} value={user.id}>{user.fullName}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor={`${idPrefix}-secondary`}>Nhân viên phụ</FieldLabel>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={!primaryId || !secondaryId}
            onClick={() => change(secondaryId, primaryId)}
          >
            <ArrowUpDown aria-hidden="true" />
            Đổi chính/phụ
          </Button>
        </div>
        <Select value={secondaryId || EMPTY_VALUE} onValueChange={(value) => change(primaryId, toValue(value))}>
          <SelectTrigger id={`${idPrefix}-secondary`} className="w-full"><SelectValue placeholder="Chọn nhân viên phụ" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={EMPTY_VALUE}>Không có nhân viên phụ</SelectItem>
              {options.filter((user) => user.id !== primaryId).map((user) => <SelectItem key={user.id} value={user.id}>{user.fullName}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}
