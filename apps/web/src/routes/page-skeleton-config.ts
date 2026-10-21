import type { PageSkeletonVariant } from "@/components/shared/page-loading-state";

/** Match the specific layouts before their parent list routes. */
export function getPageSkeletonVariant(pathname: string): PageSkeletonVariant {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (/^\/(forms|bieu-mau)\//.test(path)) return "public-form";
  if (path === "/dang-nhap") return "session";
  if (/^\/automations\/[^/]+\/builder$/.test(path)) return "builder";
  if (/^\/marketing\/form-survey\/[^/]+$/.test(path)) return "settings";
  if (/^\/(sale\/leads|marketing\/danh-sach-khach-hang)\/[^/]+$/.test(path)) return "detail";
  if (/^\/marketing\/quan-ly-danh-sach\/[^/]+$/.test(path)) return "lead-list";
  if (["/sale/leads", "/marketing/danh-sach-khach-hang"].includes(path)) return "lead-list";
  if (path === "/tong-quan" || path.startsWith("/bao-cao/") || path === "/sale/kpi") return "dashboard";
  if (path === "/marketing/kenh-ket-noi" || path === "/automations") return "cards";
  if (/\/cau-hinh(?:-truong|-hien-thi)?$/.test(path) || /^\/marketing\/kenh-ket-noi\//.test(path)) return "settings";
  return "list";
}
