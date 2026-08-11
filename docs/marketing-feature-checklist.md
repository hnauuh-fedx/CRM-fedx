# Checklist chức năng CRM Marketing

## Chiến dịch Marketing

- [x] Danh sách phân trang, tìm kiếm, lọc trạng thái và loại chiến dịch.
- [x] Tạo, chỉnh sửa và xóa chiến dịch theo quyền được cấp.
- [x] Quản lý trạng thái: lập kế hoạch, đang chạy, tạm dừng, đã kết thúc.
- [x] Quản lý thời gian triển khai, chương trình tuyển sinh và ngân sách.
- [x] Hiển thị lead phát sinh, hồ sơ tuyển sinh, sinh viên nhập học, tỷ lệ vào hồ sơ và chi phí/lead.
- [x] Ghi audit cho thao tác tạo, cập nhật, xóa; không xóa chiến dịch đã có UTM hoặc biểu mẫu.
- [x] Áp dụng phạm vi `campaign.view`, `campaign.view_own`, `campaign.update_own` và quyền mutation riêng biệt tại API/UI.

## Theo dõi UTM

- [x] Danh sách UTM hiện có với lọc nguồn, medium và chiến dịch.
- [x] Tổng hợp hiệu quả theo nguồn, chiến dịch và tổ hợp `utm_source` / `utm_medium` / `utm_campaign`.
- [x] Bảng xếp hạng theo lượt ghi nhận, lead, hồ sơ, nhập học và chi phí/lead của chiến dịch.
- [x] Drill-down từ dòng tổng hợp xuống danh sách lead phát sinh trong phạm vi được phép xem.
- [x] Bộ lọc thời gian cho danh sách và phân tích UTM.
- [ ] Xuất dữ liệu UTM theo quyền.

## Biểu mẫu Marketing

- [x] Danh sách biểu mẫu hiện có và liên kết hiển thị với chiến dịch.
- [x] Tạo, chỉnh sửa, ngưng sử dụng và xóa biểu mẫu theo quyền/scope.
- [x] Liên kết hoặc thay đổi chiến dịch của biểu mẫu.
- [x] Cấu hình mapping field biểu mẫu về trường dữ liệu lead, bắt buộc họ tên và số điện thoại.
- [ ] Kiểm tra dữ liệu bắt buộc, chống trùng lead và lưu audit khi nhập lead từ biểu mẫu.
