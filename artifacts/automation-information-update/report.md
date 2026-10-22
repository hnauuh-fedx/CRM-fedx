# Triển khai node Cập nhật thông tin

Ngày thực hiện: 21/10/2026.

Đã bổ sung `action_update_information` vào registry, bảng cấu hình và bộ thực thi Automation hiện có. Không thêm dependency hoặc migration cho tính năng này.

Trạng thái hiện tại: **đã hoàn thành triển khai và nghiệm thu local**, gồm giao diện ứng dụng thật, các router xác thực/Automation, PostgreSQL và Redis worker. Hai điểm chặn frontend/database đã được xử lý.

## Chức năng

- Cập nhật Lead đang đi qua node; tối đa 200 dòng, không chọn trùng trường.
- Thao tác gán giá trị cố định hoặc xóa giá trị. Trường bắt buộc không được xóa.
- Danh mục đầy đủ 79 trường hệ thống: 71 trường cập nhật trực tiếp và 8 trường hiển thị lý do/hướng dẫn theo quy trình riêng khi có đầy đủ quyền. Bao gồm thông tin cơ bản, học vấn, địa chỉ, công việc, hai người thân, hồ sơ tuyển sinh, nguồn, ngành, điểm Lead và phân loại.
- Trường tùy chỉnh: đủ 12 kiểu TEXT, TEXTAREA, NUMBER, BOOLEAN, DATE, DATETIME, EMAIL, PHONE, SELECT, MULTI_SELECT, PROVINCE và FILE, theo phạm vi và quyền thực tế.
- Danh sách tỉnh tùy chỉnh dùng chung danh mục với các form CRM. FILE nhận liên kết HTTP/HTTPS tới tệp đã lưu trữ; không nhúng tệp base64 vào cấu hình rule. Tags và số điện thoại phụ nhập mỗi dòng một giá trị.
- Ô nhập theo kiểu dữ liệu; lựa chọn nhiều thay thế toàn bộ danh sách hiện tại. Khi đổi trường, giá trị cũ bị loại bỏ.
- Tái sử dụng bộ chọn trường có tìm kiếm, phân nhóm, nhãn trợ năng và giao diện tiếng Việt.
- Kiểm tra cấu hình khi lưu qua PATCH, kiểm tra rule trước khi kích hoạt và kiểm tra lại quyền/giá trị khi thực thi. Quy trình tạo bản nháp ban đầu của hệ thống được giữ nguyên.

### Danh mục hệ thống sau mở rộng

| Nhóm | Số trường |
| --- | ---: |
| Thông tin cơ bản, nguồn tiếp cận, điện thoại phụ, điểm và phân công | 20 |
| Học vấn và tốt nghiệp | 11 |
| Địa chỉ và công việc hiện nay | 9 |
| Hai người thân đại diện | 10 |
| Thông tin tuyển sinh | 23 |
| Chăm sóc và phân loại | 5 |
| Chương trình tuyển sinh | 1 |
| **Tổng** | **79** |

Trường tùy chỉnh được bổ sung động bên cạnh 79 trường hệ thống. Danh mục tuân thủ quyền dữ liệu nhạy cảm, quyền sửa tuyển sinh và chương trình đang chọn; không cấp thêm quyền cho tài khoản hiện tại.

## Tính toàn vẹn và quyền

- Kiểm tra cả quyền cập nhật, phạm vi xem, phạm vi ghi và chương trình của Lead.
- Lead đã nhập học yêu cầu thêm quyền cập nhật sinh viên.
- Trường nhạy cảm hệ thống yêu cầu quyền xem dữ liệu nhạy cảm; trường tùy chỉnh nhạy cảm yêu cầu quyền xem và sửa tương ứng.
- Mã Lead, chương trình, Sale chính/phụ, giai đoạn, trạng thái tuyển sinh, lệ phí và học phí được hiển thị kèm hướng dẫn thao tác phù hợp và không cho ghi trực tiếp bằng node này. Các ID nội bộ không phải trường cập nhật của form.
- Các trường tuyển sinh yêu cầu thêm `admission.update`; thiếu quyền sẽ hiển thị lý do. Số trường có thể sửa phụ thuộc quyền, chương trình và trường tùy chỉnh đang hoạt động.
- Các bộ ghi riêng của Student, Admission và Campaign chỉ cập nhật cột được chọn; giữ nguyên phần địa chỉ, người thân, hồ sơ và tracking khác. Tạo người thân mới phải có họ tên.
- Chặn điện thoại trùng với số chính hoặc số phụ của Lead khác trong cùng chương trình.
- Cập nhật dữ liệu, hoạt động, audit và checkpoint action trong cùng transaction.
- Khóa transaction theo node execution và Lead; bảo vệ checkpoint khi worker nhận đồng thời nhiều lượt giao việc.
- Retry dùng lại checkpoint đã hoàn tất. Không thay đổi dữ liệu thì ghi trạng thái “Không có thay đổi” trong lịch sử chạy thử và giám sát, không tạo thêm activity/audit. Khôi phục lượt chạy nhận diện checkpoint này để không thực thi lại.
- Audit che giá trị nhạy cảm. Không phát thêm sự kiện cập nhật tổng quát; các trigger hiện có được giữ nguyên.

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| Typecheck API | PASS |
| Typecheck toàn module Automation web | PASS |
| Typecheck toàn bộ web | PASS |
| Unit tests Automation | 98/98 PASS |
| Integration PostgreSQL cô lập | PASS |
| Build và browser smoke test editor thật | PASS |
| React Doctor, gồm file mới | 100/100; không có vấn đề |
| Build toàn ứng dụng web | PASS; còn cảnh báo kích thước bundle đã có |
| Nghiệm thu local qua đăng nhập, UI, API và Redis worker | PASS |

