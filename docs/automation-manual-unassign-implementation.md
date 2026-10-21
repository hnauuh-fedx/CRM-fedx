# Kế hoạch: tự chia lại lead khi bỏ Sale thủ công

Ngày: 2026-10-16. Trạng thái: đã triển khai, áp migration lên database CRM local theo yêu cầu tiếp theo của người dùng và kiểm thử thành công.

## 1. Mục tiêu và phạm vi đã chốt

Khi người có quyền bỏ Sale khỏi lead và lưu thành công, hệ thống phát sự kiện `lead_unassigned`. Rule đang bật, đúng trigger và chương trình sẽ chạy để chia lại lead còn trống Sale. Luồng chuyển Sale vì chưa mở lead quá hạn tiếp tục hoạt động theo chính sách hiện có.

Chỉ triển khai phương án tự động. Không bổ sung màn hình chạy rule hàng loạt thủ công, cờ tạm dừng phân công, polling toàn bộ lead hoặc thời gian chờ mặc định trong đợt này. Tái sử dụng node delay nếu người cấu hình cần thời gian chờ.

### Hành vi bắt buộc

| Tình huống | Kết quả |
| --- | --- |
| Người dùng đổi Sale A thành trống rồi lưu | Một sự kiện bỏ Sale thủ công được ghi nhận sau khi mutation commit; rule phù hợp có thể chia lại |
| Lead vốn trống, lưu lại vẫn trống | Không phát thêm sự kiện bỏ Sale |
| Người dùng đổi trực tiếp A sang B | Không chạy nhánh bỏ Sale thủ công |
| Không có rule phù hợp, rule tắt hoặc đã lưu trữ | Lead vẫn trống |
| Đã có Sale khác trước khi node phân công chạy | Bỏ qua phân công, không ghi đè, không tiến con trỏ và không tạo monitor mới |
| Chia lại thành công | Tạo assignment mới, activity, audit, notification; tạo monitor mới nếu node bật chính sách chuyển Sale |
| Assignment cũ có job cảnh báo/hết hạn đang chờ | Job cũ không được tác động đến assignment mới |
| Sale chưa mở lead và hết hạn | Luồng monitor hiện có chuyển Sale, giữ nguyên số lần chuyển và giới hạn vòng |
| Sale đã mở lead đúng thời điểm theo logic hiện có | Monitor không chuyển Sale do tiêu chí chưa mở lead |

### Hai loại bộ đếm cần phân biệt

- Con trỏ round-robin thuộc cặp `ruleId + nodeId`, dùng chung cho mọi lead đi qua node đó. Không reset khi bỏ Sale.
- Monitor mới sau khi bỏ Sale thủ công bắt đầu lại thời gian chờ, số lần chuyển và số vòng theo chính sách node. Không sửa lịch sử monitor cũ để tái sử dụng.
- Một rule `lead_unassigned` riêng có con trỏ riêng, không tự kế thừa con trỏ của rule `lead_created`. Không tự động chạy lại rule ban đầu hoặc gắn thêm trigger vào rule cũ.
- Không cam kết loại Sale vừa bị bỏ khỏi lượt phân công mới; giữ thuật toán chia vòng hiện có. Chính sách loại Sale hiện tại khi chuyển quá hạn vẫn giữ nguyên.

## 2. Quy tắc cho agent

1. Đọc `AGENTS.md`, `CODEX.md` nếu có và skills domain-workflows/access-control trước khi sửa. Nếu sửa UI, đọc thêm ui-ux-pro-max, shadcn khi áp dụng và react-doctor.
2. Kiểm tra `git status`, giữ nguyên thay đổi ngoài phạm vi. Nếu có `.codegraph/`, dùng CodeGraph trước khi tìm/đọc code; đọc trực tiếp file có cảnh báo index cũ.
3. Dùng stack hiện có, logic thuộc modules leads/automations, contract dùng chung đặt ở `packages/shared` khi cần. Không thêm dependency hoặc hạ tầng chỉ để làm tính năng này.
4. Mọi mutation phải giữ authentication, permission và scope. Không dùng role hardcode hoặc service account vượt phạm vi để ép phân công thành công.
5. Không sửa rule đang lưu trong dữ liệu thật, bật rule hàng loạt, triển khai production hay chạy migration trên dữ liệu thật. Có thể tạo fixture và kiểm thử trong môi trường local/test riêng.
6. Làm từng giai đoạn theo thứ tự dưới đây; cập nhật checklist và bằng chứng vào mục 6. Không đánh dấu hoàn thành khi chỉ có mock mà chưa kiểm tra tranh chấp transaction thực tế.

