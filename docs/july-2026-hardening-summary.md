# Báo cáo hardening demo nội bộ tháng 07/2026

## Mục tiêu

Vòng hardening tháng 07/2026 tập trung ổn định các luồng lõi đủ phục vụ demo nội bộ, không mở rộng tính năng mới và không refactor kiến trúc lớn. Trọng tâm là dashboard giám đốc, phân quyền dữ liệu nhạy cảm ở mức tối thiểu, checklist demo, seed quyền và integration test demo-data không bị treo do Redis/BullMQ.

## Phạm vi đã xử lý

- Dashboard giám đốc đã tách chỉ số `Lead sang hồ sơ` và `Hồ sơ sang sinh viên`.
- Dashboard và breakdown đã tôn trọng scope `institutionProgramId`.
- Permission `lead.sensitive.view` đã được thêm vào seed demo và script cập nhật DB hiện hữu.
- Permission `document.sensitive.view` đã được thêm ở mức tối thiểu cho metadata tài liệu tuyển sinh.
- API lead list/detail đã mask dữ liệu nhạy cảm khi user không có quyền phù hợp.
- API admission documents đã mask `fileName`, `fileUrl`, `mimeType`, `fileSize` nếu user không có quyền xem dữ liệu tài liệu nhạy cảm hoặc quyền xử lý tài liệu liên quan.
- Integration `demo-data` tự tắt automation worker trước khi import app để không cần Redis local và không giữ process sống.
- Checklist demo tháng 07 đã bổ sung các mục kiểm tra quyền nhạy cảm, dashboard scope và Redis/automation worker.

## Quyền dữ liệu nhạy cảm

Các quyền được rà soát trong vòng này:

- `lead.sensitive.view`: cho phép xem phone, email, CCCD và các field liên hệ nhạy cảm của lead.
- `document.sensitive.view`: cho phép xem metadata tệp hồ sơ tuyển sinh cần thiết cho xử lý tài liệu.

Seed quyền nhạy cảm dùng cơ chế idempotent, có thể chạy nhiều lần mà không tạo trùng grant. Role demo được cấp quyền ở mức phục vụ demo:

- `DIRECTOR`: có `lead.sensitive.view` và `document.sensitive.view`.
- `SALE_MANAGER`: có `lead.sensitive.view`.
- `TELESALE`: có `lead.sensitive.view` cho lead được phân công.
- `ADMISSION_OFFICER`: được grant `document.sensitive.view` nếu role này tồn tại trong DB hiện hữu.
- `MARKETING_MANAGER` và `STUDENT_SERVICE`: không được grant `lead.sensitive.view` trong seed demo.

## Lệnh kiểm tra trước demo

Chạy các lệnh sau trước buổi demo nội bộ:

```bash
npm run build --workspace apps/web
npm run typecheck --workspace apps/api
npm run seed:sensitive-permissions --workspace apps/api
npm run test:integration:demo-data --workspace apps/api
```

Kỳ vọng:

- Web build pass. Warning chunk lớn hiện chưa chặn demo.
- API typecheck pass.
- Seed sensitive permissions chạy được nhiều lần và báo `0 new grant(s)` nếu DB đã được cập nhật.
- Integration demo-data in `Demo data verified...` và thoát sạch.

## Checklist demo nhanh

- Đăng nhập Director và kiểm tra dashboard tổng lead, lead sang hồ sơ, hồ sơ sang sinh viên.
- Chọn scope chương trình tuyển sinh trên topbar và kiểm tra dashboard/list chỉ còn dữ liệu đúng chương trình.
- Kiểm tra user có `lead.sensitive.view` xem được phone/email/CCCD của lead.
- Kiểm tra user có quyền xem lead nhưng không có `lead.sensitive.view` nhận `null` cho dữ liệu nhạy cảm.
- Kiểm tra user thiếu `document.sensitive.view` không nhận file URL/name/mime/size từ `/api/admissions/documents`.
- Chạy integration demo-data và xác nhận command thoát sạch, không cần Redis local.

## Rủi ro còn lại

- Chưa thể khẳng định toàn bộ CRM đã hoàn thiện bảo mật dữ liệu nhạy cảm. Vòng này mới hardening bước đầu cho Lead và document metadata, đủ phục vụ demo nội bộ tháng 07.
- Admission/student detail chưa có permission nhạy cảm đầy đủ cho mọi field cá nhân.
- Automation thật vẫn cần Redis khi bật worker trong môi trường demo hoặc production.
- React Doctor còn nhiều lỗi cũ ngoài phạm vi vòng hardening này.
- Web bundle còn warning chunk lớn, chưa chặn demo nhưng cần tối ưu sau.
- Warning `pg client.query()` vẫn xuất hiện trong integration demo-data, hiện chưa làm fail test và chưa ảnh hưởng demo.

## Chuyển sang tháng 08/2026

- Thiết kế đầy đủ `admission.sensitive.view`, `student.sensitive.view`, `document.sensitive.view`.
- Chuẩn hóa serializer response cho admission/student/document.
- Tách test harness integration để mặc định không khởi động worker trong mọi test API.
- Xử lý React Doctor theo từng module, ưu tiên lỗi có rủi ro runtime.
- Tối ưu code splitting frontend để giảm warning chunk lớn.
