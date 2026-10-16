# Hợp đồng Form & Survey V1

Chốt kỹ thuật cục bộ: 15/10/2026. Đây là mô tả implementation hiện tại, không phải phê duyệt chuyển đổi dữ liệu live. Nguồn sự thật là schema Prisma, validator shared/API và các test bên dưới.

## Phiên bản và tương thích

Không có một trường `configVersion` chung trên mọi DTO. Các contract hiện có được version riêng, không thêm version giả hoặc tự nâng cấp form cũ:

| Contract | Dấu phiên bản | Hành vi legacy |
| --- | --- | --- |
| Chính sách submit | `duplicateSettings.submissionPolicyVersion: 1` | Không có `submissionMode`, hoặc mode `legacy`: đọc thành policy `null`, giữ nhánh xử lý cũ. Không áp dụng creation defaults khi đọc/sửa/copy. |
| Snapshot phản hồi | `configuration_snapshot.schemaVersion: 1` | Phản hồi thiếu snapshot hiển thị key/value thô; không lấy nhãn/mapping hiện tại để giả tạo lịch sử. |
| Trang/nhóm | `displaySettings.surveyLayout.version: 1` | Thiếu layout được hiểu là một trang mặc định; layout có version sai bị từ chối. |
| Nhúng iframe | `protocol: admission-crm.form-embed`, `version: 1` | Iframe tĩnh không snippet vẫn dùng được, không tự điều hướng landing page. |

Snapshot mới giữ câu hỏi, nhãn/giá trị lựa chọn, mapping, rules, default, chương trình, layout, chính sách và receipt. `configurationVersion` là hash SHA-256 của snapshot tại lúc gửi, không phải số phiên bản migration hay cờ cấp quyền. Form được khóa khi kiểm tra/lưu phản hồi để snapshot và đáp án thuộc cùng cấu hình đã commit. Không backfill snapshot giả cho phản hồi cũ.

## Chương trình, quyền và danh mục

- `marketing_forms.institution_program_id` là chương trình trực tiếp, campaign chỉ là liên kết tùy chọn. Form mới lấy chương trình từ context đã xác thực và kiểm tra membership; mọi read/write/options/submissions/report/export còn áp dụng quyền và scope tương ứng.
- Public khóa chương trình theo form phía server; payload/header không được chuyển sang chương trình khác. Form thiếu chương trình không được mở public config (404) và submit/webhook bị từ chối trước tạo receipt/Lead (403). Không tự lấy chương trình người đăng nhập hoặc campaign khi submit để chữa dữ liệu legacy.
- Ngành/nguồn phải tồn tại và thuộc chương trình hoặc danh mục dùng chung được cho phép. Danh sách tham chiếu có search/pagination server-side; không kéo toàn bộ CRM về trình duyệt.
- Lịch sử/giải quyết phản hồi cần quyền Form lẫn quyền Lead tương ứng và scope giao nhau. Permission rộng không được dùng để bỏ qua assigned/owned scope. Chỉ `READ_ONLY` không cho phép giải quyết phản hồi. Public receipt không có Lead ID hoặc chi tiết kết quả trùng.

## Câu hỏi, lựa chọn và mapping

- Option chuẩn `{ value, label }`. Adapter string cũ trả `{ value: oldString, label: oldString }`, không đổi đáp án đã lưu hoặc ID dependency. Đổi nhãn không đổi value; lựa chọn mới dùng value độc lập.
- Không suy luận mapping từ `fieldKey`/nhãn. Chỉ mapping thuộc allowlist; không cho public cấu hình bảng/cột SQL tùy ý. Field mapping là nguồn chính khi full save; xóa field/bỏ mapping dọn mapping legacy trong cùng transaction.
- Draft cho phép thiếu contact mapping; publish kiểm tra cấu hình hoàn chỉnh theo submit mode. Các metadata cấu hình như layout/visibility/rating/Khác sai vẫn bị chặn ở draft. Publish và mutation của form published kiểm tra toàn cấu hình, rollback khi sai. Submit kiểm tra lại phía server.
- Đáp án chọn nhiều là mảng string; scalar không tự ép từ object/array. Rating là số nguyên 1..max theo rules, không mapping CRM. Khác V1 cho chọn một là `{ kind: "other", text }` có text không trắng, tối đa 1.000 ký tự; không mapping CRM. Sentinel UI không phải đáp án thường.
- Visibility dùng allowlist toán tử và chống vòng lặp; ẩn câu hỏi thì bỏ required và loại đáp án cũ khỏi payload. Mô tả render như văn bản, không chạy HTML. Preview và public dùng chung renderer/validator; preview không gọi public mutation.