## 3. Các giai đoạn thực hiện

### Giai đoạn A — Xác minh hiện trạng

- [x] Đọc schema `apps/api/prisma/schema.prisma` và các model lead, assignment, cursor, monitor, execution/event liên quan.
- [x] Theo toàn bộ điểm bỏ Sale trong UI/API, kể cả bulk nếu đã tồn tại. Xác nhận đường nào phát `lead_unassigned`, nguồn thủ công hay hệ thống và thời điểm commit.
- [x] Kiểm tra registry/validator/builder đã hỗ trợ trigger này chưa; không xây lại khả năng đã có.
- [x] Theo `triggerAutomation`, `startAutomationExecution`, context qua queue/delay/retry, node assign/pool và luồng monitor hết hạn.
- [x] Xác định cơ chế định danh sự kiện, lưu bền/recovery và khóa lead đang có; ghi ngắn khoảng thiếu cần sửa trước khi code.

Điểm đọc ban đầu, agent phải xác nhận lại vị trí hiện tại:

- `apps/api/src/modules/leads/application/update-lead.use-case.ts`
- `apps/api/src/modules/leads/application/lead-owner-stage.use-cases.ts`
- `apps/api/src/modules/leads/application/lead-owner-stage.commands.ts`
- `apps/api/src/modules/automations/automation-engine.service.ts`
- `apps/api/src/modules/automations/automation-execution.types.ts`
- `apps/api/src/modules/automations/automation-action-registry.ts`
- `apps/api/src/modules/automations/automation-assignment.service.ts`
- `apps/api/src/modules/automations/automation-reassignment.service.ts`
- `apps/api/src/modules/automations/automation-reassignment-queue.service.ts`
- Registry, validators và các integration test automation hiện có.

### Giai đoạn B — Sự kiện bỏ Sale thủ công

- [x] Chỉ tạo sự kiện khi người dùng thực sự đổi `assigned_to` từ có giá trị sang `null` và mutation thành công.
- [x] Gắn nguồn sự kiện do server xác lập, không tin trường nguồn do client gửi. Luồng hết hạn tự chuyển Sale không được bị nhận nhầm thành bỏ Sale thủ công.
- [x] Dùng định danh ổn định cho từng lần bỏ Sale: retry cùng lần dùng cùng ID; bỏ Sale ở lần sau phải có ID mới. Không dùng riêng leadId làm khóa chống trùng.
- [x] Giữ thông tin nguồn/định danh xuyên suốt execution context và queue. Event cũ đến muộn sau một chu kỳ phân công/bỏ Sale mới phải bị nhận diện là cũ.
- [x] Bảo đảm sự kiện đã commit không bị mất khi Redis/API tạm lỗi. Ưu tiên cơ chế event lưu bền và recovery hiện có; không chỉ gọi `.catch(console.error)` rồi bỏ sự kiện. Nếu cần schema mới, chứng minh phần thiếu và dùng migration bổ sung tối thiểu, không reset database.
- [x] Không thay đổi ý nghĩa các trigger khác. Rule chỉ được chọn khi đang bật, chưa lưu trữ và đúng phạm vi chương trình.

### Giai đoạn C — Phân công an toàn và chia vòng

