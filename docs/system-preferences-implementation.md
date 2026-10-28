# Cấu hình hệ thống theo nghiệp vụ

## Phạm vi triển khai

Trang `/quan-ly/cau-hinh` dùng giao diện nhóm thay cho bảng key/value. Các component mới nằm trong `apps/web/src/modules/management`; hợp đồng và giá trị mặc định nằm ở `packages/shared/src/system-preferences.ts`.

- Tiếp nhận dữ liệu: chính sách dòng trùng cho Excel/Bizfly; chính sách trùng và bảo toàn giá trị rỗng cho luồng inbound chung.
- Phân công: bật/tắt node tự phân công, chọn nguồn tạo lead được áp dụng; dẫn tới Rule Automation và lịch làm việc để quản lý Sale/cách chia hiện có.
- Thông báo: bật/tắt thông báo phân công chính/phụ, nhắc việc đến hạn và quá hạn.
- Lịch hẹn: số giờ trước cảnh báo quá hạn và cảnh báo nhắc việc khác cùng thời điểm sau khi lưu.
- SLA: nhắc liên hệ lần đầu sau phân công, xử lý mỗi phút qua bộ xử lý nền hiện có của API.
- Export: chọn cột/định dạng CSV hoặc XLSX; nút xuất trang hiện tại dùng cùng bộ lọc và phạm vi với danh sách lead, tối đa 100 bản ghi mỗi yêu cầu.
- Biểu mẫu: tích chọn trường bắt buộc, khóa trường cốt lõi, mẫu ghi chú có sẵn theo trạng thái, liên kết tới Pipeline và luồng trạng thái hồ sơ hiện có.
- Lịch sử từng nhóm vận hành: phân trang, quyền `audit.view`, điền lại giá trị cũ vào biểu mẫu trước khi lưu để khôi phục.

## Lưu trữ và tương thích

Không thêm bảng, migration hay dịch vụ bên ngoài. Các nhóm vận hành lưu trong `system_settings` theo key `crm.preferences.<programId>.<section>` với phiên bản tài liệu, giá trị, người sửa và thời gian sửa. GET không tạo dữ liệu; không ghi đè cấu hình hiện tại khi mở trang.

Mặc định tương thích giữ chính sách nguồn/Bizfly hiện tại; tự phân công và thông báo giữ trạng thái bật như các luồng cũ; SLA tắt. “Dùng mẫu khuyến nghị” chỉ điền biểu mẫu, cần lưu để áp dụng. Mẫu khuyến nghị bật bảo toàn giá trị rỗng trong inbound.

Trường bắt buộc, mẫu ghi chú và quy trình trạng thái vẫn là cấu hình toàn hệ thống, có nhãn phạm vi rõ ràng. Tái sử dụng key/validators và bộ ghi nghiệp vụ hiện có. Bảng `sla_rules` và `report_configs` cũ được bảo toàn, không tự chuyển sang SLA mới hoặc cấu hình xuất lead mới. Báo cáo cá nhân tiếp tục dùng cấu hình riêng.

API key/value cũ không được sửa/xóa key cấu hình nghiệp vụ có giao diện riêng, key migration, preference có phiên bản hoặc giá trị có type secret. Dữ liệu secret và migration không xuất hiện trong kết quả quản lý cũ.

## Các nguyên tắc thực thi

### Ngoại lệ cho người tạo lead nhập tay

Trong **Phân công Sale → Người nhập tay để trống Sale phụ trách**, quản trị có thể tìm, tích chọn nhiều tài khoản và lưu riêng cho từng chương trình. Danh sách lưu tại `assignment.manualUnassignedCreatorIds`, mặc định rỗng và tương thích với cấu hình cũ. Không tự thêm tài khoản theo tên vai trò Admin/Giám đốc.

- Không chọn Sale trong biểu mẫu: tài khoản trong danh sách tạo lead với `assigned_to = null`, chờ rule `lead_created` đang bật; tài khoản ngoài danh sách tự nhận khi đủ điều kiện Sale trong chương trình. Tài khoản không đủ điều kiện Sale vẫn để trống.
- Chọn Sale chính/phụ cụ thể: giữ nguyên xử lý phân công và kiểm tra permission/scope hiện có. Danh sách ngoại lệ không cấp `lead.create`, `lead.assign` hay quyền xem thêm lead.
- Người tạo vẫn lưu ở `owner_id` và lịch sử tạo. Excel, Bizfly, API/webhook và form công khai không nhận mặc định tự gán của nhập tay.
- Cần bật tự phân công, nguồn Nhập tay và có rule phù hợp; cấu hình không tạo hoặc bật rule thay người quản trị.
- Bộ chọn trả tối đa 20 tài khoản mỗi trang và chỉ trả tên/ID trong chương trình. Lưu từ chối tài khoản sai chương trình, không còn hoạt động, ID không hợp lệ hoặc trùng ID. Có thể bỏ chọn tài khoản cũ không còn khả dụng.
- Trường bổ sung của ứng viên được lưu trong cùng transaction tạo lead, trước khi quyền xem thay đổi vì phân công. Nếu dữ liệu bổ sung sai, toàn bộ lần tạo được rollback. Popup nhận trạng thái `canOpen` từ máy chủ; khi không có quyền xem hồ sơ mới, hiển thị tạo thành công thay vì điều hướng tới trang 403.
- Kiểm thử bổ sung bao gồm mặc định tự nhận, người tạo ngoại lệ, gán cụ thể, khác chương trình, picker không lộ người ngoài phạm vi, dữ liệu bổ sung và thực thi node phân công thật. Browser test kiểm tra tìm/chọn/lưu/hủy danh sách ở desktop/mobile; ảnh `artifacts/system-preferences/manual-creators-*.png`.

