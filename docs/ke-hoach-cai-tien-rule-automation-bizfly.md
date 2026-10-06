# Kế hoạch cải tiến Rule Automation theo hướng Bizfly CRM

## 1. Mục tiêu sản phẩm

Xây dựng Automation thành nền tảng workflow dùng chung cho CRM Marketing, Sale, Tuyển sinh và Sinh viên, với trải nghiệm block-based tương tự Bizfly CRM nhưng ưu tiên nghiệp vụ tuyển sinh.

Kết quả mục tiêu:

- Người quản trị tạo luồng theo mô hình Trigger → Điều kiện/Thời gian → Hành động.
- Hỗ trợ phân công cố định, round-robin và theo team/phòng ban.
- Hỗ trợ task/reminder, thông báo nội bộ, Email, ZNS/SMS và webhook.
- Có chạy hàng loạt trên dữ liệu cũ, dry-run, lịch sử thực thi, retry và replay.
- Mọi execution tuân thủ Authentication + Permission + Scope và giữ audit đầy đủ.

Không đưa AI Agent, loyalty, voucher hoặc lead scoring dự đoán vào bản đầu tiên.

## 2. Nguyên tắc kiến trúc

Automation Core là một module sâu với interface nhỏ:

```ts
publishAutomationEvent(event)
validateAutomationRule(rule, actor)
startAutomationRun(request)
```

Các module nghiệp vụ chỉ phát sự kiện chuẩn hóa, không biết BullMQ, graph hay action cụ thể. Automation Worker gọi action qua Action Registry; mỗi action adapter phải tái sử dụng mutation nghiệp vụ hiện có để giữ permission, scope, activity và audit.

Các interface nội bộ chính:

- `TriggerRegistry`: định nghĩa event và schema payload.
- `FieldRegistry`: cung cấp trường dùng cho condition/template theo entity.
- `ActionRegistry`: định nghĩa cấu hình, permission và executor của action.
- `ExecutionAuthorization`: xác định execution actor và scope tại thời điểm chạy.
- `AssignmentStrategy`: fixed, round-robin, least-loaded và team-based.
- `MessageAdapter`: notification, email, ZNS, SMS.

## 3. Danh mục chức năng mục tiêu

### Trigger

- Lead được tạo, phân công, thu hồi, đổi pipeline, cập nhật trường hoặc quá SLA.
- Marketing form được gửi và webhook/integration tạo Lead.
- Hồ sơ tuyển sinh được tạo, đổi trạng thái, thiếu tài liệu hoặc được duyệt.
- Đến hạn reminder, lịch hàng ngày/tuần và thời điểm tương đối so với một ngày dữ liệu.
- Sinh viên được tạo hoặc dịch vụ sinh viên đổi trạng thái.
- Chạy thủ công một bản ghi hoặc chạy hàng loạt theo danh sách/bộ lọc.

### Condition

- Equals, not equals, contains, not contains, exists, empty.
- Greater/less than, before/after, in/not in.
- AND/OR group lồng nhau.
- Điều kiện thời gian, tag, nguồn Lead, chương trình, pipeline, assignee và custom field.
- Chỉ cho dùng trường nhạy cảm khi người cấu hình có permission tương ứng.

### Action

- Cập nhật trường, pipeline, trạng thái, tag và ghi hoạt động.
- Phân công cố định, round-robin, least-loaded hoặc theo team/phòng ban.
- Tạo reminder/task và cảnh báo SLA.
- Gửi notification, Email, ZNS/SMS qua adapter.
- Tạo/cập nhật hồ sơ tuyển sinh, cảnh báo thiếu tài liệu và chuyển đổi thành sinh viên qua mutation nghiệp vụ được phép.
- Gọi webhook có allowlist, timeout, retry và secret được mã hóa.
- Delay, business-hours delay và stop workflow.

## 4. Các giai đoạn triển khai

### Giai đoạn 0 — Regression baseline

Thời lượng dự kiến: 2–3 ngày.

- Bổ sung test cho trigger production, scope chương trình, dữ liệu nhạy cảm và execution actor.
- Ghi nhận baseline typecheck, build, unit/integration test và React Doctor.
- Đóng băng việc thêm action mới cho đến khi hoàn thành giai đoạn 1.

Điều kiện hoàn thành: các lỗi đã phát hiện có test đỏ tái hiện được.

### Giai đoạn 1 — Security và execution correctness

Thời lượng dự kiến: 4–6 ngày.