- [x] Tái sử dụng `assignVisibleLead`, bộ lọc Sale hợp lệ và thuật toán/con trỏ đang có.
- [x] Với execution bỏ Sale thủ công, node assign và assign-pool chỉ được phân công nếu lead vẫn trống và sự kiện còn thuộc lần bỏ Sale hiện tại.
- [x] Kiểm tra trong transaction có khóa dùng chung với các đường sửa assignment cạnh tranh; một condition node trước đó không đủ chống tranh chấp.
- [x] Kiểm tra trước khi chọn Sale/cập nhật cursor. Nếu bỏ qua phải không tạo assignment, notification hoặc monitor mới và không tiến con trỏ.
- [x] Retry sau khi action đã commit không được lặp tác dụng phụ. Hai rule/job cùng tranh một lead trống chỉ một phân công được commit; rule/job còn lại ghi rõ lý do bỏ qua. Không thêm hệ thống ưu tiên rule mới.
- [x] Khi thành công, ghi đầy đủ assignment/activity/audit/notification qua nghiệp vụ chung. Log đủ event/rule/node/execution/assignment để truy vết, không lộ dữ liệu nhạy cảm.

### Giai đoạn D — Giữ nguyên luồng chưa mở lead

- [x] Assignment bị bỏ thủ công phải mất `is_main_owner`; monitor cũ được hủy an toàn ngay hoặc bị guard hiện có vô hiệu hóa khi job chạy, có lý do truy vết.
- [x] Job cảnh báo/hết hạn cũ, kể cả đã bắt đầu chạy cùng lúc, phải kiểm tra lại assignment trong transaction trước tác dụng phụ. Không gửi cảnh báo hoặc phân công dựa trên assignment đã lỗi thời.
- [x] Phân công mới tạo monitor mới khi `reassignmentPolicy.enabled`; thời hạn tính từ `assignedAt` mới, `first_opened_at` cũ không được tính là đã mở assignment mới.
- [x] Chuyển Sale vì quá hạn không phát sự kiện bỏ Sale thủ công và không reset `reassignmentCount`, `poolCycle`, danh sách đã thử hoặc các giới hạn hiện có.
- [x] Giữ nguyên tiêu chí đã mở lead, cảnh báo, loại Sale hiện tại, số lần chuyển tối đa và tái sử dụng pool của luồng hết hạn.

### Giai đoạn E — Cấu hình và hướng dẫn dùng

- [x] Nếu trigger đã có trên UI thì tái sử dụng; chỉ bổ sung nhãn/mô tả/validator còn thiếu. UI dùng tiếng Việt và thiết kế hiện có.
- [x] Hướng dẫn cấu hình: trigger bỏ Sale thủ công → điều kiện nghiệp vụ nếu cần → chia vòng → bật chính sách chuyển Sale khi chưa mở lead nếu cần.
- [x] Nêu rõ khác biệt con trỏ giữa hai rule và việc bỏ Sale thủ công bắt đầu monitor mới. Không tự bật tính năng cho rule khác trigger.
- [x] Nếu người dùng cấu hình delay, guard transaction vẫn bắt buộc sau delay. Không thêm delay mặc định.

## 4. Kiểm thử nghiệm thu bắt buộc

Integration test dùng PostgreSQL/Redis local/test riêng, fixture cô lập, không dựa vào chờ timeout dài nếu có thể truyền thời gian như test hiện có.

