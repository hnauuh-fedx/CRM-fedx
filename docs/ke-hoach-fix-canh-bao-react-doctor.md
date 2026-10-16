# Kế hoạch xử lý 21 cảnh báo React Doctor

Ngày lập: 15/10/2026. Trạng thái: đã triển khai và kiểm chứng ngày 15/10/2026.

Kết quả: 18 finding được xử lý, 3 finding trùng cấu trúc được đối chiếu và giữ riêng theo nghiệp vụ. Scan đủ 13 file gốc + 4 file mới: **90/100, 0 errors, 2 warnings** (header bảng Automation). Typecheck frontend/API, build, regression browser, auth và G4 đã qua. Chi tiết từng finding, các file thay đổi và kết quả ngoài phạm vi: [Báo cáo thực hiện](bao-cao-fix-canh-bao-react-doctor.md). Bảng baseline bên dưới được giữ nguyên để đối chiếu.

## Mục tiêu và baseline

Phạm vi là 21 warnings trong lần quét 13 file đã được xác nhận, điểm 85/100. Đây không phải tổng cảnh báo toàn frontend. Typecheck frontend/API và suite G4 đã được sửa ở đợt trước; kết quả đó phải được giữ.

| Rule | Số lượng | Vị trí baseline trong `apps/web/src` |
| --- | ---: | --- |
| `duplicate-jsx-subtree` | 8 | `components/shared/business-records-page.tsx:273`; `modules/admissions/pages/admissions-list-page.tsx:443,459,460`; `modules/automations/pages/automation-monitoring-page.tsx:322,338,359`; `modules/marketing/pages/meta-connection-page.tsx:78` |
| `no-high-complexity-react-function` | 8 | `modules/admissions/pages/admission-fees-page.tsx:314`; `modules/admissions/pages/admission-statuses-page.tsx:86`; `modules/admissions/pages/admissions-list-page.tsx:475`; `modules/automations/pages/automation-monitoring-page.tsx:96`; `modules/leads/pages/leads-list-page.tsx:328,794`; `modules/marketing/pages/meta-connection-page.tsx:26`; `modules/sale/pages/lead-assignments-page.tsx:249` |
| `js-set-map-lookups` | 1 | `modules/admissions/pages/admission-statuses-page.tsx:383` |
| `tanstack-table-no-unstable-data-or-columns` | 3 | `modules/admissions/pages/admissions-list-page.tsx:186`; `modules/leads/pages/leads-list-page.tsx:541`; `modules/sale/pages/lead-assignments-page.tsx:73` |
| `no-giant-component` | 1 | `modules/leads/pages/leads-list-page.tsx:328` |

Số dòng là mốc tham chiếu, sẽ đổi sau refactor. Một component có thể nhận nhiều finding; không coi mỗi warning là một lỗi độc lập để sửa lặp.

## Nguyên tắc

- Kiểm tra từng finding bằng source hiện tại trước khi xác nhận. Phân loại: đúng và cần sửa; trùng một nguyên nhân; hoặc false positive có bằng chứng. Nhãn “Bugs” của công cụ chưa chứng minh đã có lỗi runtime.
- Không đổi rule, threshold, thêm suppression hoặc loại file khỏi scan để tăng điểm. Không chỉ di chuyển nguyên khối code sang file khác rồi bỏ file mới khỏi kiểm tra.
- Giữ nguyên nghiệp vụ, API, permission/scope, copy tiếng Việt, phân trang/sort/filter server, cache và hành vi form. Không thêm dependency, schema hoặc migration cho đợt refactor này.
- Reuse component/helper hiện có. Chỉ đưa UI thực sự dùng chung vào `components/shared`; logic Lead, Admission, Automation và Meta tiếp tục nằm trong domain tương ứng.
- `useMemo`/`useCallback` có đủ dependencies. Không dùng mảng rỗng để giữ reference nếu dữ liệu phụ thuộc quyền, chương trình, filter hoặc callback đang thay đổi.
- Không thêm test chỉ để khẳng định “có useMemo” hoặc kiểm tra cấu trúc file. Tập trung vào hành vi có thể bị ảnh hưởng.
- Đọc CodeGraph và các skill domain/access-control/UI/shadcn/React Doctor tương ứng trước khi sửa code. Giữ mọi thay đổi đang có trong workspace.