- Bắt buộc chọn chương trình khi tạo rule; global rule cần `automation.manage_global` và scope `ALL`.
- Tách `requested_by` khỏi `execution_actor_id`; execution actor mặc định là owner của rule và được tái kiểm tra quyền khi chạy.
- Sửa actor/context cho bulk assignment, Zalo, webhook và marketing form.
- Lấy program từ entity trong database, không tin program do caller truyền.
- Mask phone/email nếu thiếu permission xem dữ liệu nhạy cảm.
- Một rule lỗi không được ngăn các rule khác khởi chạy.
- Archive rule thay vì xóa cascade lịch sử.

Điều kiện hoàn thành: permission/scope matrix và toàn bộ trigger hiện có đều qua integration test.

### Giai đoạn 2 — Registry và builder thế hệ 2

Thời lượng dự kiến: 7–10 ngày.

- Tách Trigger, Field và Action Registry khỏi switch lớn trong engine/UI.
- Registry trả schema cấu hình và metadata để frontend render properties panel theo action.
- Thêm condition group AND/OR và các operator theo data type.
- Semantic validation kiểm tra assignee, role, stage, field, template token và permission trước khi activate.
- Thêm template rule, duplicate rule và cảnh báo unsaved changes.
- Hỗ trợ thêm node bằng menu/keyboard bên cạnh drag-and-drop.

Điều kiện hoàn thành: thêm một action mới chỉ cần đăng ký backend, contract và UI editor tương ứng; không sửa orchestrator.

### Giai đoạn 3 — Bizfly parity cho Sale operations

Thời lượng dự kiến: 7–10 ngày.

Trạng thái triển khai: hoàn thành lõi chức năng ngày 05/10/2026. Đã có chia Lead theo danh sách nhân viên hoặc team/phòng ban, round-robin và least-loaded, reminder, quét SLA có phục hồi/idempotency, dry-run theo danh sách khách hàng, cố định tập Lead trước khi chạy bulk, worker có rate limit và UI theo dõi tiến độ. Integration test cần Redis cục bộ hoạt động để xác nhận toàn bộ luồng queue.

- Round-robin theo danh sách nhân viên hoặc team.
- Cursor phân công được khóa bằng transaction/row lock để tránh hai Lead nhận sai vòng.
- Least-loaded tùy chọn dựa trên số Lead active được phân công.
- Action tạo reminder/task và cảnh báo quá SLA.
- Trigger Lead không được xử lý sau N phút/giờ.
- Chạy hàng loạt theo danh sách Lead hoặc bộ lọc đã lưu.
- Dry-run trả số bản ghi khớp và action dự kiến mà không mutation.
- Rate limit và progress cho bulk run.

Điều kiện hoàn thành: thực hiện được kịch bản chính thức kiểu Bizfly “Lead mới có số điện thoại → chia đều nhân viên → gán team”.

### Giai đoạn 4 — Đa kênh và scheduling

Thời lượng dự kiến: 8–12 ngày, phụ thuộc provider.

Trạng thái triển khai: hoàn thành lõi chức năng ngày 05/10/2026. Automation worker đã được tách bằng process role và script `worker:automation`; scheduler hỗ trợ múi giờ, ngày trong tuần và ngày nghỉ loại trừ; Email/SMS/ZNS dùng adapter provider có idempotency key, consent/opt-out và suppression; webhook dùng endpoint được duyệt, HTTPS allowlist, chữ ký HMAC, secret AES-GCM và giới hạn payload. Builder đã có node đa kênh/webhook, cấu hình lịch và bản xem trước template không tải dữ liệu Lead thật. Việc xác nhận end-to-end với provider thật cần cấu hình biến môi trường và Redis/PostgreSQL của môi trường triển khai.

- Tách automation worker khỏi lifecycle API.
- Scheduler tạo execution theo timezone và business calendar.
- Message adapter cho notification, Email, ZNS và SMS.
- Template preview, biến dữ liệu, consent/opt-out và suppression list.
- Webhook action có signature, secret encryption, allowlist và giới hạn payload.
- Retry theo lỗi tạm thời; lỗi cấu hình hoặc permission là unrecoverable.

Điều kiện hoàn thành: gửi được chuỗi chăm sóc theo delay/lịch mà không làm lộ dữ liệu nhạy cảm và không gửi trùng.

### Giai đoạn 5 — Admission-native automation

Thời lượng dự kiến: 7–10 ngày.