Integration kiểm tra: cập nhật nhiều trường, số 0, boolean false, xóa giá trị, không thay đổi, audit nhạy cảm, quyền ghi, phạm vi chương trình, trường ngừng hoạt động, trường khác chương trình, trường bắt buộc, lựa chọn hết hiệu lực, ngày không hợp lệ, điện thoại trùng, rollback sau khi ghi dữ liệu, lưu/mở lại cấu hình, thực thi đồng thời và retry.

Đợt mở rộng toàn bộ trường đã kiểm tra 79 trường hệ thống có mặt trong danh mục, chặn ghi cả 8 trường quản lý riêng, ghi đồng thời 83 trường (71 hệ thống + 12 tùy chỉnh) trong fixture đầy đủ quyền và chạy lại không phát sinh thay đổi. Kiểm tra riêng cập nhật phường/nghề nghiệp người thân/mã đào tạo giữ nguyên tỉnh, họ tên người thân và mã lớp. Đã sửa so sánh tệp JSONB để thứ tự khóa không gây ghi lại/audit thừa.

Browser smoke test dùng component editor thật trong harness riêng: tìm trường, chống trùng, đổi trường xóa giá trị cũ, số/boolean, nhiều lựa chọn, xóa giá trị, ô ngày, lưu/mở lại trong harness, xóa dòng, bàn phím và kiểm tra không tràn ngang ở 1440/390/375px. Ảnh: [mobile.png](mobile.png).

Browser đã kiểm tra bổ sung danh sách nhiều dòng, URL tệp, ngày giờ có múi giờ, chọn tỉnh và lý do trường không cho chọn. Nghiệm thu local qua API/Redis còn cập nhật trường THPT và địa chỉ, chạy lại không đổi, và tìm nhóm người thân trên builder thật. Tài khoản nghiệm thu không có quyền sửa tuyển sinh nên ảnh builder thể hiện thêm trường bị giới hạn quyền; đây là hành vi theo quyền thực tế.

Đã sửa lỗi merge còn sót ở dashboard: bỏ dấu conflict và hàm `DirectorDashboardSkeleton` không còn được gọi; giữ nguyên `PageLoadingState` đang sử dụng. Typecheck và build toàn web đã qua.

Database CRM local `crm_db` trên `localhost:5432` đã được sao lưu đầy đủ trước thay đổi bằng pg_dump 18 tại `C:\Users\Admin\AppData\Local\Temp\admission-crm-backups\crm_db-1792551012008.dump` (381.280 byte). Sau khi xác nhận không có ánh xạ vai trò mơ hồ, đã áp dụng các migration có sẵn:

- `database/migrations/20261012_add_user_program_roles.sql`, qua maintenance runner của dự án.
- `20261016090000_add_lead_secondary_phones` và `20261016100000_add_lead_secondary_assignee`, qua Prisma migrate deploy.

46 ánh xạ người dùng/chương trình đã được chuyển đầy đủ; số ánh xạ cũ chưa chuyển là 0. Prisma migrate status xác nhận không còn migration chờ. Các chênh lệch schema không liên quan (một số tên/index, default và FK của module khác) được ghi trong `schema-after.sql` và không áp dụng tự động. Hai file `schema-before.sql`/`schema-after.sql` chỉ là kết quả chẩn đoán, không phải migration để chạy.

Bài nghiệm thu local mới đã kiểm tra:

