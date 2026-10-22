import type { AutomationAssignmentResult } from "@admission-crm/shared/automation-assignment";
import { Link } from "react-router-dom";

export function AssignmentResultDetails({ result }: { result?: AutomationAssignmentResult | null }) {
  if (!result) return null;
  const current = result.currentAssigneeName ?? result.currentAssigneeId ?? "Chưa phân công";
  const requested = result.requestedAssigneeName ?? result.requestedAssigneeId;
  return (
    <div className="basis-full break-words text-sm text-muted-foreground">
      <p>{result.kind === "conflict"
        ? requested ? `Giữ ${current}. Yêu cầu gán cho ${requested} đã bị bỏ qua.`
          : `Giữ ${current}. Yêu cầu chia lead theo danh sách/team đã bị bỏ qua; chưa chọn sale mới.`
        : result.kind === "unchanged" ? `Lead đã được giao cho ${current}; không có thay đổi.`
        : result.kind === "stale_event" ? "Bỏ qua sự kiện bỏ phân công đã hết hiệu lực."
        : `Đã phân công cho ${current}.`}</p>
      {result.source ? (
        <p>Nguồn: {result.source.canOpenRule ? <Link className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2" to={`/automations/${result.source.ruleId}/builder`}>{result.source.ruleName}</Link> : result.source.ruleName}
          {result.source.version != null ? ` · phiên bản ${result.source.version}` : ""} · node {result.source.nodeId}
        </p>
      ) : result.currentAssigneeId ? <p>{result.sourceRestricted ? "Nguồn phân công nằm ngoài phạm vi xem." : "Nguồn: phân công thủ công hoặc lịch sử chưa ghi nhận rule."}</p> : null}
    </div>
  );
}
