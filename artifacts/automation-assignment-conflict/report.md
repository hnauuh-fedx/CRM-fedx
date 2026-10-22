# Chặn xung đột phân công automation

Ngày: 22/10/2026.

## Hành vi đã triển khai

- Node gán trực tiếp và chia lead chỉ gán khi lead chưa có sale chính. Khi hai rule chạy đồng thời, rule gán thành công trước được giữ lại, không có ưu tiên nghiệp vụ theo thứ tự tên/tạo rule.
- Kiểm tra sale hiện tại, tái sử dụng checkpoint, ghi phân công hoặc log bỏ qua và ghi checkpoint đều thực hiện bên trong transaction có khóa theo lead.
- Rule bị chặn không dịch con trỏ chia lead, không tạo monitor chuyển sale và không gửi thông báo phân công. Gán đúng sale hiện tại được ghi là không có thay đổi; sự kiện bỏ phân công hết hiệu lực được ghi riêng.
- Lưu kết quả node trong assignment_result, nguồn gồm rule, tên, phiên bản snapshot nếu có, node, execution và assignment. Lịch sử trước thay đổi không được suy đoán là do một rule cụ thể.
- Audit phân công thành công/bỏ qua áp dụng cho mọi sự kiện, không chỉ bỏ phân công thủ công. Retry cùng node không tạo thêm phân công, audit, thông báo hoặc dịch con trỏ.
- Node tiếp theo vẫn chạy như trước; xung đột là kết quả nghiệp vụ không thay đổi, không phải lỗi để tự retry.
- Sale phụ giữ nguyên. Luồng chuyển sale theo chính sách vẫn cho phép phân công lại và đã qua hồi quy.
- Lịch sử vận hành và chạy thử hiển thị xung đột, sale được giữ, sale được yêu cầu hoặc pool/team, cùng nguồn rule. Nguồn rule ngoài scope bị ẩn; link builder chỉ hiện khi có quyền quản lý automation.

## File thay đổi

Backend và hợp đồng:
- packages/shared/src/automation-assignment.ts
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20261022090000_automation_assignment_conflict/migration.sql
- apps/api/src/modules/leads/application/lead-owner-stage.use-cases.ts
- apps/api/src/modules/automations/automation-action-registry.ts
- apps/api/src/modules/automations/automation-assignment-result.service.ts
- apps/api/src/modules/automations/automation-assignment-result.serializer.ts
- apps/api/src/modules/automations/automation-engine.service.ts
- apps/api/src/modules/automations/automation-observability.service.ts
- apps/api/src/modules/automations/automation.service.ts

Frontend:
- apps/web/src/modules/automations/automation.types.ts
- apps/web/src/modules/automations/pages/assignment-result-details.tsx
- apps/web/src/modules/automations/pages/automation-monitoring-page.tsx
- apps/web/src/modules/automations/pages/builder/automation-test-run-dialog.tsx

Kiểm thử:
- apps/api/src/integration/automation-assignment-conflict.integration.ts
- apps/api/src/integration/manual-unassignment.integration.ts và automation-reassignment.integration.ts: bổ sung fixture user_program_roles theo mô hình quyền hiện hành.
- apps/api/scripts/test-manual-unassignment-isolated.cjs: kiểm tra migration mới trên DB cô lập và tùy chọn thư mục artifact.
- apps/api/package.json, apps/web/package.json: thêm lệnh kiểm thử.
- apps/web/tests/automation-assignment-conflict-smoke.html, automation-assignment-conflict-smoke.tsx, automation-assignment-conflict.browser.mjs.

## Xác minh

- PASS: integration PostgreSQL cô lập, kiểm tra migration thật; hai rule chạy đồng thời, direct/direct, direct/pool least-loaded và weighted; hai delivery cùng node; phân công thủ công, cùng sale, giữ sale phụ; pool bị chặn không dịch cursor/không tạo monitor; rollback, retry; sự kiện Form và bỏ phân công hết hiệu lực; nguồn rule và phạm vi API.
- PASS: 98 unit test automation.
- PASS: manual-unassignment, automation-reassignment và marketing-form-automation-event trên PostgreSQL + Redis local với DB test riêng. Log tại regression/.
- PASS: build web; typecheck API và web.
- PASS: React Doctor 100/100, không có diagnostic trong lần quét diff. Workspace có các thay đổi từ trước, kết quả quét bao gồm các file đó.
- PASS: browser harness dùng component thật, copy tiếng Việt, link rule, ẩn nguồn ngoài scope, bàn phím, không tràn ngang ở 1440/390/375px. Nghiệm thu toàn bộ trang trên DB CRM đã hoàn thành ở mục nghiệm thu dịch vụ bên dưới. Ảnh: [mobile](component-375.png), [desktop](component-1440.png).
- PASS: suite automation-engine tổng quát sau cập nhật fixture user_program_roles và student.view cho tài khoản cần đọc template sau chuyển sinh viên. Có assertion từ chối cùng thao tác đọc khi thiếu student.view; không nới quyền trong code sản phẩm. Log mới: readiness/automation-engine.log.
- Build còn cảnh báo chunk lớn của bundle hiện tại.

