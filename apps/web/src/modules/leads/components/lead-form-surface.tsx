import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { EffectiveLayout } from "@admission-crm/shared/display-layout";
import { ConfiguredLeadFormFields } from "./configured-lead-form-fields";
import type { ComponentProps } from "react";

type Props = Omit<
  ComponentProps<typeof ConfiguredLeadFormFields>,
  "visible"
> & {
  layout: UseQueryResult<EffectiveLayout, Error>;
  enabled: boolean;
  children: ReactNode;
  customFields: ReactNode;
  transitionError: Error | null;
  customFieldError: boolean;
};
export function LeadFormSurface({
  layout,
  enabled,
  children,
  customFields,
  transitionError,
  customFieldError,
  ...props
}: Props) {
  if (!enabled) return children;
  if (layout.isLoading) return <p role="status">Đang tải bố cục biểu mẫu…</p>;
  if (layout.isError)
    return (
      <>
        <p role="status" className="text-sm text-muted-foreground">
          Chưa tải được mẫu hiển thị. Đang dùng biểu mẫu mặc định.
        </p>
        {children}
      </>
    );
  if (!layout.data?.baseTemplateId) return children;
  return (
    <>
      <p className="text-sm text-muted-foreground" role="status">
        {layout.data.name}. Trường bắt buộc và trường có lỗi luôn được hiển thị.
      </p>
      <ConfiguredLeadFormFields
        {...props}
        visible={layout.data.visibleFields}
      />
      {transitionError && (
        <p role="alert" className="text-sm text-destructive">
          {transitionError.message}
        </p>
      )}
      {customFieldError && (
        <p role="alert" className="text-sm text-destructive">
          Không thể tải trường dữ liệu bổ sung. Vui lòng thử lại.
        </p>
      )}
      {customFields}
    </>
  );
}