- API quản trị yêu cầu xác thực + `system.manage` + chương trình được cấp quyền. Quyền quản trị không cấp quyền đọc hay xuất lead.
- Lưu từng nhóm có revision SHA-256 và khóa transaction; lưu từ revision cũ trả HTTP 409. Khôi phục vẫn dùng cùng kiểm tra revision và ghi audit mới.
- Mẫu ghi chú và biểu mẫu toàn hệ thống cũng kiểm tra revision. Toggle trường ở màn hình cũ dùng chung khóa khi cập nhật.
- Trường bắt buộc được kiểm tra phía máy chủ trong tạo/sửa lead, inbound và chuyển tiến trình hiện có. Kiểm tra trường liên quan dùng cùng catalog thay vì hardcode các trạng thái pipeline.
- Nhập Excel có bước xem trước dùng cùng bộ ghi/validation trong transaction rồi rollback; không để lại lead, ngành, audit, hoạt động, thông báo hoặc tác vụ. Xác nhận nhập kiểm tra lại dữ liệu và quyền tại thời điểm thực thi.
- File Bizfly vẫn giữ quy tắc cập nhật tiến trình/doanh số tháng, nhân viên và ngày tạo gốc. Số điện thoại lặp trong cùng file được báo lỗi ở dòng tiếp theo sau dòng xử lý thành công, nhất quán giữa xem trước và nhập thật.
- Excel thông thường nhận diện tên cột bằng các alias hiện có; chưa bổ sung trình ánh xạ cột tùy ý. File vượt 1.000 dòng thông thường hoặc 5.000 dòng Bizfly bị báo lỗi, không cắt bỏ âm thầm.
- Khóa số điện thoại dùng chung giữa tạo lead và inbound; kiểm tra trùng nằm trong cùng chương trình, xét số chính/phụ. Chưa tự gộp theo email hay tự gộp hồ sơ giữa các chương trình.
- Tắt tự phân công chỉ bỏ qua node phân công, không tắt các node nghiệp vụ khác. Không thay đổi phân công thủ công hoặc cơ chế tái phân công đã cấu hình riêng.
- SLA tính phút liên tục từ lần phân công mới, không hồi tố lead cũ và không tính theo giờ làm việc. Mỗi lần phân công có một tác vụ; bỏ qua khi đã liên hệ, đổi người phụ trách, mất quyền xem hoặc chuyển Fail. Tác vụ không tự chuyển Sale. Thay thời hạn chỉ áp dụng lần phân công mới; tắt sẽ ngừng gửi những tác vụ chưa xử lý khi đến hạn.
- Nhắc việc nhận cấu hình theo chương trình, claim và tạo thông báo trong transaction; kiểm tra lại người nhận, phạm vi và thời điểm để tránh gửi lặp hoặc gửi sau khi mất quyền. Sự kiện đã tắt không gửi bù khi bật lại.
- Export phân trang ở máy chủ, kiểm tra quyền xuất riêng, lọc cột nhạy cảm theo quyền xem và xử lý chuỗi có khả năng trở thành công thức khi mở bảng tính.

## Kiểm chứng

```powershell
npm run test:system-preferences --workspace apps/api
npm run test:lead-import:bizfly --workspace apps/api
$env:AUTOMATION_TEST_ARTIFACT_DIR = Join-Path (Get-Location) 'artifacts/system-preferences/backend'
npm run test:integration:system-preferences --workspace apps/api
npm run test:system-preferences-browser --workspace apps/web
npm run typecheck --workspace apps/api
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```

Integration runner chỉ tạo và xóa database test riêng trên PostgreSQL cục bộ, không chạy migration hoặc sửa database CRM đang dùng. Bộ test có fixture 50.000 lead để xác minh phân trang và truy vấn tìm số điện thoại dùng chỉ mục; đây không phải kết quả benchmark cho 500.000 bản ghi.

Browser test dùng dữ liệu giả lập và Chrome headless để kiểm tra mặc định, lưu, xung đột, bảo vệ thay đổi chưa lưu, tìm kiếm, trường cốt lõi, bàn phím và kích thước 1440/390/375px. Ảnh nghiệm thu nằm trong `artifacts/system-preferences`.

React Doctor được chạy cho diff và toàn frontend. Các cảnh báo còn lại ở component cũ được ghi nhận riêng; không sửa các module ngoài phạm vi trong lần triển khai này.

Kết quả nghiệm thu: 5 unit test cấu hình, 7 test Bizfly, integration `system-preferences` (bao gồm 50.000 lead), integration `automation-information-update`, browser test responsive, typecheck API/web và build web đều qua. React Doctor toàn frontend: 82/100, không có diagnostic ở các component cấu hình mới; vẫn còn lỗi/cảnh báo có sẵn ở các component cũ (bao gồm `ui/select.tsx`).

Kiểm tra bổ sung `lead-workflow` chưa qua: fixture trong `lead-workflow.integration.ts` chỉ tạo `user_roles`, không tạo `user_program_roles`; request của Sale Manager bị HTTP 403 trước khi chạy logic tạo lead. Cơ chế xác thực hiện tại chỉ đọc quyền theo `user_program_roles`. Không hạ kiểm tra quyền hoặc sửa fixture ngoài phạm vi để làm bộ test này qua. Log ở `artifacts/system-preferences/lead-regression/lead-workflow.log`.
