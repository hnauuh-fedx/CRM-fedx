# Skeleton toàn trang

## Phạm vi

Đã áp dụng skeleton khi tải mã trang và khi tải dữ liệu lần đầu cho các module CRM. Sidebar và topbar được giữ nguyên khi điều hướng trong CRM.

`app-routes.tsx` hiện khai báo 55 đường dẫn render trang (không tính redirect). Hai đường dẫn biểu mẫu công khai dùng chung một trang. Trang đăng nhập chỉ dùng skeleton khi khôi phục phiên; trang không có quyền và danh mục kênh kết nối không tạo thời gian chờ giả khi không có dữ liệu bất đồng bộ. Trang tổng quan chọn dashboard theo quyền hiện hành.

## Thành phần

- `components/shared/page-loading-state.tsx`: `PageLoadingState`, `PageLoadingBoundary`, `SessionLoadingState` và chín mẫu `list`, `lead-list`, `detail`, `dashboard`, `settings`, `cards`, `builder`, `public-form`, `session`.
- `routes/page-skeleton-config.ts`: chọn mẫu theo đường dẫn; ưu tiên route chi tiết trước route danh sách.
- `routes/route-loading-state.tsx`: fallback tải mã trang, gồm cả biểu mẫu nhúng.
- `components/layout/main-layout.tsx`: Suspense nằm trong vùng main và có key theo pathname; khung điều hướng không bị thay thế khi lazy page suspend trong React transition.
- `modules/marketing/public-marketing-form-shell.tsx`: giữ cùng bố cục cho tải mã, tải dữ liệu và biểu mẫu công khai; giữ chế độ nhúng.
- `components/ui/skeleton.tsx`: dùng token màu hiện tại và tắt animation khi người dùng yêu cầu giảm chuyển động.

## Quy tắc tải dữ liệu

`PageLoadingBoundary` nhận các query cần thiết cho nội dung chính của trang. Nó chỉ thay toàn bộ nội dung trước lần hiển thị đầu tiên:

| Trạng thái | Hành vi |
| --- | --- |
| Query đang tải và chưa có dữ liệu | Skeleton toàn vùng nội dung |
| Query bị disabled | Không chặn trang |
| Có dữ liệu cache | Hiển thị nội dung ngay |
| Có query lỗi | Nhường cho các trạng thái lỗi/tải cục bộ hiện có |
| Đổi query key sau lần hiển thị đầu | Giữ cây nội dung, bộ lọc và bản nháp; dùng loading của vùng kết quả |
| Refetch có dữ liệu | Giữ nội dung và các chỉ báo cập nhật hiện có |
| Mutation | Giữ trạng thái pending tại thao tác hiện có |

Không đưa query chỉ phục vụ dialog, chi tiết được chọn, lịch sử phụ hoặc danh sách lựa chọn thao tác vào boundary toàn trang. Không dùng `isPending` để chặn trang vì query disabled cũng có thể pending; không dùng `isFetching` để thay toàn trang.

Các màn hình chi tiết vốn có nhánh return loading riêng dùng trực tiếp `PageLoadingState`. Những trang đã giữ dữ liệu cũ bằng `placeholderData` tiếp tục giữ hành vi đó. Trình chỉnh bố cục hiển thị chỉ dùng skeleton khi `isLoading`, để refetch không tháo biểu mẫu đang chỉnh.

Không thay đổi API, phân quyền, scope hoặc logic nghiệp vụ.

## Tích hợp trang mới

1. Chọn mẫu khớp với bố cục trang và bổ sung phân loại route nếu cần.
2. Bọc nội dung bằng `PageLoadingBoundary`, truyền query chính cùng các query quyết định bố cục. Giữ hooks ở component trang để request bắt đầu ngay khi skeleton đang hiển thị.
3. Giữ error, empty state và loading cục bộ của trang bên trong boundary.
4. Không tạo nút/input giả có thể focus trong skeleton.

## Kiểm chứng

- `npm run typecheck --workspace apps/web`
- `npm run build --workspace apps/web`
- `npm run test:page-loading-browser --workspace apps/web`
- `npm run test:react-doctor-browser --workspace apps/web`
- `npm run test:auth-browser --workspace apps/web`
- `npx react-doctor@latest --verbose --diff`

Browser smoke cho skeleton kiểm tra tải lần đầu, cache, query disabled/lỗi, refetch, phân trang, giữ bản nháp, giữ DOM và trạng thái sidebar/topbar khi lazy route suspend, fallback biểu mẫu nhúng, chín mẫu, phân loại route, ba kích thước 375/768/1440px và reduced motion. Ảnh nghiệm thu được ghi vào `artifacts/page-skeleton/`.

Regression CRM dùng các màn hình thật để kiểm tra chọn lead, phân trang, biểu mẫu, lỗi lưu, cập nhật quyền, runtime fields, automation và tích hợp. Fixture được bổ sung API effective display layout đúng hợp đồng hiện hành.
