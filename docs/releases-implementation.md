# Quản lý phiên bản

Ngoài Compose, đã có executor Render/Cloudflare tùy chọn, journal từng thành phần và frontend artifact theo môi trường. Xem [hướng dẫn vận hành cloud](cloud-features-operations.md); local/Compose vẫn là mặc định.

Tính năng quản lý bản phát hành và yêu cầu triển khai từ CRM. Dịch vụ điều khiển triển khai hoạt động độc lập với web/API/worker.

Đã có lớp **chuẩn bị tùy chọn** cho Cloudflare/Render/DigitalOcean tại [cloud-deployment-preparation.md](cloud-deployment-preparation.md). Mặc định vẫn là Compose. `CONTROL_DEPLOYMENT_MODE=prepare-only` chặn triển khai khi thử cấu hình cloud; CLI cloud chỉ tạo kế hoạch không thực thi, chưa thay runner hiện tại.

## Đã triển khai

- Trang `/management/releases`, menu **Quản lý → Phiên bản**; giao diện tiếng Việt, phân trang phía server, tìm theo tên/commit, lịch sử và nhật ký từng lần triển khai.
- Quyền `release.view` để xem; thêm `release.deploy` để triển khai/khôi phục. Cả hai yêu cầu phạm vi `ALL`, không mặc định cấp theo tên vai trò. Migration chỉ tạo quyền; người quản trị phân quyền rõ ràng sau khi áp dụng migration.
- CI trên push nhánh `main`: typecheck, unit test, build hai image API/web, publish vào GHCR, đăng ký manifest bất biến theo commit + image digest. Push không tự triển khai.
- API proxy `/api/system/releases/*` kiểm tra session, quyền và scope; token controller không gửi đến trình duyệt. Audit CRM ghi nhận ý định; controller lưu actor, lý do, trạng thái và nhật ký bền vững trong database riêng.
- Controller chạy Docker Compose với file do người vận hành quản lý; không nhận command, path, script hoặc env từ trình duyệt/CI. API và hai worker dùng cùng image, web dùng image cùng commit.
- Một yêu cầu hoạt động cho mỗi môi trường; request UUID có tính idempotent. Một runner hoạt động nhờ PostgreSQL advisory lock. Token CI chỉ đăng ký release, không có quyền triển khai.
- Production yêu cầu release đã thành công ở staging. Rollback chỉ đến release đã thành công tại môi trường đích và cùng thế hệ schema.
- Sau `compose up --wait`, kiểm tra `/api/ready` (PostgreSQL, Redis), commit API ghi sẵn trong image và `version.json` của web. Chỉ ghi nhận thành công khi kiểm tra đạt.
- Stack hiện có thêm tiến trình `operations-monitor` độc lập với các worker; health check của monitor kiểm tra snapshot mới đúng hostname/commit. Cần áp dụng migration monitoring trước khi triển khai image này. Xem `docs/operations-monitoring.md` để cấu hình ngưỡng, heartbeat và receiver cảnh báo.
- Khi lỗi/timeout/khởi động lại giữa chừng, trạng thái là `NEEDS_REVIEW`, môi trường bị khóa và giao diện hiển thị bản xác nhận gần nhất. Không khẳng định bản cũ vẫn chạy, không tự thử lại một thao tác chưa rõ kết quả.

## Chuẩn bị lần đầu

