# Lịch sử tạo lead — 22/10/2026

Đã sửa hai tab **Lịch sử chăm sóc** và **Thay đổi gần đây** để hiển thị nguồn tạo và thông tin ban đầu.

- API/webhook: ghi rõ nhận dữ liệu qua API, tên webhook/form và mã yêu cầu nếu có. Không hiển thị người cấu hình webhook như người tạo thủ công.
- Biểu mẫu hệ thống: ghi tên biểu mẫu.
- Tạo thủ công: ghi tên người tạo, lưu thông tin tại thời điểm tạo.
- Nhập tệp: ghi người nhập và hình thức nhập tệp.
- Lưu tên nguồn/tiến trình/nhân viên khi có để đọc được thay vì chỉ mã dữ liệu.
- Chỉ hiển thị các trường ban đầu nằm trong danh sách cho phép. Thông tin liên hệ/cá nhân được lọc theo quyền xem dữ liệu nhạy cảm.
- Với bản ghi cũ: dùng log webhook có action CREATED hoặc lịch sử tạo từ biểu mẫu. Webhook cập nhật sau đó không đổi nguồn tạo ban đầu. Nếu log đã mất hoặc bản ghi cũ không lưu hình thức/chi tiết tạo, giao diện nói rõ thay vì suy đoán.

## Tệp thay đổi

Backend:

- `apps/api/src/modules/leads/lead-creation-history.ts` (mới): snapshot và mô tả tiếng Việt, lọc thông tin nhạy cảm.
- `apps/api/src/modules/leads/lead-creation-history.service.ts` (mới): phục hồi nguồn tạo từ audit/log cũ sau khi kiểm tra scope lead.
- `apps/api/src/modules/leads/application/create-lead.use-case.ts`: lưu nguồn và dữ liệu lúc tạo.
- `apps/api/src/modules/leads/lead-inbound.service.ts`: chuyển nguồn API/webhook vào nghiệp vụ tạo.
- `apps/api/src/modules/leads/lead-import.service.ts`: phân biệt nhập tệp.
- `apps/api/src/modules/leads/lead-list.service.ts`: trả cùng mô tả nguồn tạo cho hai tab.
- `apps/api/src/modules/webhooks/webhook.service.ts`, `webhook-v2.service.ts`: truyền tên webhook và mã yêu cầu.
- `apps/api/src/modules/campaigns/marketing-form-public.service.ts`: lưu nguồn và dữ liệu tạo từ biểu mẫu/webhook biểu mẫu.

Frontend:

- `apps/web/src/modules/leads/lead.types.ts`: thêm nhãn tác nhân tạo.
- `apps/web/src/modules/leads/pages/lead-detail-page.tsx`: hiển thị nhãn nguồn và nội dung nhiều dòng, xuống dòng trên màn hình nhỏ.

Kiểm thử:

- `apps/api/src/modules/leads/lead-creation-history.test.ts` (mới).
- `apps/web/tests/lead-creation-history-smoke.tsx`, `lead-creation-history-smoke.html`, `lead-creation-history.browser.mjs` (mới).

## Xác minh

- Test trước sửa tái hiện đúng `director !== null` ở activity tạo từ API.
- `cd apps/api; npx tsx --test src/modules/leads/lead-creation-history.test.ts src/modules/leads/bizfly-lead-import.test.ts`: **10/10 đạt**.
- `npm run typecheck --workspace apps/api`: đạt.
- `npm run typecheck --workspace apps/web`: đạt.
- `cd apps/web; node tests/lead-creation-history.browser.mjs`: đạt ở 1440/390/375px cho cả hai tab; không gắn giám đốc là người tạo API, không tràn ngang.
- `cd apps/web; npx react-doctor@latest --verbose --diff`: **93/100**, không báo vấn đề.
- `git diff --check`: đạt.

Ảnh kiểm chứng: `activities-375.png`, `changes-375.png` và các bản 390/1440 trong thư mục này.

Kiểm thử dùng dữ liệu mô phỏng và giao diện tab thật; chưa kiểm tra trực tiếp lead trong ảnh chụp trên cơ sở dữ liệu đang chạy. Không sửa dữ liệu nghiệp vụ cũ hoặc thêm migration. Các thay đổi có sẵn trong workspace được giữ nguyên.
