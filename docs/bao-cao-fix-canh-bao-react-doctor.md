# Báo cáo xử lý cảnh báo React Doctor

> Cập nhật: đợt mở rộng toàn frontend đã xử lý hết 1 lỗi và 98 cảnh báo, đạt 100/100. Xem [báo cáo toàn frontend](bao-cao-fix-react-doctor-toan-frontend.md). Nội dung dưới đây giữ lại kết quả của đợt giới hạn phạm vi trước đó.

Ngày: 15/10/2026. Kế hoạch: [ke-hoach-fix-canh-bao-react-doctor.md](ke-hoach-fix-canh-bao-react-doctor.md).

## Kết quả và phạm vi

Đã xử lý 18 finding cần refactor và đối chiếu 3 finding giống cấu trúc nhưng không cần gộp nghiệp vụ. Không sửa rule, threshold hoặc thêm suppression.

| Phép đo | Trước | Sau |
| --- | ---: | ---: |
| Phiên bản React Doctor | 0.9.18 | 0.9.18 |
| File nguồn trong phạm vi | 13 | 17, gồm đủ 13 file gốc và 4 file mới |
| Điểm | 85/100 | 90/100 |
| Errors | 0 | 0 |
| Warnings | 21 | 2 |
| Complexity / giant component / unstable table / lookup | 13 | 0 |
| Duplicate JSX | 8 | 2 |

Scan sau chạy với `--no-cache`. Hai cảnh báo còn phát ra đều là header tĩnh của bảng Automation, được giải thích bên dưới. Điểm này chỉ áp dụng phạm vi trên, không phải toàn frontend.

Dữ liệu gốc: `artifacts/react-doctor-before.json`, `artifacts/react-doctor-after.json`. Lặp lại phép quét bằng PowerShell tại root:

```powershell
& artifacts/react-doctor-refactor/scan.ps1
```

## Đối chiếu đủ 21 finding gốc

Các số dòng dưới đây là vị trí baseline trong `apps/web/src`, được giữ để truy vết; số dòng hiện tại đã thay đổi.

| # | Finding gốc | Xử lý |
| ---: | --- | --- |
| 1 | Business records:273 — duplicate pagination | Dùng `TablePagination`, cùng Documents/Fees/Statuses và Admission list/Sale assignment. |
| 2 | Admission list:443 — duplicate pagination | Dùng `TablePagination`, giữ callback, page bounds và khóa khi fetching. |
| 3 | Admission list:459 — duplicate table header | Dùng `ServerDataTable`, tái sử dụng với Sale assignment. |
| 4 | Admission list:460 — duplicate header row | Giải quyết cùng nguyên nhân với #3; giữ `aria-sort`, sorting handler và caption. |
| 5 | Automation monitoring:322 — duplicate execution header | Đối chiếu: khác nghiệp vụ với Departments/Permissions; giữ riêng. |
| 6 | Automation monitoring:338 — duplicate pagination | Dùng `TablePagination`, giữ chữ “Trước/Sau” và hành vi không khóa theo fetching của màn hình này. |
| 7 | Automation monitoring:359 — duplicate node header | Đối chiếu: khác nghiệp vụ với System settings/Webhooks; giữ riêng. |
| 8 | Meta connection:78 — duplicate source field | Đối chiếu: field của OAuth Meta và manual Zalo có contract khác; giữ riêng. Không còn phát ra trong scan cuối, không tính việc định dạng là sửa nghiệp vụ. |
| 9 | Admission fee:314 — PaymentDialog complexity | Tách `PaymentFields` và helper khởi tạo input; state form vẫn thuộc dialog. |
| 10 | Admission status:86 — page complexity | Tách card `AdmissionStatusResults`, giữ query/mutation/reset/dialog ở page. |
| 11 | Admission list:475 — AdmissionProfileForm complexity | Tách `AdmissionProfileDetails` và helper khởi tạo dữ liệu, giữ giá trị form và custom fields. |
| 12 | Automation monitoring:96 — page complexity | Tách metrics, filters, history, detail, confirmation, transfer và performance; hook recovery sở hữu retry/replay/rollback. |
| 13 | Lead list:328 — page complexity | Tách columns, CreateLeadDialog, query theo scope, controller dialog và helper sort/quyền. |
| 14 | Lead list:794 — EditLeadDialog complexity | Tách header và loaded content; hook transition vẫn nằm ở dialog để giữ vòng đời. |
| 15 | Meta connection:26 — page complexity | Tách notice và danh sách connection, giữ OAuth/mutation/query/quyền ở page. |
| 16 | Sale assignment:249 — Results complexity | Tách nội dung kết quả, dùng early returns cho lỗi/loading/empty và bảng dùng chung. |
| 17 | Admission status:383 — lookup trong map | Tạo `Set` từ draft hiện tại bằng `useMemo`, membership dùng `.has()`, giữ thứ tự và callback lưu. |
| 18 | Admission list:186 — unstable table | Fallback typed ở module; callbacks ổn định và dependencies columns theo từng quyền/handler. |
| 19 | Lead list:541 — unstable table | Fallback typed ở module; columns memo theo detail path. |
| 20 | Sale assignment:73 — unstable table | Fallback typed cho assignments/telesales; columns và callback phân công ổn định, vẫn cập nhật pending ID. |
| 21 | Lead list:328 — giant component | Giải quyết cùng refactor #13; scan cuối bao gồm mọi file mới. |