- Phiên đăng nhập thật và quyền truy cập API; danh mục trường hệ thống/tùy chỉnh.
- Lưu cấu hình qua API, cập nhật lead và trường số tùy chỉnh bằng Redis worker thật.
- Node tiếp theo chạy sau cập nhật; lượt chạy lại nhận `completed_no_change` và không thêm audit cập nhật.
- Giao diện frontend đầy đủ được build từ mã nguồn hiện tại: đăng nhập, sửa node, lưu, reload, chạy thử hai lần và hiển thị “Không có thay đổi”. Ảnh: [live-builder.png](live-builder.png).
- Thu hồi quyền cập nhật thì API từ chối lần chạy tiếp theo; cấu hình xóa trường bắt buộc bị từ chối.
- Dùng queue riêng và fixture riêng. Đã kiểm tra sau cleanup: không còn user, role, lead hay rule của bài nghiệm thu. Không khởi động worker mạng xã hội hoặc tích hợp ngoài trong bài kiểm tra này.

Kiểm thử PostgreSQL cô lập và browser harness riêng từ giai đoạn trước vẫn được giữ để kiểm tra hồi quy chi tiết.

## Các file chính

- `packages/shared/src/automation-information-update.ts`: hợp đồng Zod, kiểu dữ liệu và validation theo kiểu trường.
- `apps/api/src/modules/leads/lead-information-update.service.ts`: danh mục trường được sửa, kiểm tra quyền/phạm vi và cập nhật transaction.
- `apps/api/src/modules/leads/lead-custom-fields.service.ts`: cho phép đọc định nghĩa trường trong transaction.
- `apps/api/src/modules/leads/sale-custom-fields.service.ts`: hỗ trợ bỏ qua giá trị không đổi và trả danh sách trường thay đổi.
- `apps/api/src/modules/automations/automation-{registry,action-registry,semantic.validator,engine.service}.ts`: đăng ký, validation, thực thi và checkpoint.
- `apps/api/src/modules/automations/automation-{execution.types,execution-state,observability}.ts`: trạng thái không thay đổi, retry và khôi phục lượt chạy.
- `apps/api/src/modules/automations/automation.service.ts`, `automations.router.ts`, `automation.types.ts`: options, lưu cấu hình và lỗi tiếng Việt.
- `apps/web/src/modules/automations/pages/builder/information-update-fields.tsx`: editor nhiều dòng và input theo kiểu dữ liệu.
- `apps/web/src/modules/automations/pages/builder/{automation-field-picker,node-properties-panel}.tsx`: tích hợp và nhãn trợ năng.
- `apps/web/src/modules/automations/pages/automation-builder-canvas.tsx`: ID dòng riêng cho từng node mới.
- `apps/web/src/modules/automations/pages/automation-monitoring-page.tsx`, `pages/builder/automation-test-run-dialog.tsx`: hiển thị trạng thái “Không có thay đổi”.
- `apps/web/src/modules/automations/automation.types.ts`: hợp đồng frontend.
- `apps/api/src/modules/automations/automation-information-update.test.ts`, `automation-semantic.validator.test.ts`, `automation-registry.test.ts`: kiểm thử cấu hình và registry.
- `apps/api/src/integration/automation-information-update.integration.ts`: kiểm thử dữ liệu và executor thật.
- `apps/api/src/integration/automation-information-live.integration.ts`, `apps/web/tests/automation-information-live.browser.mjs`: nghiệm thu local với router, session, frontend và Redis worker thật.
- `apps/web/src/modules/dashboard/pages/director-dashboard-page.tsx`: xử lý phần merge thừa đang chặn build.
- `apps/api/scripts/test-manual-unassignment-isolated.cjs`: fixture và log riêng cho integration mới.
- `apps/web/tests/automation-information*`: harness và browser smoke test.
- `apps/web/tsconfig.automation-check.json`, các `package.json` liên quan: lệnh kiểm chứng và export dùng chung.

## Chạy lại kiểm tra

Các file bổ sung/thay đổi chính của đợt mở rộng: `lead-information-field-catalog.ts`, `lead-information-update.service.ts`, `candidate-profile.service.ts`, `admission-profile-write.service.ts`, `lead-attribution.service.ts`, `sale-custom-fields.service.ts`, shared `automation-information-update.ts` và `vietnam-provinces.ts`, web `information-update-fields.tsx`, `automation-field-picker.tsx`, cùng các test tích hợp/browser nêu trên. Không cần migration cho đợt mở rộng.

```powershell
npm run typecheck --workspace apps/api
npm run typecheck --workspace apps/web
npm run typecheck:automation --workspace apps/web
npm run test:automation --workspace apps/api
npm run test:integration:automation-information-update --workspace apps/api
npm run test:integration:automation-information-live --workspace apps/api
npm run test:automation-information-browser --workspace apps/web
```

Trong `apps/web`:

```powershell
npx react-doctor@latest --verbose --scope changed --base HEAD --include-untracked
```

Chưa commit, deploy hoặc thay đổi cấu hình BizCRM bên ngoài. Phiên bản hiện tại đã sẵn sàng sử dụng/thử nghiệm trên môi trường local đã đồng bộ. Các thao tác công thức, lấy giá trị từ trường khác, nối chuỗi và cộng/trừ chưa thuộc phiên bản này.
