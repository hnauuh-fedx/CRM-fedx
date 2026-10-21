# Nghiệm thu tự chia lại khi bỏ Sale thủ công

Ngày: 2026-10-16. Code, migration local và kiểm thử đã hoàn tất theo yêu cầu của người dùng.

## Kết quả

- `npm run prisma:generate --workspace apps/api`: PASS.
- `npm run typecheck --workspace apps/api`: PASS, sau thay đổi cuối cùng.
- `npm run test:automation --workspace apps/api`: PASS, 92/92.
- `npm run test:integration:manual-unassignment --workspace apps/api`: PASS, bảy integration bên dưới.
- `npm run test:integration:manual-unassignment --workspace apps/api -- manual-unassignment`: PASS sau khi bổ sung ca retry sau assignment commit; typecheck cũng PASS sau lượt này.
- `git diff --check`: PASS.

Runner tạo database `crm_manual_unassign_test_<timestamp>` trống trên PostgreSQL local, tạo schema từ Prisma, áp thử SQL migration thực tế, thêm fixture test và dọn database trong finally. Redis dùng queue riêng từng integration. Không tạo fixture hoặc bật rule trong `crm_db`.

Migration `20261016130000_manual_unassignment_event` đã áp thành công lên `localhost:5432/crm_db` bằng `prisma db execute --file .../migration.sql`, sau đó `prisma migrate resolve --applied 20261016130000_manual_unassignment_event`. Chỉ thực thi migration được yêu cầu vì còn một migration Meta ngoài phạm vi đang chờ.

Xác minh: cột `leads.manual_unassignment_event_id` là UUID nullable, lịch sử Prisma đã ghi applied, checksum khớp file SQL, truy vấn đọc cột PASS. Bằng chứng: [migration-local.log](migration-local.log).

Sau migration bỏ Sale đã chạy lại Prisma generate, TypeScript, [92 unit test](unit-tests.log) và toàn bộ bảy integration: PASS.

Theo yêu cầu tiếp theo áp tất cả migration còn chờ, đã chạy `prisma migrate deploy` và áp thành công `20260928160000_add_meta_messenger_integration` lên `crm_db` local. `prisma migrate status`: **Database schema is up to date!** Không còn migration chờ. Đã xác minh đủ năm bảng Meta, bản ghi applied và checksum khớp; xem [migration-meta-local.log](migration-meta-local.log).

| Suite | Kết quả | Bằng chứng |
| --- | --- | --- |
| Manual unassignment | PASS | [manual-unassignment.log](manual-unassignment.log) |
| Automation engine/API/RBAC/worker | PASS | [automation-engine.log](automation-engine.log) |
| Automation program scope | PASS | [automation-program-scope.log](automation-program-scope.log) |
| Automation reassignment | PASS | [automation-reassignment.log](automation-reassignment.log) |
| Lead first-open | PASS | [lead-assignment-open.log](lead-assignment-open.log) |
| Marketing form event/recovery | PASS | [marketing-form-automation-event.log](marketing-form-automation-event.log) |
| Lead workflow | PASS | [lead-workflow.log](lead-workflow.log) |

Log manual-unassignment có lỗi `Injected Redis enqueue outage` do test chủ động gây lỗi; recovery sau lỗi này đã PASS. Suite lead-workflow có cảnh báo deprecation của pg nhưng assertion và tiến trình đều kết thúc thành công ở lượt cuối.

## Đối chiếu tiêu chí

T01–T14 nằm trong `apps/api/src/integration/manual-unassignment.integration.ts`, chạy với PostgreSQL/Redis thật.

| Tiêu chí | Bằng chứng kiểm thử |
| --- | --- |
| T01 | Worker nhận event đã commit, chia đúng một lần; đủ notification/audit và monitor mới với bộ đếm 0 |
| T02 | Trống → trống, đổi trực tiếp Sale, validation thất bại và rollback transaction không sinh event mới |
| T03 | Không có rule phù hợp, rule tắt/lưu trữ/khác chương trình và trigger thiếu nguồn manual không chia lại |
| T04 | Hai lead qua cùng node tiếp tục cursor A → B |
| T05 | Hai rule có cursor độc lập |
| T06 | Replay execution hoàn tất không tạo thêm assignment; lỗi enqueue downstream sau assignment commit được BullMQ retry, không lặp cursor/notification/monitor |
| T07 | Hai rule chạy đồng thời trên lead trống chỉ tạo một assignment main và một monitor; bên thua ghi audit bỏ qua |
| T08 | Bulk/manual assignment trong lúc chờ được giữ; cả node assign/pool đều có guard; Redis delay thật không ghi đè Sale/cập nhật cursor/tạo monitor |
| T09 | Event cũ không dùng được sau khi gán rồi bỏ Sale lần mới |
| T10 | Warning/expiry cũ bị vô hiệu hóa; expiry đang chạy cạnh tranh với bỏ Sale không khôi phục owner cũ |
| T11 | Chưa mở assignment mới đến hạn chuyển Sale; bộ đếm successor tăng đúng, không phát event manual mới |
| T12 | Mở assignment cũ không tính cho assignment mới; mở assignment hiện tại chặn chuyển quá hạn |
| T13 | Hết số lần chuyển, hết pool, hết số vòng và không còn Sale hợp lệ đều dừng |
| T14 | Event lưu bền retry/recovery; lỗi enqueue engine được phục hồi cùng execution ID; mất quyền đã lưu trong DB, scope bị giới hạn và lead bị xóa không vượt quyền |

## File thay đổi

- Database: `apps/api/prisma/schema.prisma`, migration `20261016130000_manual_unassignment_event/migration.sql`.
- Event/context/worker: `manual-unassignment-event.service.ts`, `automation-execution.types.ts`, `automation-engine.service.ts` trong module automations.
- Phân công/monitor/registry: `automation-action-registry.ts`, `automation-reassignment.service.ts`, `automation-registry.ts`.
- Lead mutations: `update-lead.use-case.ts`, `assign-leads.use-case.ts`, `lead-owner-stage.use-cases.ts`.
- Test runtime: `apps/api/src/config/env.ts`, `apps/api/package.json`, `apps/api/scripts/test-manual-unassignment-isolated.cjs`.
- Test mới: `apps/api/src/integration/manual-unassignment.integration.ts`, `apps/api/src/modules/automations/manual-unassignment-registry.test.ts`.
- Kế hoạch/checklist/hướng dẫn: `docs/automation-manual-unassign-implementation.md`; log và báo cáo trong thư mục này.

## Trước khi sử dụng

Database local đã sẵn sàng cho code mới. Khi đưa sang môi trường khác, vẫn cần áp migration tương ứng trước khi chạy. Không tự bật rule: người quản lý tạo/bật rule với trigger **Lead được bỏ Sale phụ trách thủ công**, nối node chia Lead và bật chính sách chưa mở lead nếu cần.

Không có thay đổi React/component. Nhãn trigger được cung cấp qua registry hiện có; unit test xác minh registry/validator và suite engine kiểm tra API options. Không thực hiện browser smoke hoặc React Doctor cho đợt thay đổi backend này.