Trạng thái triển khai: hoàn thành lõi chức năng ngày 06/10/2026. Đã có trigger theo vòng đời hồ sơ tuyển sinh và sinh viên, quét hồ sơ sắp hết hạn có idempotency/phục hồi lỗi enqueue, action tạo hồ sơ, yêu cầu tài liệu, cập nhật trạng thái và chuyển đổi sinh viên bằng use case nghiệp vụ hiện có. Builder có dữ liệu ngành, trạng thái, lớp và các rule mẫu theo hành trình tuyển sinh; chuỗi trigger giữ causation để ngăn vòng lặp nhưng vẫn cho phép rule hạ nguồn chạy. Integration test cần PostgreSQL và Redis cục bộ hoạt động để xác nhận toàn bộ luồng queue.

- Trigger hồ sơ được tạo, đổi trạng thái, thiếu tài liệu, sắp hết hạn và được duyệt.
- Action tạo hồ sơ, yêu cầu tài liệu, cập nhật trạng thái và thông báo chuyên viên.
- Action chuyển Lead thành sinh viên chỉ gọi conversion use case hiện có và phải thỏa điều kiện hồ sơ.
- Template theo ngành/chương trình tuyển sinh.
- Bộ rule mẫu: nhắc bổ sung hồ sơ, nhắc phí, follow-up Lead, nhập học và hỗ trợ sinh viên.

Điều kiện hoàn thành: triển khai được hành trình Lead → Hồ sơ → Nhập học mà không hardcode pipeline/status.

### Giai đoạn 6 — Quan sát, quản trị và tối ưu

Thời lượng dự kiến: 5–7 ngày.

- UI lịch sử execution và node, filter server-side, retry/replay có xác nhận.
- Metrics queue depth, latency, throughput, failure rate và tỷ lệ thành công theo rule.
- Dashboard hiệu quả rule gắn với chỉ số nghiệp vụ, không chỉ số lần chạy.
- Phát hiện execution kẹt, dead-letter và công cụ recovery.
- Version compare, rollback và chuyển owner rule.
- Retention policy cho context/error có redaction dữ liệu nhạy cảm.

Điều kiện hoàn thành: quản trị viên có thể xác định rule lỗi, nguyên nhân, phạm vi ảnh hưởng và phương án phục hồi từ UI.

## 5. Thay đổi dữ liệu dự kiến

- Mở rộng `automation_rules`: owner, archived, scope type và lifecycle status.
- Mở rộng `automation_execution_logs`: event id, entity type/id, execution actor, correlation id và retry/replay source.
- Mở rộng node execution: input/output đã redaction và provider delivery id.
- Thêm event inbox/outbox để phát event sau transaction an toàn và chống mất event.
- Thêm assignment cursor theo rule/team/program.
- Thêm schedule definition và bulk-run progress.
- Không dùng `automation_jobs` song song với BullMQ nếu không định nghĩa rõ đây là persistence layer hay chỉ health projection.

## 6. Permission đề xuất

- `automation.view`
- `automation.create`
- `automation.update`
- `automation.activate`
- `automation.run`
- `automation.run_bulk`
- `automation.retry`
- `automation.view_logs`
- `automation.manage_global`
- `automation.transfer_owner`

Permission cấu hình rule không thay thế permission của action. Ví dụ action phân công vẫn yêu cầu `lead.assign`; chuyển sinh viên vẫn yêu cầu `student.create_from_admission`.

## 7. Chiến lược phát hành

- Release A: giai đoạn 0–1; sửa nền bảo mật và độ đúng.
- Release B: giai đoạn 2–3; đạt parity cốt lõi với Bizfly trong Sale automation.
- Release C: giai đoạn 4; đa kênh và lịch trình.
- Release D: giai đoạn 5–6; khác biệt hóa theo tuyển sinh và hoàn thiện vận hành.

Mỗi release bật bằng feature flag, chạy canary theo chương trình tuyển sinh, theo dõi lỗi ít nhất một chu kỳ nghiệp vụ trước khi mở rộng.

## 8. Ước lượng tổng thể

Một nhóm gồm 1 backend, 1 frontend và QA bán thời gian có thể hoàn thành nền tảng cốt lõi qua Release B trong khoảng 5–7 tuần. Toàn bộ Release A–D dự kiến 10–14 tuần, phụ thuộc Email/ZNS/SMS provider và mức độ hoàn thiện nghiệp vụ tuyển sinh.
