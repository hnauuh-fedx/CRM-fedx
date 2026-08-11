# Checklist demo nội bộ tháng 07/2026

## Tài khoản demo

- Đăng nhập `director@tvu.edu.vn / 123456` và xác nhận thấy dashboard, báo cáo, lead, hồ sơ, sinh viên, audit.
- Đăng nhập `marketing@tvu.edu.vn / 123456` và xác nhận chỉ thấy nhóm CRM Marketing theo quyền.
- Đăng nhập `sale.manager@tvu.edu.vn / 123456` và xác nhận thấy lead trong phạm vi phòng ban.
- Đăng nhập `telesale@tvu.edu.vn / 123456` và xác nhận chỉ thấy lead được phân công.
- Đăng nhập `student.service@tvu.edu.vn / 123456` và xác nhận chỉ thấy sinh viên/dịch vụ sinh viên theo quyền.

## Luồng nghiệp vụ lõi

- Mở form công khai từ một marketing form đang published/active, gửi họ tên và số điện thoại mẫu.
- Vào danh sách lead, tìm lead vừa tạo, kiểm tra nguồn/campaign/form submission liên kết đúng.
- Phân công lead cho telesale, kiểm tra lead assignment, notification và timeline activity.
- Cập nhật giai đoạn pipeline của lead, kiểm tra lịch sử trạng thái và audit log.
- Tạo hoặc cập nhật hồ sơ tuyển sinh từ lead, kiểm tra lead vẫn liên kết với hồ sơ.
- Duyệt hồ sơ tuyển sinh, kiểm tra trạng thái hồ sơ và notification cho người phụ trách.
- Chuyển hồ sơ sang sinh viên, kiểm tra sinh viên mới có `studentCode`, liên kết `leadId` và `admissionProfileId`.

## Phân quyền và dữ liệu nhạy cảm

- Với `telesale@tvu.edu.vn`, kiểm tra không xem được lead ngoài phân công.
- Với user có `lead.sensitive.view`, kiểm tra API `/api/leads` và `/api/leads/:id` trả phone/email/CCCD khi dữ liệu có tồn tại.
- Với user có quyền xem lead nhưng không có `lead.sensitive.view` hoặc quyền cập nhật lead, kiểm tra API `/api/leads` và `/api/leads/:id` trả `null` cho phone, email, CCCD, địa chỉ và thông tin người thân.
- Với user chỉ có `admission_document.view` nhưng không có `document.sensitive.view`, kiểm tra `/api/admissions/documents` không trả `fileUrl`, `fileName`, `mimeType`, `fileSize`.
- Với user có `document.sensitive.view`, `admission_document.upload` hoặc `admission.approve`, kiểm tra vẫn xem được tệp hồ sơ cần xử lý.
- Kiểm tra audit log không hiển thị phone, email, CCCD trong payload.

## Dashboard và báo cáo

- Dashboard giám đốc hiển thị tổng lead, hồ sơ, sinh viên, tỷ lệ lead sang hồ sơ, tỷ lệ hồ sơ sang sinh viên.
- Lọc theo chương trình tuyển sinh từ topbar, kiểm tra dashboard và các danh sách chỉ còn dữ liệu của chương trình đã chọn.
- Kiểm tra breakdown theo phòng ban trên dashboard thay đổi theo scope chương trình tuyển sinh.
- Báo cáo tổng hợp hiển thị tổng lead, hồ sơ, sinh viên, doanh thu và tình trạng hồ sơ.
- Báo cáo Marketing hiển thị lead theo campaign/source và conversion sang hồ sơ.
- Báo cáo Sale hiển thị lead theo pipeline, phân công, nhắc việc và hiệu suất nhân viên.

## Kiểm tra kỹ thuật trước demo

- Chạy `npm run build --workspace apps/web`.
- Chạy `npm run typecheck --workspace apps/api`.
- Chạy `npm run seed:sensitive-permissions --workspace apps/api` trên DB hiện hữu nếu chưa chạy lại demo seed sau khi thêm quyền sensitive.
- Chạy `npm run test:integration:demo-data --workspace apps/api` và xác nhận command in `Demo data verified...` rồi thoát sạch.
- Test demo-data không yêu cầu Redis local vì automation worker được tắt trong integration test.
- Nếu bật automation cho demo thật, Redis local hoặc Redis môi trường demo vẫn cần chạy để xử lý rule automation.