## Bước 0 — Xác nhận và lưu baseline

1. Ghi `git status`/diff, phiên bản React Doctor và lệnh quét. Giữ cùng phiên bản công cụ trong so sánh trước/sau.
2. Lưu diagnostics của đúng 13 file baseline; đọc từng rule và call site để tìm nguyên nhân chung. Đọc config lint/compiler có liên quan.
3. Chạy typecheck toàn frontend và các test gần module cần sửa. Dùng fixture/mocks cho thay đổi UI; không thao tác dữ liệu CRM hoặc kết nối Meta thật.
4. Lập bảng theo dõi từng finding: vị trí, bằng chứng, phân loại, cách sửa dự kiến và test cần chạy. Nếu false positive, giải thích bằng code; không tự tạo abstraction thừa chỉ để xóa cảnh báo.

Đầu ra: baseline có thể so sánh và danh sách finding đã kiểm chứng. Score là tín hiệu phụ; số finding gốc được xử lý và hành vi được bảo toàn là tiêu chí chính.

## Bước 1 — Ổn định dữ liệu/cột bảng và tra cứu membership

Ưu tiên 4 warnings tại ba bảng và trình chỉnh luồng trạng thái.

### Ba bảng TanStack Table

- Kiểm tra chính xác nguồn warning: fallback `data ?? []`, transform dữ liệu, columns tạo trong render hay callback được capture trong cell.
- Fallback rỗng dùng hằng có kiểu ở module khi phù hợp; không mutate mảng dùng chung. Chỉ memoize transform thực sự tạo mảng mới.
- Columns tĩnh có thể đặt ngoài component. Columns phụ thuộc quyền/scope/action dùng `useMemo` với đủ dependencies; callback chỉ ổn định khi cần và vẫn đọc state mới.
- Không giữ dữ liệu cũ để đổi lấy reference ổn định. Query refetch, đổi chương trình hoặc đổi quyền phải cập nhật bảng/action đúng.
- Giữ row ID, chọn hàng, filter, sort, pagination, pending và link chi tiết; không chuyển sang fetch toàn bộ dữ liệu.

### Tra cứu trong vòng lặp ở Admission status

- Kiểm tra lookup là membership hay cần đối tượng. Dùng `Set` cho membership hoặc `Map` cho lookup đối tượng nếu finding đúng.
- Cấu trúc lookup tính từ tập nguồn hiện tại, chỉ memoize khi cần. Giữ thứ tự hiển thị và quy tắc trạng thái đích/trạng thái bị vô hiệu hóa.
- Không thay đổi nguồn dữ liệu hoặc contract luồng xử lý.

Kiểm chứng:

- Render không đổi dữ liệu/filter không làm tạo lại data/columns một cách không cần thiết; dữ liệu mới vẫn cập nhật. Dùng quan sát profiler/reference tại fixture nếu cần, không đặt ngưỡng benchmark tùy ý.
- Đổi quyền/chương trình cập nhật action; callback cell không dùng user, token hoặc selection cũ.
- Chọn hàng, chuyển trang, sort/filter và cập nhật status flow vẫn đúng.
- Typecheck và React Doctor kiểm tra hẹp cho bốn vị trí; không phát sinh warning mới từ memoization.

## Bước 2 — Xử lý 8 cảnh báo JSX trùng cấu trúc