| ID | Ca kiểm thử | Điều phải chứng minh |
| --- | --- | --- |
| T01 | A → trống, rule phù hợp | Chia lại đúng một lần, đủ lịch sử và monitor mới nếu bật |
| T02 | Trống → trống; A → B; transaction rollback | Không tạo sự kiện bỏ Sale mới |
| T03 | Không có rule; rule tắt/lưu trữ; khác chương trình | Không phân công bởi rule đó |
| T04 | Chạy nhiều lead qua cùng node round-robin | Tiếp tục con trỏ chung, không reset theo lead |
| T05 | Hai rule có node round-robin riêng | Con trỏ độc lập |
| T06 | Retry/recovery cùng event/job, kể cả lỗi sau commit | Không lặp assignment, notification, monitor hay tiến cursor thêm |
| T07 | Hai job hoặc hai rule đồng thời | Chỉ một phân công thắng; job bỏ qua không có tác dụng phụ |
| T08 | Gán Sale thủ công trước hoặc đồng thời với job | Không bị automation ghi đè sau đó; dữ liệu assignment nhất quán |
| T09 | Event cũ chạy sau chu kỳ gán/bỏ Sale mới | Không tiêu thụ lần bỏ Sale mới bằng event cũ |
| T10 | Bỏ Sale khi monitor cũ đang chờ/đang chạy | Monitor cũ không tác động sau khi bị vô hiệu hóa; không có hai main owner |
| T11 | Sale mới chưa mở lead đến hạn | Chuyển tiếp đúng chính sách, giữ bộ đếm của chuỗi quá hạn |
| T12 | Sale mở lead trước hạn; mở assignment cũ | Mở mới ngăn chuyển; mở cũ không ngăn monitor assignment mới |
| T13 | Hết số lần chuyển/số vòng; không còn Sale hợp lệ | Dừng đúng lý do, không tạo vòng tự chia lại vô hạn |
| T14 | Mất quyền/phạm vi, lead bị xóa, lỗi queue tạm thời | Không vượt quyền; kết quả/lỗi có log; sự kiện hợp lệ được recovery khi queue phục hồi |

Chạy các lệnh có sẵn từ repository root:

```powershell
npm run typecheck --workspace apps/api
npm run test:automation --workspace apps/api
npm run test:integration:automation --workspace apps/api
npm run test:integration:automation-program-scope --workspace apps/api
npm run test:integration:automation-reassignment --workspace apps/api
npm run test:integration:lead-assignment-open --workspace apps/api
```

Bổ sung test mới vào lệnh phù hợp hoặc ghi chính xác lệnh mới. Chạy thêm integration lead workflow/marketing-form automation khi sửa mutation chung có ảnh hưởng các luồng đó.

Nếu sửa frontend: chạy typecheck/build web, React Doctor theo skill và smoke test thao tác cấu hình/bỏ Sale trên desktop/mobile, kiểm tra copy tiếng Việt và keyboard. Nếu môi trường chặn kiểm thử, ghi rõ lệnh, lỗi và phần chưa xác minh; không báo pass.

## 5. Điều kiện hoàn thành

- T01–T14 có kết quả và bằng chứng; giải thích rõ ca không áp dụng nếu có căn cứ.
- Giữ nguyên chuyển Sale vì chưa mở lead; không reset giới hạn để tự tạo vòng vô hạn.
- Không ghi đè Sale được gán trong lúc job chờ, không phân công trùng và không mất sự kiện đã commit khi queue lỗi tạm thời.
- Không thay đổi ngoài phạm vi, không tự bật rule hoặc chỉnh dữ liệu nghiệp vụ thật.
- Báo cáo file thay đổi, hành vi mới, migration nếu có, kiểm tra đã chạy và hạn chế còn lại.

## 6. Nhật ký triển khai của agent

Agent cập nhật phần này theo từng giai đoạn. Mỗi dòng ghi: giai đoạn, file sửa, quyết định kỹ thuật chính, test đã chạy/kết quả và việc còn lại. Không đánh dấu mục chưa được xác minh là hoàn thành.

