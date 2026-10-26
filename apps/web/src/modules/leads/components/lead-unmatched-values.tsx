import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { LeadDetail } from "../lead.types";

const unmatchedHint = "Giá trị nhận từ webhook chưa khớp dữ liệu CRM. Vui lòng chọn lại giá trị phù hợp.";

export function getUnmatchedValue(lead: Pick<LeadDetail, "unmatchedFieldValues">, fieldKey: string) {
  return lead.unmatchedFieldValues?.find((item) => item.fieldKey === fieldKey);
}

/** Raw inbound value marked with "*" so users know it still needs a matching CRM value. */
export function UnmatchedValue({ value }: { value: string }) {
  return (
    <span className="text-amber-700 dark:text-amber-400" title={unmatchedHint}>
      {value}
      <span aria-hidden="true">*</span>
      <span className="sr-only"> (chưa khớp dữ liệu CRM)</span>
    </span>
  );
}

/** Shows the unmatched value of a field when present, otherwise the regular display value. */
export function withUnmatchedValue(lead: Pick<LeadDetail, "unmatchedFieldValues">, fieldKey: string, fallback: ReactNode) {
  const unmatched = getUnmatchedValue(lead, fieldKey);
  return unmatched ? <UnmatchedValue value={unmatched.rawValue} /> : fallback;
}

export function LeadUnmatchedValuesNotice({ lead }: { lead: Pick<LeadDetail, "unmatchedFieldValues"> }) {
  const values = lead.unmatchedFieldValues ?? [];
  if (!values.length) return null;
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Dữ liệu từ webhook chưa khớp ({values.length})</AlertTitle>
      <AlertDescription className="text-amber-900 dark:text-amber-100">
        <p>Các giá trị đánh dấu * chưa khớp danh mục hoặc định dạng của CRM. Cập nhật lại trường tương ứng để xóa dấu *.</p>
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          {values.map((item) => (
            <div key={item.fieldKey} className="contents">
              <dt className="font-medium">{item.label}</dt>
              <dd className="min-w-0 break-words"><UnmatchedValue value={item.rawValue} /></dd>
            </div>
          ))}
        </dl>
      </AlertDescription>
    </Alert>
  );
}