1. Đối chiếu các subtree bị công cụ đánh dấu. Phân biệt trùng có ý nghĩa dùng chung với markup giống nhau nhưng khác nghiệp vụ.
2. Tìm pagination, filter, empty/error/loading và display component đang có trong repository trước khi tạo mới.
3. Tách component với props rõ ràng cho phần lặp đã được chứng minh; ưu tiên một domain trước rồi kiểm tra kết quả.
4. Event, query/mutation và scope vẫn do tầng domain sở hữu. Component hiển thị nhận props/callback, không tự chọn quyền hoặc tự gọi API khác domain.
5. Giữ semantic table/form/dialog, nhãn aria, focus và trạng thái disabled/pending. Không tạo một component “đa năng” với nhiều cờ điều kiện chỉ để gộp JSX.

Các cụm thực hiện dự kiến:

- Business records + Admission: đối chiếu phần phân trang/filter đã có; tái sử dụng khi contract thực sự tương thích.
- Automation monitoring: xem phần danh sách execution/version/detail bị đánh dấu, chỉ tách phần trình bày có giao diện ổn định.
- Meta connection: giữ Page selection/log/connection state đúng ý nghĩa khi dùng component hiển thị chung trong domain.

Kiểm chứng: action gọi đúng handler/ID, pagination giữ tổng/trang/disabled, loading/error/retry hoạt động; kiểm tra keyboard và layout ở 375/768/1440px cho phần UI thực sự thay đổi.

## Bước 3 — Giảm độ phức tạp từng domain

Xử lý sau bước 2 vì việc tách JSX có thể đồng thời giải quyết một số warning complexity. Quét lại trước khi refactor tiếp để tránh làm thừa.

| Module | Hướng tách dự kiến sau khi đọc code | Hành vi phải giữ |
| --- | --- | --- |
| Admission fee `PaymentDialog` | Tách phần hiển thị/nhập thanh toán và helper chuyển input nếu có đủ ranh giới | Validation, số tiền/trạng thái, pending, thông báo lỗi, nội dung chưa lưu |
| Admission status page | Tách toolbar/list/status-flow/dialog khi chúng có trách nhiệm độc lập | Quyền thao tác, trạng thái hiện tại, lưu luồng và retry |
| Admission list/form | Tách trường/nhóm form và trạng thái dialog theo domain | Tạo/cập nhật hồ sơ, validation, giữ form khi lỗi/reauth |
| Automation monitoring | Tách phần filters/list/detail/version/confirmation; dùng helper thuần cho điều kiện nếu thực sự cần | Retry/replay dùng execution ID, rollback dùng rule/version, không gửi sai thao tác khi dialog đổi |
| Meta connection | Tách OAuth selection, connection actions và log rendering theo interface nhỏ | Response test/disconnect, error/notice, quyền integration, không gọi kết nối thật trong test |
| Lead assignment filter | Tách nhóm điều kiện/filter thuần hiển thị nếu phù hợp | Null lead, assignee, điều kiện lọc, scope và server query |

Không bắt đầu bằng một hook trả hàng chục thuộc tính. Giữ local state gần nơi sở hữu, giữ mutation ở một nơi, và chỉ tạo hook khi nó đóng gói một luồng có interface rõ ràng. Component tách mới khai báo ở cấp module để tránh remount ngoài ý muốn.

Kiểm chứng: mỗi module có test hành vi phù hợp rủi ro trước/sau. Ưu tiên lifecycle form/dialog, điều kiện quyền và callback; không thêm test nặng cho thay đổi trình bày thuần.

## Bước 4 — Tách Lead list theo trách nhiệm

Xử lý hai complexity warnings và một giant-component warning cùng một lượt thiết kế; giữ bản sửa ổn định bảng ở bước 1.

1. Lập danh sách state/query/mutation hiện có và chủ sở hữu: scope/query parameters, filter/search, table selection, dialogs và actions.
2. Chọn ranh giới nhỏ: toolbar/filter, table/columns, dialog/action cụ thể. Tái sử dụng thành phần hiện có thay vì viết lại trang.
3. Chuyển phần trình bày trước; sau đó chỉ tách logic query/action nếu có contract rõ và giúp giảm coupling. Tránh truyền toàn bộ state setter qua nhiều tầng.
4. Giữ cache key, manual pagination/sort/filter, tổng bản ghi, preset/custom dates và quy tắc reset page/selection hiện tại.
5. Dialog/form tiếp tục được mount đúng vòng đời để không mất input do parent render, refresh token hoặc refetch. Không dùng `key` biến đổi để né state khó quản lý.

