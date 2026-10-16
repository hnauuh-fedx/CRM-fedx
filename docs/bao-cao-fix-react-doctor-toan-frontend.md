# Báo cáo sửa React Doctor toàn frontend

Ngày: 15/10/2026. Phạm vi: toàn bộ `apps/web`, mở rộng từ [đợt sửa theo kế hoạch trước](bao-cao-fix-canh-bao-react-doctor.md).

## Kết quả

| Chỉ số | Baseline toàn frontend | Sau sửa |
| --- | ---: | ---: |
| React Doctor | 0.9.18 | 0.9.18 |
| Điểm | 71/100 | 100/100 |
| Lỗi | 1 | 0 |
| Cảnh báo | 98 | 0 |
| File có finding | 55 | 0 |

Quét toàn frontend và quét diff đều đạt 100/100, không còn diagnostic. Các file nguồn mới cũng thuộc phạm vi quét. Không sửa cấu hình rule, ngưỡng hoặc thêm suppression để đạt điểm. JSX đã được định dạng trước khi quét kết quả cuối.

Đây là lỗi/cảnh báo của mã frontend, không phải các file Markdown trong `docs`. Kết quả thô:

- [Baseline 1 lỗi, 98 cảnh báo](../artifacts/react-doctor-workspace-before.json).
- [Kết quả toàn frontend](../artifacts/react-doctor-workspace.json).
- [Kết quả diff](../artifacts/react-doctor-workspace-diff.json).

## Những phần đã sửa

| Nhóm baseline | Số finding | Cách xử lý |
| --- | ---: | --- |
| Logic React phức tạp | 32 | Tách phần kết quả, bộ lọc, form section, tab, dialog và helper thuần theo chức năng; dùng early return cho các trạng thái độc lập. Áp dụng tại Automation, Custom fields, Leads, Management, Marketing, Reports, Students và Webhooks. |
| JSX trùng | 18 | Dùng chung `ServerDataTable`, `StaticTableHeader`, `TablePagination`, `EditorDialog`, `SalePerformanceContent`, `SaleLeadField`, `SaleCustomFieldInputs`, `IntegrationProgramField` và các phần form báo cáo. Query, quyền, scope và mutation vẫn do module tương ứng quản lý. |
| Lookup trong vòng lặp | 17 | Tạo Set/Map một lần theo dữ liệu đầu vào, giữ thứ tự và nội dung lựa chọn. |
| Dữ liệu TanStack Table thiếu ổn định | 8 | Memo hóa dữ liệu/fallback theo dữ liệu query, giữ phân trang/lọc/sắp xếp phía server. |
| Export ảnh hưởng Fast Refresh | 5 | Chuyển variant, model và helper sang module riêng; cập nhật consumer. |
| Mutation không có invalidation | 3 | Các tác vụ UI và đọc dữ liệu chuyển sang `useAsyncTask`. Mutation ghi nghiệp vụ vẫn giữ invalidation riêng. Không thêm invalidation giả cho thao tác đọc. |
| Index làm React key | 3 | Dùng khóa thông điệp lỗi và định danh ổn định cho dòng bộ lọc báo cáo; xóa dòng trước không đổi định danh dòng còn lại. |
| Tạo Intl formatter lặp | 3 | Đưa formatter ra ngoài phần render/vòng lặp. |
| Component quá dài | 2 | Tách section theo nghiệp vụ. Sau định dạng tiếp tục tách những component mới vượt ngưỡng. |
| Accessibility label | 1 | Bổ sung tên truy cập tiếng Việt cho điều khiển phân trang dùng chung. |
| Context value mới mỗi render | 1 | Memo hóa context của ToggleGroup. |
| JSON clone | 1 | Dùng `structuredClone` trong kiểm thử. |
| Dependency effect | 1 | Bỏ effect phụ thuộc callback cha để báo giá trị runtime; dùng subscription và callback mới nhất. |
| Truyền dữ liệu về cha từ effect | 1 | Theo dõi thay đổi React Hook Form, gửi snapshot khi dữ liệu thay đổi. |
| Truy cập/gán ref trong render — lỗi duy nhất | 1 | Bỏ cập nhật ref callback trong render của `RuntimeCustomFieldsSection`; dùng `useEffectEvent`. |
| State chỉ phục vụ handler | 1 | Dùng ref theo rule ID cho khởi tạo Automation Builder; đổi rule vẫn nạp đúng graph. |
| Điều chỉnh state khi prop thay đổi | 1 | Cảnh báo giá trị custom field bị ẩn được suy ra từ quyền/field hiện có và trạng thái dirty của form. |