Sau khi định dạng, tiếp tục tách `AdmissionDocumentResults`, `AdmissionFeeResults`, `AdmissionStatusResults`, `AutomationExecutionFilters` và `AutomationRulePerformance` để không phát sinh component quá lớn. Không nén JSX nhằm né giới hạn số dòng.

### Những cấu trúc giữ riêng

- **Execution header**: các cột Rule / Trạng thái / Nguồn / Bắt đầu / Thao tác mô tả execution. Departments và Permissions dùng cột, dữ liệu và quyền khác. Công cụ nhận dạng chuỗi `TableHeader > TableRow > TableHead`, chưa chứng minh cần một bảng nghiệp vụ chung.
- **Node header**: các cột Node / Trạng thái / Số lần thử / Lỗi phục vụ chẩn đoán execution. System settings và Webhooks chỉ giống số lượng primitive. Không thêm component chung chỉ nhận danh sách nhãn để làm mất finding.
- **Nguồn lead Meta/Zalo**: Meta chọn đích trước OAuth và đánh dấu nguồn là bắt buộc; Zalo nằm trong form token thủ công, có contract accessibility khác. Chưa tạo abstraction giữa hai flow chỉ từ một subtree Select. Scan cuối không phát ra finding này; source field và ranh giới provider vẫn được giữ riêng.

Đây là phân loại sau khi đọc source, không phải tắt cảnh báo. JSON cuối vẫn giữ nguyên hai finding Automation để người rà soát thấy được.

## File thay đổi trong đợt này

File nguồn mới:

- `apps/web/src/components/shared/server-data-table.tsx`
- `apps/web/src/components/shared/table-pagination.tsx`
- `apps/web/src/modules/leads/components/create-lead-dialog.tsx`
- `apps/web/src/modules/leads/components/lead-list-columns.tsx`

File nguồn cập nhật: Business records; bốn trang Admission (documents, fees, statuses, list); Automation monitoring; Lead list; Meta connection; Sale lead assignments. Các file còn lại trong 13 file baseline vẫn được quét nhưng không refactor thêm trong đợt này.

Thêm fixture local `apps/web/tests/react-doctor-refactor-smoke.html`, `.tsx`, `.browser-smoke.mjs` và script `test:react-doctor-browser` trong `apps/web/package.json`.

## Kiểm chứng

Đã qua:

- Typecheck frontend và API; production build frontend; `git diff --check`.
- `test:lead-custom-field-values`: 3/3; `test:marketing-form-values`: 19/19; `test:marketing-form-leave`: 4/4.
- `test:auth-browser`, `test:auth-form-browser` ở 375/768/1440px.
- `test:survey-focus-browser` và suite `test:marketing-form-g4-browser` đầy đủ ở 375/768/1440px.
- `test:react-doctor-browser`: chọn Lead theo ID qua phân trang, sort/search phía server và reset trang, giữ draft tạo Lead khi parent render, giữ input Admission sau lỗi lưu, action thay đổi theo quyền ở cả ba kích thước.
- Fixture mới còn xác nhận duyệt tài liệu đúng ID/status/note; payment đúng ID/amount và giữ ghi chú khi lỗi; Set status flow lưu đúng membership; retry/replay đúng execution, replay có request ID, rollback đúng rule/version; Meta test đúng connection và ẩn action khi mất quyền; assignment gửi đúng lead/assignee.

Fixture dùng API local mô phỏng, không kết nối Facebook, Zalo hoặc hàng đợi thật. Những kiểm tra này không thay thế integration test của backend; đợt này không sửa contract backend, schema hoặc migration. Build còn cảnh báo chunk lớn hơn 500 kB.

## Kết quả ngoài phạm vi

Đã chạy thêm hai phép đo riêng, cùng phiên bản 0.9.18:

- `--verbose --diff --include-untracked --no-cache`: **0 errors, 16 warnings, 80/100**, xét 212 file thay đổi so với `origin/main`, bao gồm công việc trước đợt này. Báo cáo: `artifacts/react-doctor-diff.json`.
- Toàn frontend `apps/web --verbose --no-cache`: **1 error, 98 warnings, 71/100**. Báo cáo: `artifacts/react-doctor-workspace.json`.

Lỗi toàn frontend nằm ở `apps/web/src/modules/custom-fields/runtime-custom-fields-section.tsx:30`, rule `no-ref-current-in-render`: ref được thay đổi trong render. File này không được chỉnh trong đợt refactor. Các nhóm warning còn có complexity, lookup, unstable table, JSX duplication ở module khác. Không tuyên bố toàn frontend đã sạch dựa trên điểm 90 của phạm vi 17 file.

Không commit, triển khai production hoặc thay đổi cấu hình React Doctor trong đợt này.
