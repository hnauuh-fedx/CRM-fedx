# Báo cáo phân bổ và xử lý lead

Báo cáo xuất hiện trong **Tổng quan**, sau phần thống kê tổng đối với dashboard giám đốc. Các tài khoản khác nhìn thấy khối báo cáo khi có một trong các quyền `report.view_all`, `report.sale.view_department`, `report.sale.view_assigned` và đã chọn chương trình làm việc. Chức năng không tự cấp thêm quyền cho vai trò nào.

## Dữ liệu và cách tính

- Đếm lượt sự kiện thực tế, không đếm lead duy nhất và không suy ra số lead đang giữ.
- Giao lại cùng nhân viên khi chưa thu hồi không tăng lượt giao. Giao lại sau thu hồi là lượt mới.
- Chuyển sang người khác ghi một lượt thu hồi cho người cũ và một lượt giao cho người mới. Thu hồi thủ công ghi nhận khi người phụ trách chính được bỏ khỏi lead.
- Cảnh báo chỉ phát sinh khi cơ chế Automation hiện có ghi nhận `warned_at`/`second_warned_at`. Báo cáo không tự tạo cảnh báo hoặc thay đổi thời hạn xử lý.
- Bộ lọc ngày áp dụng theo **thời điểm sự kiện**, múi giờ `Asia/Ho_Chi_Minh`, bao gồm toàn bộ ngày kết thúc.
- Nhóm, nhân viên, chủ sở hữu, chương trình, nguồn và danh sách chiến dịch được chụp tại thời điểm sự kiện. Chiến dịch là các liên kết UTM đã tồn tại lúc đó; nhiều liên kết cùng chiến dịch không nhân số đếm.
- Hình thức và quy tắc của lượt giao tự động được bổ sung từ checkpoint Automation hoặc giao dịch điều chuyển, trước khi giao dịch commit. Các thao tác khác được phân loại thủ công.
- Không khôi phục dữ liệu quá khứ từ trạng thái hiện tại. Mốc bắt đầu ghi nhận được lưu trong `lead_assignment_report_coverage` và hiển thị trong giao diện.

## Cơ chế ghi nhận

Migration `20261105120000_assignment_reporting` bổ sung sổ sự kiện và các trigger PostgreSQL trên bảng phân công, lead, checkpoint Automation và monitor điều chuyển. Cách này bao phủ cả luồng đơn lẻ lẫn ghi theo lô mà không bỏ sót writer. Sự kiện được commit/rollback cùng nghiệp vụ; khóa duy nhất `event_key` ngăn đếm trùng khi xử lý lại. Không phụ thuộc việc lưu giữ nhật ký thực thi hoặc thông báo.

Sổ giữ tham chiếu scalar để việc xóa lead/nhật ký không làm mất số liệu lịch sử. Không lưu tên, số điện thoại, email hoặc CCCD của lead trong sổ sự kiện. Trigger nghiệp vụ không cung cấp API sửa/xóa sổ.

## Phân quyền

API luôn yêu cầu xác thực và quyền báo cáo. Chương trình lấy từ ngữ cảnh được kiểm tra của request, không nhận chương trình tùy ý trong bộ lọc.

- `report.view_all` kết hợp scope `ALL`: toàn bộ sự kiện của chương trình được cấp.
- Scope phòng ban và quyền tương ứng: nhóm chụp trong sự kiện phải thuộc phạm vi hiện tại.
- Scope cá nhân: chỉ sự kiện của nhân viên, hoặc chủ sở hữu khi scope là `OWNED_ONLY`.
- Tên/liên kết lead trong chi tiết còn phải vượt qua kiểm tra quyền và scope lead hiện tại. Lead ngoài phạm vi hoặc đã xóa được ẩn danh tính.

## API

- `GET /reports/assignments`: tổng chỉ số và bảng nhân viên.
- `GET /reports/assignments/events`: sự kiện chi tiết.
- `GET /reports/assignments/options`: lựa chọn bộ lọc có tìm kiếm và phân trang.

Hai API dữ liệu dùng chung điều kiện lọc; mỗi response tổng hợp/chi tiết dùng transaction `REPEATABLE READ`. Các lần mở chi tiết riêng biệt có thể thấy thêm sự kiện vừa phát sinh. Tối đa 50 bản ghi/trang; bộ chọn trả 20 lựa chọn/trang. Không đưa danh tính lead nhạy cảm vào response.

## Migration và kiểm tra

Áp dụng migration SQL qua quy trình Prisma migrations của dự án trước khi sử dụng chức năng. `prisma db push` đơn lẻ không cài đặt các trigger và không đủ để kích hoạt báo cáo. Migration mới không cần backfill hoặc Redis mới.

Kiểm tra từ repo root:

```powershell
npm run test:assignment-report --workspace apps/api
npm run test:integration:assignment-report --workspace apps/api
npm run test:assignment-report --workspace apps/web
npm run test:assignment-report-browser --workspace apps/web
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
```

Kiểm thử tích hợp tạo/xóa database PostgreSQL local riêng, áp dụng migration thực tế và chạy `EXPLAIN ANALYZE` với thêm 50.000 sự kiện. Không sửa database CRM cấu hình. Smoke test browser dùng dữ liệu giả lập, xuất ảnh desktop/mobile vào `artifacts/assignment-report/`.