Các header tĩnh Automation từng được giữ riêng trong báo cáo cũ đã chuyển sang `StaticTableHeader`. Field chọn chương trình của Meta/Zalo dùng `IntegrationProgramField`, vẫn giữ callback, dữ liệu chương trình được cấp và mô tả riêng. Phần này thay thế kết luận “còn ngoài phạm vi” ở đợt trước.

## Kiểm chứng

- Typecheck frontend và backend: đạt.
- Build frontend production: đạt.
- `test:report-filter-rows`: 2/2; định danh không đổi khi xóa dòng trước, không trùng ID khi thêm/thay điều kiện, không đưa ID UI vào API.
- `test:lead-custom-field-values`: 3/3.
- `test:marketing-form-values`: 19/19; cập nhật kiểm thử CSS để kiểm tra `ChoiceOptionRow` sau khi tách, giữ kiểm tra layout và stable key.
- `test:marketing-form-leave`: 4/4.
- `test:react-doctor-browser`: chọn dòng, phân trang/sort/search phía server, bản nháp, lưu thất bại và cập nhật quyền ở 375/768/1440px; thêm runtime-field hydration/nhập liệu/render lại/callback mới nhất và async-task lỗi/thử lại/reset. Kiểm tra thêm dialog ghi chú chuyển trạng thái: hủy không gọi xác nhận, lỗi giữ dialog, thử lại dùng đúng command.
- `test:marketing-form-g4-browser`: đạt cả 375/768/1440px, gồm lưu/nạp builder, kéo thả/phím tắt, clone, leave/saving guard, preview/public, điều kiện hiển thị, Other/rating, confirmation và retry.
- `test:auth-browser`: đạt restore, retry read, không tự phát lại write, lỗi tạm thời, reauth giữ bản nháp, focus/reduced motion và logout nhiều tab.
- `test:auth-form-browser`: đạt cả ba kích thước; bản nháp câu hỏi/editor được giữ khi đăng nhập lại.

Kiểm thử trình duyệt dùng API mock cục bộ; chưa thay thế kiểm thử tích hợp với dữ liệu triển khai thật. Build vẫn có cảnh báo chunk lớn hơn 500 kB đã tồn tại; đây là cảnh báo Vite riêng, không thuộc 99 finding React Doctor và không thay đổi ngưỡng để che cảnh báo.

## Chạy lại

Từ repository root:

```powershell
npx react-doctor@0.9.18 apps/web --verbose --no-cache --json --json-out artifacts/react-doctor-workspace.json
npx react-doctor@0.9.18 apps/web --verbose --diff --no-cache --json --json-out artifacts/react-doctor-workspace-diff.json
npm run typecheck --workspace apps/web
npm run typecheck --workspace apps/api
npm run build --workspace apps/web
npm run test:report-filter-rows --workspace apps/web
npm run test:react-doctor-browser --workspace apps/web
npm run test:marketing-form-g4-browser --workspace apps/web
```

Giữ phiên bản 0.9.18 để so sánh cùng baseline. Điểm React Doctor là kết quả phân tích tĩnh của phiên bản này; kiểm thử hành vi được ghi riêng ở trên.