1. Chuẩn bị host Linux có Docker Compose hỗ trợ `up --wait`, Node 24 và PostgreSQL. Giữ controller ngoài stack CRM, quản lý bằng supervisor/systemd riêng. Tài khoản chạy controller cần quyền Docker; API CRM không được mount Docker socket hoặc nhận quyền host này.
2. Chuẩn bị PostgreSQL/Redis và dữ liệu **tách biệt** cho staging/production. Docker Compose production không khởi tạo, reset hay thay thế database hiện có.
3. Tạo database riêng cho controller, ví dụ `crm_release_control`, và tài khoản riêng. Đặt file `.env` tại `apps/release-controller` theo `.env.example`, tạo ba token ngẫu nhiên **khác nhau**, ít nhất 32 ký tự. Đặt prefix đúng registry; image ngoài prefix sẽ bị từ chối.
4. Từ root repo chạy `npm ci`, sau đó `npm run db:init --workspace apps/release-controller`. Lệnh chỉ tạo các bảng control; không đọc hay migrate dữ liệu CRM. `db:init` không ghi đè thế hệ schema của môi trường đã tồn tại.
5. Tạo `/srv/admission-crm/staging` và `/srv/admission-crm/production`. Trong mỗi thư mục đặt `compose.yml` từ `deploy/compose.yml`, `release.env` từ mẫu, và `api.env` riêng từ cấu hình API. Các file thuộc người vận hành, CRM không được ghi. Đặt project name, API/web port khác nhau; thông tin database, Redis, origin và khóa mã hóa phải đúng môi trường. Không dùng tài khoản demo trên production.
6. Cấu hình reverse proxy HTTPS tới web/API tương ứng: giữ nguyên prefix `/api` khi proxy về API, SPA còn lại về web. Các cổng Compose chỉ bind `127.0.0.1`; TLS ở reverse proxy. Zalo/Meta và nhắc việc/SLA đã có worker riêng, API không còn consumer/timer nhúng. Nếu cần nhiều API replica, cấu hình load balancer và cách publish port phù hợp; mẫu Compose hiện publish một cổng API cố định. Xem `docs/background-workers.md` về chuyển đổi, chống trùng và kiểm thử nhiều instance.
7. Controller mặc định bind loopback: từ thư mục `apps/release-controller` chạy `npm start` dưới supervisor. Public ingress dành CI chỉ chuyển `POST /v1/releases`, có HTTPS và giới hạn truy cập; các đường triển khai/recovery chỉ nằm trong mạng quản trị hoặc SSH tunnel. Không mở toàn bộ controller ra Internet.
8. API CRM đặt `RELEASE_CONTROL_URL` là địa chỉ server-side truy cập được đến controller, `RELEASE_CONTROL_TOKEN` bằng `CONTROL_API_TOKEN`. Trong container, `localhost` là container; cần reverse proxy nội bộ hoặc địa chỉ mạng host được cấu hình riêng. Không đặt token vào `VITE_*`.
9. Áp dụng migration `20261028100000_release_permissions` theo quy trình migration hiện hành, rồi cấp quyền và scope `ALL` cho người vận hành cụ thể. `system.manage` hoặc tên `ADMIN` đơn thuần không cấp quyền triển khai.

## Cấu hình GitHub

Workflow: `.github/workflows/releases.yml`. Registry mặc định là `ghcr.io/<owner>/<repository>/api` và `/web`, tên chuyển về chữ thường. Docker host cần quyền pull các image private; không dùng CI token để cấp quyền shell/SSH.

Repository variables:

| Variable | Ý nghĩa |
| --- | --- |
| `RELEASE_CONTROL_URL` | HTTPS ingress dành riêng cho đăng ký bản phát hành |
| `RELEASE_SCHEMA_GENERATION` | Thế hệ schema đã được DBA xác nhận tương thích, ví dụ `crm-2026-10-28` |
| `PUBLIC_WEB_URL` | URL HTTPS canonical dùng khi tạo link/mã nhúng marketing form |

Secret `RELEASE_CONTROL_CI_TOKEN` phải bằng `CONTROL_CI_TOKEN`. `GITHUB_TOKEN` chỉ cần quyền publish packages trong job publish. Hai image chỉ được đăng ký sau khi toàn bộ quality gate thành công. Build thất bại được xem tại GitHub Actions, không xuất hiện như release có thể chọn. Không triển khai build từ pull request chưa tin cậy.

Giữ lại manifest/digest của các bản đã chạy thành công; không xóa image cần rollback. Thử đăng ký lại **cùng manifest** được chấp nhận; đăng ký commit cũ với image/nội dung khác trả 409.

## Database và migration

Chọn phiên bản **không chạy SQL migration tự động**, không rollback hoặc restore database. Manifest có `schemaGeneration`; controller chỉ cho chuyển trong cùng thế hệ với môi trường. Giá trị này là xác nhận của quy trình phát hành, không phải bộ phân tích tự động tính tương thích SQL.

Với thay đổi schema: sao lưu và restore thử; xác minh baseline và migration status; chạy migration đã review trên staging; nghiệm thu phiên bản cũ/mới; chuẩn bị production theo quy trình vận hành; cập nhật thế hệ schema trong control database bằng thao tác DBA có lưu vết khi không có deployment đang hoạt động. Không dùng việc đổi generation để vượt qua lỗi tương thích.

Repo có cả SQL migration cũ trong `database/migrations` và Prisma migration. **Không chạy mù `prisma migrate deploy` trên database mới/cũ chưa được baseline đúng**. Tính năng này không tự sửa lịch sử migration có sẵn. `prisma db push` chỉ dùng cho database test tạm riêng.

## Khôi phục khi CRM lỗi

Controller có hai endpoint riêng chỉ chấp nhận `CONTROL_RECOVERY_TOKEN` qua kênh quản trị:

