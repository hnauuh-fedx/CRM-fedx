import type { UseQueryResult } from "@tanstack/react-query";
import type {
  EffectiveLayout,
  ListLayoutScreen,
} from "@admission-crm/shared/display-layout";
import { Button } from "@/components/ui/button";
import { ListDisplayLayoutDialog } from "./list-display-layout-dialog";
import { PersonalDisplayLayoutDialog } from "./personal-display-layout-dialog";
const sourceLabels = {
  USER: "Mẫu riêng của bạn",
  DEPARTMENT: "Kế thừa từ phòng ban",
  DEFAULT: "Mẫu chung",
  SYSTEM: "Mặc định hệ thống",
};
export function LeadDisplayLayoutStatus({
  enabled,
  query,
  screen = "LEAD_LIST",
}: {
  enabled: boolean;
  screen?: ListLayoutScreen;
  query: UseQueryResult<EffectiveLayout, Error>;
}) {
  if (!enabled) return null;
  return (
    <div className="-my-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <LayoutStatus query={query} />
      {query.data?.personalized && <span>Đang dùng tùy chỉnh cá nhân.</span>}
      {query.data?.personalizationStale && (
        <span role="status">
          Mẫu quản lý đã thay đổi; đang dùng lại mẫu quản lý. Bạn có thể thiết
          lập lại giao diện cá nhân nếu được cho phép.
        </span>
      )}
      {query.data && (
        <PersonalDisplayLayoutDialog layout={query.data} screen={screen} />
      )}
      {query.data?.ambiguousDepartment && (
        <span>
          Bạn thuộc nhiều phòng ban; đang dùng mẫu chung do chưa có phòng ban
          chính.
        </span>
      )}
    </div>
  );
}

export function EditLeadDisplayLayoutButton({
  layout,
  screen = "LEAD_LIST",
}: {
  layout?: EffectiveLayout;
  screen?: ListLayoutScreen;
}) {
  return <ListDisplayLayoutDialog screen={screen} layout={layout} />;
}
function LayoutStatus({
  query,
}: {
  query: UseQueryResult<EffectiveLayout, Error>;
}) {
  if (query.isLoading)
    return <span role="status">Đang tải cấu hình hiển thị…</span>;
  if (query.isError)
    return (
      <>
        <span role="alert">
          Chưa tải được cấu hình hiển thị. Đang dùng bố cục mặc định.
        </span>
        <Button type="button" variant="link" onClick={() => query.refetch()}>
          Thử lại
        </Button>
      </>
    );
  if (!query.data) return null;
  return (
    <span>
      Đang dùng: {query.data.name} · {sourceLabels[query.data.source]}
    </span>
  );
}
