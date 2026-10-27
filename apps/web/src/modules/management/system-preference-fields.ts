import type { PreferenceSection } from "@admission-crm/shared/system-preferences";

export type PreferenceFieldDefinition = { key: string; label: string; description?: string; kind: "boolean" | "select" | "number" | "columns" | "fixed"; options?: Array<[string, string]>; min?: number; max?: number };
export const preferenceLabels: Record<PreferenceSection, string> = {
  intake: "Tiếp nhận dữ liệu", assignment: "Phân công Sale", notifications: "Thông báo", reminders: "Lịch hẹn & nhắc việc", sla: "Thời hạn xử lý", exports: "Xuất dữ liệu",
};
export const preferenceDescriptions: Record<PreferenceSection, string> = {
  intake: "Quy tắc dữ liệu trùng trong cùng chương trình. Hồ sơ ở chương trình khác được giữ riêng.",
  assignment: "Điều khiển các node tự phân công. Danh sách Sale, cách chia và giờ làm việc được quản lý trong Rule Automation.",
  notifications: "Thông báo trong ứng dụng cho người phụ trách. Email và SMS được thiết lập tại tích hợp tương ứng.",
  reminders: "Quá hạn được tính từ thời điểm hẹn, theo giờ liên tục. Thời gian hiển thị theo múi giờ Việt Nam.",
  sla: "Nhắc liên hệ lần đầu sau khi phân công. Áp dụng cho lần phân công mới kể từ khi bật; tính theo phút liên tục, kể cả ngoài giờ làm việc.",
  exports: "Chọn bộ cột và định dạng mặc định cho chức năng xuất từng trang danh sách lead. Quyền xuất và quyền xem dữ liệu vẫn được kiểm tra riêng.",
};
export const preferenceFields: Record<PreferenceSection, PreferenceFieldDefinition[]> = {
  intake: [
    { key: "inboundDuplicate", label: "Khi form hoặc tích hợp gửi lead trùng", kind: "select", options: [["source", "Theo chính sách của form / tích hợp"], ["reject", "Từ chối cập nhật bản ghi trùng"]] },
    { key: "blankValues", label: "Giá trị rỗng từ form hoặc tích hợp", kind: "select", options: [["legacy", "Giữ hành vi hiện tại của nguồn"], ["preserve", "Giữ dữ liệu hiện có"]], description: "Áp dụng cho các trường được gửi khi cập nhật lead qua luồng tiếp nhận chung." },
    { key: "excelDuplicate", label: "Khi nhập Excel thông thường gặp số điện thoại trùng", kind: "select", options: [["reject", "Báo lỗi dòng trùng"], ["skip", "Bỏ qua dòng trùng"]] },
    { key: "bizflyDuplicate", label: "Khi nhập file Bizfly gặp số điện thoại trùng", kind: "select", options: [["legacy", "Giữ quy tắc cập nhật Bizfly hiện tại"], ["skip", "Bỏ qua dòng trùng"], ["reject", "Báo lỗi dòng trùng"]], description: "Quy tắc hiện tại chỉ cập nhật tiến trình và doanh số tháng; các thông tin khác được giữ nguyên." },
  ],
  assignment: [
    { key: "enabled", label: "Cho phép tự phân công Sale bằng Automation", kind: "boolean", description: "Tắt để tạm dừng các node phân công tự động trong chương trình. Phân công thủ công vẫn theo quyền hiện có." },
    { key: "sources", label: "Nguồn tạo lead được tự phân công", kind: "columns", options: [["manual", "Nhập tay"], ["import", "Nhập Excel"], ["public_form", "Biểu mẫu công khai"], ["api", "API"], ["webhook", "Webhook"]], description: "Xét nguồn tạo lead gốc. Lead lịch sử chưa có thông tin nguồn vẫn theo quy tắc hiện tại." },
    { key: "preserveAssigned", label: "Giữ người phụ trách khi lead đã được phân công", kind: "fixed", description: "Các node phân công ban đầu giữ người phụ trách hiện có. Luồng tái phân công được quản lý riêng trong Automation." },
  ],
  notifications: [
    { key: "assignment", label: "Thông báo khi được phân công lead", kind: "boolean", description: "Áp dụng cho nhân viên chính và nhân viên phụ; nhập dữ liệu lịch sử Bizfly vẫn giữ chế độ im lặng." },
    { key: "reminderDue", label: "Thông báo khi nhắc việc đến hạn", kind: "boolean" },
    { key: "reminderOverdue", label: "Thông báo khi nhắc việc quá hạn", kind: "boolean", description: "Các thông báo đã gửi được giữ nguyên. Những sự kiện bị tắt sẽ không được gửi bù." },
  ],
  reminders: [
    { key: "overdueHours", label: "Gửi cảnh báo sau khi quá hạn (giờ)", kind: "number", min: 1, max: 720 },
    { key: "warnOverlap", label: "Cảnh báo khi có nhắc việc khác cùng thời điểm", kind: "boolean", description: "Vẫn cho phép lưu; cảnh báo chỉ xét nhắc việc bạn được xem trong cùng chương trình." },
  ],
  sla: [
    { key: "enabled", label: "Nhắc lead chưa được liên hệ lần đầu", kind: "boolean", description: "Gửi một thông báo cho nhân viên chính nếu chưa có hoạt động liên hệ được ghi nhận; không tự chuyển người phụ trách." },
    { key: "firstContactMinutes", label: "Thời hạn sau khi phân công (phút)", kind: "number", min: 5, max: 43200, description: "Hệ thống kiểm tra mỗi phút. Tác vụ bỏ qua lead đã đổi người phụ trách hoặc đã chuyển Fail." },
  ],
  exports: [
    { key: "format", label: "Định dạng tệp", kind: "select", options: [["xlsx", "Excel (.xlsx)"], ["csv", "CSV (.csv)"]] },
    { key: "columns", label: "Các cột mặc định", kind: "columns", options: [["leadCode", "Mã lead"], ["fullName", "Họ và tên"], ["phone", "Số điện thoại"], ["email", "Email"], ["createdAt", "Ngày tạo"]], description: "Số điện thoại và email chỉ xuất khi người thực hiện có quyền xem dữ liệu nhạy cảm." },
  ],
};