## Submit, duplicate và assignment

- Form mới: `survey` mặc định `survey_only`; `lead_form` mặc định `create_lead`. Không dùng defaults này để âm thầm đổi legacy.
- `survey_only`: chỉ lưu câu trả lời, không tạo/cập nhật Lead dù có mapping contact.
- `create_lead`: tạo khi không trùng, liên kết/ghi nhận khi trùng theo nhánh policy, không ghi đè Lead cũ.
- `upsert_lead`: match trong chương trình; mặc định chỉ bổ sung chỗ trống. `overwrite_selected` chỉ được ghi các trường allowlist trong `marketingFormUpdateFields`; không ghi Sale/chương trình/quyền/trạng thái tuyển sinh.
- Trùng điện thoại/email ở chương trình khác không được liên kết; nhiều Lead khớp trong chương trình thì `needs_review`, không chọn bản ghi đầu tùy tiện. Legacy vẫn giữ các setting duplicate/action cũ theo nhánh tương thích; thay sang mode rõ ràng là thao tác riêng cần chủ form xác nhận.
- Idempotency key có phạm vi form; cùng key/nội dung canonical trả receipt cũ; đổi nội dung cùng key trả 409. Khóa form và chương trình bảo vệ concurrent submit. Khách chủ động gửi phản hồi mới dùng key mới. Lỗi validation có thể tạo receipt `failed`; form thiếu chương trình bị chặn trước bước đó.
- Mode mới không tự gán creator thành Sale; automation assignment qua use case hiện có, kiểm tra actor/candidate và không mặc định chia lại Lead đang có Sale. Legacy không bị chuyển mode âm thầm.
- Event `form_submitted`/`survey_completed` dùng submission ID ổn định, outbox cùng transaction khi có rule đăng ký; dispatch sau commit, recovery/retry giữ semantics một lần cho action đã hoàn tất. Không tạo engine thứ hai. Không có Lead thì chỉ chạy action tương thích.

## URL và dữ liệu cũ

- Đổi tên mà không gửi slug mới giữ nguyên slug, kể cả slug `null`. Slug chỉ đổi khi gửi giá trị mới rõ ràng; public key không đổi khi update. Không đổi khóa/link chỉ để đồng nhất tên form.
- Update builder không sửa phản hồi cũ, answers string hoặc snapshot đã nhận. Copy là form mới với identity mới; không được hiểu là thay identity form gốc.
- Form thiếu chương trình vẫn giữ slug/public key và lịch sử trong database; không xóa để tạm dừng. Khôi phục cần quy trình có phê duyệt trong [runbook G0/G1](marketing-form-g0-g1-rollout.md).

## Bằng chứng và phạm vi nghiệm thu

- `marketing-form-baseline.integration.ts`: dry-run trước/sau cột nullable bằng temp table, phân loại/cursor, CLI gate, hai user Sale fixture/two programs/same phone, quyền thiếu/read-only, assigned scope, bảo toàn URL/null slug/historic row/string answer và snapshot mới.
- `marketing-form-program-scope.integration.ts`: CRUD/field/options/submissions/custom fields, form không campaign, duplicate cùng/khác chương trình và chống program override.
- `marketing-form-management.integration.ts`: HTTP app thật/JWT thật, route chuẩn/alias, sửa header/direct URL và validation/rollback. Ma trận Sale trong baseline là service test với `AuthUser` fixture, không phải phiên đăng nhập Sale thật.
- Config/layout/visibility/snapshot unit, submission-policy unit/integration, Web cache/leave tests và browser G4/G5/G6 bổ sung chứng cứ. Không dùng unit SSR thay cho browser smoke hoặc fixture thay cho nghiệm thu production.
- Web typecheck baseline còn 24 diagnostic ngoài G4; React Doctor diff gần nhất 80/100 với warning baseline toggle/toggle-group. Không tuyên bố toàn repo sạch lỗi. Checklist rollout/phê duyệt môi trường thật nằm riêng trong runbook.