- `POST /v1/recovery/deployments`: body `{ "deployment": { "releaseId", "environment", "operation": "rollback", "requestId", "reason" }, "actor": { "id": "<UUID người vận hành>", "name": "<tên>" } }`. Vẫn áp dụng toàn bộ điều kiện tương thích, lịch sử thành công và khóa môi trường. UUID yêu cầu phải giữ nguyên khi thử lại.
- `POST /v1/recovery/reconcile`: body `{ "environment", "observedReleaseId", "reason", "operator" }`, chỉ dùng khi môi trường đang bị khóa. Đây là **xác nhận thủ công của người vận hành**, không phải kết quả health check tự động.

Khi `NEEDS_REVIEW`: xác nhận không còn thao tác Docker chạy dở; kiểm tra image digest của cả bốn service, `/app/release.json` API, web `version.json`, health, worker/queue và database. Sửa/khôi phục stack qua kênh quản trị nếu cần. Chỉ sau khi kiểm tra khớp một release đã đăng ký mới gọi reconcile với release quan sát được và lý do cụ thể. Sự kiện đối soát được lưu trong lịch sử; không biến deployment gián đoạn thành một lần `SUCCEEDED` giả.

Token khôi phục không có quyền xem toàn bộ `/v1`. Lưu manifest/release ID của các bản gần nhất trong hồ sơ vận hành độc lập; người vận hành có thể dùng kênh đọc control database với quyền riêng để tra cứu khi cần. Token này không cấu hình trong CRM hoặc GitHub Actions.

## Giới hạn và nghiệm thu

- Triển khai Compose có thể gián đoạn ngắn; chưa phải blue/green hoặc zero-downtime.
- Không tự khôi phục business data, không tự đổi thế hệ schema, không tự chạy integration gửi tin nhắn qua provider thật.
- Backup, monitoring, rotation token, reverse proxy, quyền Docker và supervisor phải được cấu hình tại hạ tầng thực tế. Kiểm tra riêng các dependency đã có trong repo trước go-live; build hiện vẫn báo npm audit cho dependency tree.
- Controller cần backup database control riêng để giữ lịch sử và khả năng rollback. Phục hồi control database phải đi kèm đối soát trạng thái container thực tế.
- Staging/production dùng cùng web image; `PUBLIC_WEB_URL` được đóng vào lúc build. Canonical URL cho marketing form phải được kiểm tra trước phát hành.

Kiểm tra local đã thực hiện: typecheck ba workspace; unit test hợp đồng/quyền/token; integration với database PostgreSQL tạm riêng cho idempotency, concurrency, promotion, failure blocking và restart recovery; browser fixture cho quyền xem, scope, xác nhận, retry giữ request UUID, nhật ký, trạng thái chưa cấu hình/mất kết nối, desktop/mobile; build Docker web và API, kiểm tra Compose. Xem kết quả chi tiết cập nhật ở cuối file.

Ảnh nghiệm thu nằm trong `artifacts/releases/ui-desktop.png` và `artifacts/releases/ui-mobile.png`. Browser fixture không gọi triển khai thật.

Tài liệu lệnh tham khảo: [Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/), [publishing Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).

## Kết quả kiểm chứng ngày 28/10/2026

| Kiểm tra | Kết quả |
| --- | --- |
| Typecheck API / web / controller | Đạt |
| Unit test API | 267/267 đạt |
| Unit test web | 54/54 đạt |
| Unit test controller | 5/5 đạt |
| Controller integration, database tạm riêng | Đạt |
| Browser desktop/mobile và các trạng thái truy cập | Đạt |
| Build frontend, Docker web/API, Compose config | Đạt |
| Chạy image web: root, SPA, version, 404 asset | Đạt |
| Chạy image API không có mạng: khởi động, liveness, readiness 503 khi DB lỗi, baked commit | Đạt |
| React Doctor, phần diff đã track | 100/100 |
| React Doctor, toàn frontend gồm file mới | 82/100; 33 vấn đề tồn tại ở các file ngoài tính năng phiên bản, không còn chẩn đoán tại trang mới |

Để mở quality gate đã có, cập nhật hai mock còn thiếu trong test lịch sử tạo lead và hai regex trong test mã nhúng để chấp nhận xuống dòng/trailing comma. Các assertion về hành vi, nguồn gửi và URL production được giữ nguyên.

Chưa push/đăng ký release ngoài máy, chưa cấp quyền cho tài khoản thật, chưa áp dụng migration trên database CRM, chưa bật controller hoặc thay đổi phiên bản hệ thống đang chạy. Cần cấu hình host, reverse proxy, database control và GitHub variables/secrets trước khi dùng thực tế. Có mẫu supervisor tại `deploy/release-controller.service.example`.