- Giai đoạn A: xác minh chỉ `updateLead` hiện có đường bỏ Sale; không có bulk-unassign. Registry trước đây thiếu `lead_unassigned` dù mutation đã phát sự kiện. `automation_jobs` có đủ cấu trúc outbox và index recovery; lead thiếu mã nhận diện lần bỏ Sale, nên cần một cột UUID bổ sung.
- Giai đoạn B: thêm `manual-unassignment-event.service.ts`, lưu event cùng transaction và recovery trong worker; ID ổn định theo lần bỏ Sale, nguồn manual do server tạo. Migration `20261016130000_manual_unassignment_event` chỉ thêm cột nullable, đã thử trên database riêng; sau đó được áp thành công lên `crm_db` khi người dùng yêu cầu chạy migration.
- Giai đoạn C: node assign/pool mang event ID qua context; kiểm tra lead còn trống và token hiện hành bên trong khóa phân công, trước khi tiến cursor. Gán đơn, bulk và cập nhật lead dùng chung advisory lock; bulk khóa theo thứ tự ID. Audit ghi event/rule/node execution/assignment hoặc lý do bỏ qua.
- Giai đoạn D: warning lấy khóa lead trước khi kiểm tra assignment. Monitor cũ giữ lịch sử và tự vô hiệu hóa bằng stale-assignment guard; expiry vẫn kiểm tra lại trong transaction phân công. Monitor mới reset bộ đếm riêng, không sửa giới hạn của chuỗi chuyển quá hạn.
- Giai đoạn E: bổ sung trigger/nhãn tiếng Việt ở backend registry mà builder đang sử dụng. Không sửa React, không cần chạy React Doctor hoặc browser smoke cho thay đổi component. Cách cấu hình nằm ở mục 7.
- Nghiệm thu: TypeScript PASS; 92/92 unit automation PASS; bảy integration PASS trên PostgreSQL/Redis local với database tạm riêng. T01–T14 được đối chiếu trong `artifacts/manual-unassignment/verification.md`; đã kiểm tra cả delay thật và retry sau assignment commit.
- Hỗ trợ môi trường test: thêm `integration` vào enum NODE_ENV, khớp chế độ có sẵn trong engine và các integration script. Runner tạo fixture sạch, áp thử migration trên database tạm, ghi log và dọn database. Không bật/sửa rule dữ liệu thật.
- Cập nhật theo yêu cầu tiếp theo: đã áp riêng migration mới lên `localhost:5432/crm_db`, ghi nhận applied trong Prisma và xác minh checksum/cột UUID nullable. Chạy lại Prisma generate, TypeScript, 92 unit và bảy integration đều PASS. Không thay đổi rule nghiệp vụ.
- Khi người dùng yêu cầu áp toàn bộ migration còn chờ: đã chạy `prisma migrate deploy`, áp thêm `20260928160000_add_meta_messenger_integration`; Prisma xác nhận database đã cập nhật đầy đủ. Xác minh đủ năm bảng Meta và checksum migration khớp.

## 7. Hướng dẫn cấu hình sau khi cập nhật database

1. Áp migration `20261016130000_manual_unassignment_event` bằng quy trình database hiện có, sinh Prisma client và khởi động phiên bản API/automation worker tương ứng. Không dùng reset/database push lên dữ liệu nghiệp vụ.
2. Tạo rule trong đúng chương trình, chọn trigger **Lead được bỏ Sale phụ trách thủ công** (`lead_unassigned`). Rule tạo Lead cũ tiếp tục giữ trigger cũ.
3. Nối điều kiện nghiệp vụ nếu cần, rồi node **Chia Lead tự động**, chọn chiến lược **Chia đều** và danh sách Sale/team. Có thể thêm node delay trước phân công; không có delay mặc định.
4. Trong node chia Lead, bật chính sách tự chuyển Sale theo tiêu chí **chưa mở bản ghi kể từ khi phân công**, cấu hình thời hạn/cảnh báo/số lần chuyển/số vòng theo nhu cầu.
5. Lưu và bật rule. Thử trên lead kiểm thử: bỏ Sale và lưu; kiểm tra lịch sử phân công, thông báo và log execution. Việc lưu khi lead vốn trống không phát event mới.
6. Nếu bạn gán Sale trước khi node phân công chạy, node bỏ qua và ghi audit `automation_assignment_skipped`. Job từ lần bỏ Sale cũ không được dùng cho lần bỏ Sale mới.

Con trỏ chia vòng thuộc riêng rule/node này; không kế thừa con trỏ rule tạo Lead. Mỗi lần bỏ Sale thủ công rồi chia lại tạo monitor mới từ thời điểm phân công mới; vẫn có thể chọn lại Sale vừa bị bỏ theo lượt chung. Chuỗi tự chuyển do quá hạn giữ bộ đếm và giới hạn riêng, không tự phát event bỏ Sale thủ công.
