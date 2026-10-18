import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Check, Copy } from "lucide-react";
import { isStandardLeadPhone } from "@admission-crm/shared/lead-phone";

import { cn } from "@/lib/utils";
import { HoverMorePopover, stopRowEvent } from "./hover-more-popover";

const COPIED_FEEDBACK_MS = 1500;
const nonStandardPhoneHint = "Số điện thoại chưa đúng định dạng (10 chữ số, bắt đầu bằng 0)";

export function nonStandardPhoneClass(phone: string | null | undefined) {
  return phone?.trim() && !isStandardLeadPhone(phone) ? "text-purple-600 dark:text-purple-400" : undefined;
}

export function getLeadPhones(lead: { phone: string | null; secondaryPhones?: string[] | null }) {
  return [lead.phone, ...(lead.secondaryPhones ?? [])].filter((phone): phone is string => Boolean(phone?.trim()));
}

export function CopyPhoneButton({ phone, className }: { phone: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async (event: SyntheticEvent) => {
    event.stopPropagation();
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  };

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={copy}
      onKeyDown={stopRowEvent}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        copied && "text-primary",
        className,
      )}
      aria-label={copied ? `Đã sao chép số ${phone}` : `Sao chép số điện thoại ${phone}`}
      title={copied ? "Đã sao chép" : "Sao chép số điện thoại"}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}

export function PhoneWithCopy({ phone, className }: { phone: string; className?: string }) {
  const nonStandardClass = nonStandardPhoneClass(phone);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span className={cn("truncate tabular-nums", nonStandardClass)} title={nonStandardClass ? nonStandardPhoneHint : undefined}>
        {phone}
      </span>
      <CopyPhoneButton phone={phone} />
    </span>
  );
}

/** Table cell: first number, then a "+N" badge that reveals the remaining numbers on hover. */
export function LeadPhoneCell({ lead }: { lead: { phone: string | null; secondaryPhones?: string[] | null } }) {
  const [primary, ...others] = getLeadPhones(lead);
  if (!primary) return <span>-</span>;
  return (
    <span className="inline-flex max-w-64 items-center gap-1.5">
      <PhoneWithCopy phone={primary} />
      {others.length > 0 && (
        <HoverMorePopover count={others.length} label={`Xem thêm ${others.length} số điện thoại khác`} title="Số điện thoại khác">
          {others.map((phone) => (
            <li key={phone} className="px-1 text-sm font-medium">
              <PhoneWithCopy phone={phone} />
            </li>
          ))}
        </HoverMorePopover>
      )}
    </span>
  );
}

/** Detail view: every number on its own row. */
export function LeadPhoneLines({ lead, emptyLabel = "Chưa cập nhật" }: { lead: { phone: string | null; secondaryPhones?: string[] | null }; emptyLabel?: string }) {
  const phones = getLeadPhones(lead);
  if (!phones.length) return <span>{emptyLabel}</span>;
  return (
    <span className="flex flex-col gap-1">
      {phones.map((phone) => <PhoneWithCopy key={phone} phone={phone} />)}
    </span>
  );
}
