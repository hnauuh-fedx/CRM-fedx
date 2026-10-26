# Thời gian làm việc của Sale

## Sử dụng

1. Chọn chương trình tuyển sinh đang làm việc.
2. Mở **Quản lý → Thời gian làm việc của Sale** (quyền `automation.manage`).
3. Thêm lịch, chọn Sale, đặt ca cho từng ngày và lưu. Có thể xem, sửa hoặc sao chép lịch; bản sao chưa áp dụng và chưa chọn Sale.
4. Trong node **Chia Lead tự động**, bật **Chỉ tính trong giờ làm việc của Sale**, lưu và bật rule. Rule yêu cầu đủ lịch đang áp dụng cho các Sale đủ điều kiện trong danh sách/team.

Rule cũ giữ thời gian liên tục nếu chưa bật tùy chọn này. Monitor đang chạy giữ chính sách tại thời điểm phân công; thay đổi chính sách của rule áp dụng cho lần phân công mới. Sửa lịch áp dụng cho cả monitor đang chờ dùng giờ làm việc.

## Quy tắc

- Một Sale có một lịch đang áp dụng trong một chương trình. Thay thế lịch cần chọn rõ trong form và được kiểm tra phạm vi trên server.
- Lịch tuần có tối đa hai ca mỗi ngày, không chồng nhau, theo `Asia/Ho_Chi_Minh` (UTC+7). Chưa hỗ trợ ca qua đêm, múi giờ khác, ngày lễ hoặc nghỉ phép cá nhân.
- Chỉ cộng phút trong ca. Ví dụ giao thứ Sáu 16:30, thời hạn 60 phút, lịch 08:00–12:00 và 13:00–17:00 từ thứ Hai đến thứ Sáu → hạn thứ Hai 08:30.
- Hạn đúng giờ đóng ca được thực hiện tại đầu ca tiếp theo. Job chạy trễ ngoài giờ được dời đến đầu ca, kiểm tra lại tương tác và phân công trước khi thực hiện.
- Cảnh báo lần một và hai cùng tính theo phút làm việc. Tương tác hợp lệ ngoài ca vẫn ngăn chuyển Sale theo tiêu chí của rule.
- Lịch sử ca và thời điểm thay đổi được giữ lại: sửa lịch chỉ thay đổi phần thời gian từ lúc lưu, không đặt lại thời gian đã tích lũy.
- Ngừng áp dụng/gỡ Sale khiến monitor thiếu lịch tạm chờ và ghi lý do vào `last_error`; không tự coi là làm việc 24/7. Khôi phục lịch sẽ tính tiếp thời gian còn lại.
- Lịch của người phụ trách hiện tại quyết định thời gian chờ. Quy tắc chọn Sale nhận mới giữ nguyên; không lọc theo người đang trực ca.

## Triển khai và kiểm tra

Migration: `apps/api/prisma/migrations/20261026090000_sale_work_schedules/migration.sql`. Áp dụng bằng quy trình Prisma hiện có trước khi chạy phiên bản API/worker mới, rồi sinh Prisma client. Không tự tạo lịch hoặc bật chế độ giờ làm việc cho rule hiện có.

Monitor có cờ yêu cầu tính lại; worker xử lý theo batch có index và tiếp tục lấy batch khi còn dữ liệu. Job có thời hạn trong ID; job cũ kiểm tra lại dữ liệu hiện tại. Thay đổi lịch, tạo monitor và phân công cuối cùng dùng khóa chương trình với thứ tự khóa nhất quán. Quyền và phạm vi phân công Lead vẫn do use case hiện có kiểm tra.

Các lệnh kiểm tra:

```powershell
npm run test:work-schedules --workspace apps/api
npm run test:integration:work-schedules --workspace apps/api
npm run test:work-schedules-browser --workspace apps/web
npm run typecheck --workspace apps/api
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```

Integration runner tạo database PostgreSQL local tạm riêng. SQL migration được kiểm tra trong schema mới trong database đó; không thử xóa bảng của database CRM đang cấu hình. Browser smoke dùng API giả lập để kiểm tra form thực tế ở desktop, 375px và chiều ngang; dữ liệu nghiệp vụ, phân quyền, cảnh báo và chuyển Sale được kiểm tra riêng bằng PostgreSQL và HTTP API.