## Migration khi đưa vào sử dụng

Đã áp dụng migration 20261022090000_automation_assignment_conflict lên crm_db tại localhost:5432 ngày 22/10/2026, sau khi sao lưu toàn bộ và kiểm tra pg_restore --list. Chỉ migration này chờ và được áp dụng. Prisma migrate status xác nhận schema đã cập nhật. Chi tiết backup và xác minh cột JSONB nullable: [migration.json](readiness/migration.json). Worker local đã được nạp lại vì tiến trình cũ chạy trước phiên bản mã mới. Không triển khai ra dịch vụ bên ngoài.

## Giới hạn có chủ đích

- Chưa thêm độ ưu tiên giữa các rule; thứ tự nhận khóa quyết định lần gán đầu.
- Pool bị chặn không chọn sale giả định và không dịch cursor; log lưu pool/team thay cho một sale dự kiến chưa được chọn.
- Nguồn của phân công cũ hoặc lần chuyển sale không có metadata liên kết được hiển thị là thủ công hoặc lịch sử chưa ghi nhận rule, không tự gán nguồn sai.

## Nghiệm thu trên dịch vụ CRM đang chạy

- Đã chạy trực tiếp API localhost:3000, frontend localhost:5173, crm_db và default queue automation_engine_queue bằng worker được nạp lại. [Bằng chứng](readiness/live-evidence.json), [worker](readiness/local-worker.json).
- Do có rule nghiệp vụ đang active cho lead_created, không phát sự kiện tạo lead dùng chung trên CRM local. Hai rule fixture có cùng trigger/điều kiện được chạy thử đồng thời qua API thật trên cùng lead fixture. Fan-out sự kiện và luồng đầy đủ được kiểm tra trong suite engine cô lập đã PASS.
- Hai trường hợp direct/direct và direct/pool đều đúng một assignment thành công, một xung đột, đúng nguồn rule; một thông báo; chạy lại delivery cùng node không thêm audit hoặc assignment. Trình duyệt mở lịch sử xung đột và chạy thử từ builder vẫn giữ sale.
- Desktop/mobile đã kiểm tra không tràn viewport. Ảnh: [giám sát desktop](readiness/live-monitoring-1440.png), [giám sát mobile](readiness/live-monitoring-390.png), [builder](readiness/live-builder.png).
- Đã sửa lỗi phát hiện qua nghiệm thu: React Flow đo kích thước node lúc mở builder làm isDirty=true, khóa nút chạy thử. Hiện lưu dimensions vào state nhưng không đánh dấu chỉnh sửa; mở/chọn node giữ trạng thái đã lưu, kéo node bằng chuột vẫn đánh dấu chưa lưu. Browser test kiểm tra cả ba hành vi.
- Server nghiệm thu riêng ban đầu thiếu router thông báo/chương trình của shell; đã bổ sung router thật. Không sửa thông báo hoặc nới quyền để vượt lỗi fixture.
- Fixture user/role/source/lead/rule/session/audit/notification được xóa bằng ID riêng của lượt chạy. [Cleanup](readiness/live-cleanup.json) xác nhận không còn user, lead, rule fixture. Queue mặc định không bị obliterate; các rule và quyền nghiệp vụ có sẵn được giữ nguyên.

File bổ sung/chỉnh thêm ở lượt nghiệm thu:
- apps/api/src/integration/automation-engine.integration.ts: fixture quyền chương trình và quyền đọc sinh viên, assertion quyền sau chuyển đổi.
- apps/api/src/integration/automation-assignment-live.integration.ts: nghiệm thu backend/browser với fixture local, hỗ trợ dịch vụ hiện có qua ASSIGNMENT_USE_EXISTING_CRM=true.
- apps/web/tests/automation-assignment-live.browser.mjs: login, monitoring, nguồn rule, mobile/desktop, chạy thử và trạng thái dirty.
- apps/web/src/modules/automations/pages/automation-builder-canvas.tsx và automation-builder-page.tsx: sửa đánh dấu dirty khi đo node.
- apps/api/package.json: lệnh test:integration:automation-assignment-live.

Lệnh nghiệm thu trực tiếp dịch vụ đang chạy (PowerShell, tại apps/api):

```powershell
$env:ASSIGNMENT_USE_EXISTING_CRM='true'
npm run test:integration:automation-assignment-live
```

Tài khoản/mật khẩu fixture được tạo ngẫu nhiên trong mỗi lượt, truyền nội bộ qua môi trường browser con và xóa sau test; không lưu vào artifact.

Kiểm tra cuối: typecheck API/web, build web, suite automation-engine và automation-assignment-conflict đều PASS; React Doctor 100/100. Sau nghiệm thu trực tiếp: worker mới còn chạy, queue không bị pause và không có job active/waiting/delayed; không còn user, role, lead, rule hoặc source fixture của các lượt nghiệm thu.