Kiểm chứng trọng tâm:

- Search/filter/preset/custom date, sort và pagination gửi đúng request.
- Selection không chuyển nhầm sang hàng khác; bulk/action dùng đúng ID và scope.
- Thay permission/chương trình làm cập nhật action và dữ liệu đúng.
- Mở/đóng dialog, submit lỗi/thành công và reauth không mất nội dung ngoài quy tắc đã có.
- Không fetch toàn bộ lead hoặc xử lý client list quy mô lớn.

## Bước 5 — Quét lại toàn bộ phạm vi và nghiệm thu

Scan cuối phải bao gồm 13 file gốc và mọi file component/hook/helper vừa tách, kể cả file chưa tracked. Không so score 13 file cũ với scan chỉ còn file cha. Dùng cùng phiên bản React Doctor và ghi rõ phạm vi mở rộng. Chạy thêm `--diff` theo skill; kết quả toàn workspace báo riêng, không trộn với baseline 21 warnings.

Các kiểm tra bắt buộc:

```powershell
npm run typecheck --workspace apps/web
npm run typecheck --workspace apps/api
npm run build --workspace apps/web
npm run test:lead-custom-field-values --workspace apps/web
npm run test:marketing-form-values --workspace apps/web
npm run test:marketing-form-leave --workspace apps/web
npm run test:survey-focus-browser --workspace apps/web
npm run test:auth-browser --workspace apps/web
npm run test:auth-form-browser --workspace apps/web
npm run test:marketing-form-g4-browser --workspace apps/web
npx react-doctor@latest --verbose --diff
git diff --check
```

Thêm test theo module đã thay đổi, dùng scripts/harness có sẵn khi phù hợp. Chạy HTTP/integration auth hoặc kiểm tra quyền thêm khi refactor thực sự chạm đến các contract đó. G4 chạy lại do đây là baseline đã sửa của workspace; chỉ lặp thêm khi xuất hiện thất bại/timing hoặc thay đổi mới, không mặc định chạy lại vô hạn.

## Tiêu chí hoàn tất

- Có trạng thái và bằng chứng cho đủ 21 finding gốc: đã sửa, đã được giải quyết cùng nguyên nhân khác, hoặc false positive được giải thích rõ. Mục tiêu loại bỏ toàn bộ cảnh báo xác nhận đúng; không hứa 100/100 bằng refactor không cần thiết.
- Không có regression mới do bản sửa trên phạm vi bao gồm file tách mới. Nếu còn finding đúng chưa xử lý, ghi rõ phần chưa hoàn thành; không đánh dấu xong toàn kế hoạch.
- Typecheck frontend/API, build và kiểm thử liên quan qua. Các cảnh báo bundle/ngoài phạm vi được báo riêng.
- UI tiếng Việt, keyboard/focus, responsive, permission/scope, pagination/filter và việc giữ input sau reauth được bảo toàn.
- Không suppress rules, không thêm abstraction chỉ phục vụ điểm số, không để lại log/profiler tạm.
- Báo cáo trước/sau ghi root cause, các file đã đổi, finding còn lại, lệnh/phạm vi kiểm chứng. Cập nhật trạng thái kế hoạch nhưng giữ baseline để đối chiếu.

## Thứ tự và giới hạn

Baseline → bảng/lookup → JSX dùng chung → complexity theo domain → Lead list → nghiệm thu tổng thể. Mỗi nhóm hoàn tất và kiểm chứng trước nhóm tiếp theo; không sửa đồng loạt toàn frontend hoặc triển khai production. Không tự commit/publish issue. Nếu phát hiện cần đổi nghiệp vụ, ghi tác động trước khi mở rộng phạm vi.
