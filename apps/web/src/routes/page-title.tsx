import { useEffect } from "react";
import { matchPath, useLocation } from "react-router-dom";

import { getNavigationPageLabel } from "@/components/layout/navigation";

const pageTitles: Array<[path: string, title: string]> = [
  ["/dang-nhap", "Đăng nhập"],
  ["/khong-co-quyen", "Không có quyền truy cập"],
  ["/sale/leads/:leadId", "Chi tiết lead"],
  ["/sale/students/:leadId", "Chi tiết học viên"],
  ["/marketing/danh-sach-khach-hang/:leadId", "Chi tiết khách hàng"],
  ["/marketing/quan-ly-danh-sach/:customerListId", "Chi tiết danh sách khách hàng"],
  ["/marketing/form-survey/:formId", "Cấu hình Form & Survey"],
  ["/marketing/kenh-ket-noi/zalo", "Kết nối Zalo"],
  ["/marketing/kenh-ket-noi/meta", "Kết nối Meta"],
  ["/automations/:id/builder", "Thiết lập Automation"],
  ["/forms/:publicKey", "Biểu mẫu đăng ký"],
  ["/bieu-mau/:publicKey", "Biểu mẫu đăng ký"],
  ["/sale/cau-hinh-truong", "Cấu hình trường dữ liệu Sale"],
  ["/marketing/cau-hinh-truong", "Cấu hình trường dữ liệu Marketing"],
  ["/tuyen-sinh/cau-hinh-truong", "Cấu hình trường dữ liệu tuyển sinh"],
];

export function getPageTitle(pathname: string, search = ""): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  const title = getNavigationPageLabel(path, search)
    ?? pageTitles.find(([pattern]) => matchPath(pattern, path))?.[1];
  return title ? `${title} | Admission CRM` : "Admission CRM";
}

export function PageTitle() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    document.title = getPageTitle(pathname, search);
  }, [pathname, search]);
  return null;
}
