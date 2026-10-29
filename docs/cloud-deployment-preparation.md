# Chuẩn bị Cloudflare, Render và DigitalOcean

**Cập nhật 29/10/2026:** hai chức năng trước đây còn thiếu đã được triển khai theo lựa chọn môi trường. Hướng dẫn vận hành hiện hành ở [cloud-features-operations.md](cloud-features-operations.md). Các phần mô tả “chưa có API/executor” bên dưới ghi lại phạm vi lớp chuẩn bị ban đầu, không còn là trạng thái mã nguồn hiện tại. Chức năng vẫn tắt mặc định và chưa deploy lên provider thật.

Đây là lớp chuẩn bị tùy chọn, chưa triển khai lên dịch vụ bên ngoài. Không thay `apps/api/.env`, không tạo tài khoản/bucket/database, không chạy migration hoặc seed dữ liệu. Local tiếp tục dùng `npm run dev`, PostgreSQL/Redis hiện có và runner Compose cũ.

Kế hoạch hoàn thiện hai chức năng còn lại: [file private R2 và executor phiên bản cloud](cloud-features-implementation-plan.md).

## Đã chuẩn bị và ranh giới kích hoạt

| Phần | Có sẵn sau thay đổi | Chưa tự kích hoạt |
| --- | --- | --- |
| PostgreSQL | URL query và URL direct riêng, TLS verify-full/custom CA, giới hạn pool | Chưa đổi database, trusted sources hoặc migration baseline |
| R2/S3 | Adapter upload server-side, HEAD metadata, URL download có hạn; test qua loopback | Chưa có API/UI upload/download, chưa chuyển các URL đính kèm cũ |
| Render | Mẫu API và năm tiến trình nền, auto-deploy tắt | Chưa import Blueprint hoặc cấp phát dịch vụ |
| Cloudflare Pages | Build sinh `version.json`, mẫu biến public/header, đóng gói artifact và checksum | Chưa upload/publish, chưa đổi DNS/CORS/cookie |
| Phiên bản | CLI tạo kế hoạch cloud chỉ đọc; controller `prepare-only` chặn deploy/recovery | Chưa có executor Render/Cloudflare hoặc rollback phối hợp |
| Redis | Retention job lỗi tùy chọn, local giữ chính sách cũ | Chưa chọn plan, persistence, policy hoặc kiểm thử tải |

Không cần migration database mới cho lớp chuẩn bị này. Các migration chức năng trước đó vẫn phải được baseline và áp dụng theo quy trình hiện có trước khi đưa hệ thống mới vào dùng thật.

## Giữ local chạy được

```powershell
npm ci
npm run prisma:generate --workspace apps/api
npm run dev
npm run deployment:check --workspace apps/api
```

Không bắt buộc thêm biến mới vào `.env` đang dùng. `DATABASE_DIRECT_URL` để trống dùng lại `DATABASE_URL`; `DATABASE_SSL_MODE=url` giữ cách xử lý TLS của connection string cũ. `FILE_STORAGE_PROVIDER=external` giữ luồng đính kèm URL. `QUEUE_FAILED_RETENTION_COUNT=0` giữ chính sách từng queue. `CONTROL_DEPLOYMENT_MODE=compose` giữ triển khai Compose.

Các `.example` trong `deploy/cloud` chỉ là mẫu, không tự được tải khi khởi động. Không đổi file `.env` local sang cấu hình production để thử lớp chuẩn bị.

## PostgreSQL DigitalOcean

Các biến runtime mới trong API:

```dotenv
DATABASE_URL=postgresql://.../crm_staging
DATABASE_DIRECT_URL=postgresql://.../crm_staging
DATABASE_SSL_MODE=verify-full
DATABASE_SSL_CA=
DATABASE_POOL_MAX=3
DATABASE_LOCK_POOL_MAX=3
DATABASE_CONNECT_TIMEOUT_MS=5000
```

- `DATABASE_URL`: query thông thường; có thể dùng transaction pool đã kiểm thử.
- `DATABASE_DIRECT_URL`: kết nối trực tiếp hoặc session pool cho session advisory lock; fallback sang URL cũ nếu không đặt. Worker tích hợp và operations monitor dùng URL này. Prisma CLI ưu tiên URL này để migration đi đường trực tiếp.
- `DATABASE_SSL_MODE=verify-full`: luôn xác minh chứng chỉ và hostname bằng trust store của Node; `DATABASE_SSL_CA` cho PEM riêng nếu provider yêu cầu, hỗ trợ literal `\n`. Tham số SSL trong URL runtime không được ghi đè chế độ xác minh này.
- `DATABASE_SSL_MODE=url`: giữ nguyên cấu hình URL; custom CA runtime yêu cầu chọn verify-full, không bị bỏ qua âm thầm.
- CLI migration có cơ chế TLS riêng của Prisma: cấu hình URL/chứng chỉ theo công cụ và provider; không giả định biến CA runtime tự cấu hình Prisma CLI.

Không đưa session advisory lock qua transaction pooling. Truy vấn receipt dùng chính connection đang giữ khóa để pool nhỏ không cần thêm một slot cho mỗi tác vụ. Pool Prisma vẫn riêng với pool khóa.

Tính tổng connection của **mọi replica**: các pool Prisma đang mở + pool khóa tích hợp + hai connection monitor + controller + phần dự phòng quản trị/migration. Giá trị 3 trong mẫu chỉ là điểm cấu hình, không xác nhận đủ tải hoặc đủ connection. Không dùng chung staging/production để tiết kiệm pool.

Controller có bộ biến riêng `CONTROL_DATABASE_DIRECT_URL`, `CONTROL_DATABASE_SSL_MODE`, `CONTROL_DATABASE_SSL_CA`, `CONTROL_DATABASE_POOL_MAX`; pool controller giữ session lock và cần URL direct/session. Database và user controller vẫn tách biệt database CRM.

Trước khi kết nối thật: chọn region gần Render, cấu hình trusted sources theo outbound IP của Render, bật TLS, review baseline, backup và thử restore. Không chạy mù `prisma migrate deploy` hoặc `db push` lên dữ liệu thật.

## Lưu file R2/S3

Adapter ở `apps/api/src/modules/files/object-storage.ts`. Mặc định `configuredObjectStorage()` trả null. Chỉ tạo S3 client khi chủ động chọn provider `s3` và cung cấp đủ endpoint/bucket/credentials. Không có kết nối R2 khi API khởi động theo luồng cũ.

Adapter có `put`, `inspect`, `downloadUrl`, `close`; key được tạo theo `programs/<programId>/files/<fileId>`, không dùng tên file hoặc email làm key. Download dùng URL có hạn, không có public-read ACL. HTTPS bắt buộc cho endpoint ngoài loopback; local S3 receiver có thể dùng HTTP loopback. Có test bằng HTTP receiver giả, không cần tài khoản R2.

Đây là adapter nội bộ, **không phải cơ chế authorization**. Trước khi tích hợp vào API/UI phải hoàn thiện:

1. Authentication, permission và scope theo lead/hồ sơ; không nhận program/object key tùy ý từ client.
2. Giới hạn dung lượng, loại file, kiểm tra nội dung và quy trình xử lý file không hợp lệ.
3. Metadata qua bảng `files`, `file_relations`, `admission_documents` đang có; lưu provider/object key bằng thay đổi schema được review, không lưu URL ký sẵn có hạn vào `file_url`.
4. Kiểm tra lại scope trước khi cấp URL download; giữ file hồ sơ private. URL cũ chưa bị đổi hoặc mất hiệu lực.
5. Activity/audit, dọn object mồ côi khi ghi database thất bại, chính sách retention và các test quyền chéo chương trình.

`deploy/cloud/r2-cors.example.json` chỉ dành cho GET/HEAD khi cần đọc qua browser; hiện adapter upload qua server, chưa cấp presigned PUT. Chưa có endpoint upload browser để bật PUT CORS. Tên origin/bucket trong mẫu cần thay theo môi trường; CORS không thay thế quyền đọc bucket.

## Render và Redis

Mẫu `deploy/cloud/render.yaml.example` khai báo sáu dịch vụ: API, webhook, automation, tích hợp, nhắc việc, monitor. Mỗi service là một tiến trình, dùng Dockerfile API và build context root của monorepo. Không chạy `npm run dev` trên Render.

- Tạo environment group riêng từ `deploy/cloud/api.env.example`; bổ sung các khóa tích hợp/mã hóa cần thiết theo `apps/api/.env.example`. Không đưa token controller/R2 hoặc DATABASE_URL vào `VITE_*`.
- Chọn region/plan sau khi kiểm thử; mẫu không áp cứng CPU/RAM. Một worker 512 MB không đồng nghĩa năm worker dùng chung 512 MB.
- `autoDeployTrigger: off` ngăn push tự phát hành service đang quản lý phiên bản; lần tạo/import dịch vụ vẫn là thao tác cấp phát/triển khai cần thực hiện riêng khi kích hoạt.
- API nghe `PORT` của Render; health check `/api/ready`. Commit trong readiness/heartbeat ưu tiên `RELEASE_COMMIT`, rồi `RENDER_GIT_COMMIT`, rồi `development`. Với image-backed service, đặt `RELEASE_COMMIT` đúng digest đã đăng ký; metadata runtime không thay thế xác minh artifact.
- Giữ thời gian graceful shutdown của nền tảng lớn hơn `WORKER_SHUTDOWN_TIMEOUT_MS` và kiểm thử kill/restart trên staging.
- Render Key Value cần `noeviction`, persistence phù hợp, cảnh báo memory/connection, API và worker cùng region và URL. Mẫu không tự tạo Redis.
- `QUEUE_FAILED_RETENTION_COUNT>0` giới hạn job lỗi cho webhook/automation và job message tích hợp. Các job scheduler có chính sách riêng sẵn có. Đây không phải giới hạn tổng RAM: số queue, delayed/active job, payload, completed job và telemetry đều chiếm bộ nhớ.
- Retention BullMQ thường dọn khi job kết thúc; không ngay lập tức xóa tồn đọng cũ. Mất bản ghi job cũng mất lịch sử/retry ở queue; không xóa receipt/audit/delivery của database để tiết kiệm Redis.

Operations monitor vẫn chạy độc lập và cần receiver cảnh báo được cấu hình. `AUTH_TRUSTED_PROXY_CIDRS` chỉ đặt sau khi xác minh proxy thực tế; không áp cứng dải IP Cloudflare/Render vào mã nguồn.

## Cloudflare Pages và artifact

Frontend vẫn là Vite static. Build từ root, output `apps/web/dist`. Domain cùng hệ thống như `crm.example.com` và `api.example.com` giúp kiểm thử cookie dễ hơn; `pages.dev`/`onrender.com` khác site cần review cookie/CORS riêng. Dùng URL API tuyệt đối nếu không có proxy `/api` cùng origin.

```powershell
$env:VITE_API_URL='https://api-staging.example.com/api'
$env:VITE_PUBLIC_WEB_URL='https://crm-staging.example.com'
$env:RELEASE_COMMIT=(git rev-parse HEAD)
npm run prepare:cloud:web
```

Lệnh này chỉ build và tạo `artifacts/cloud-preparation/web-<commit>.tar.gz` cùng `web-artifact.json` chứa SHA256, URL public và commit. Không upload/deploy. Kiểm tra đầu ra trước khi dùng; `apps/web/dist` local được build lại nên lần dev tiếp theo vẫn dùng `npm run dev`. Không tự cập nhật `.env` của bạn. Biến tạm trong terminal cần bỏ khi quay lại build local.

Plugin Vite sinh `version.json` cả khi build ngoài Docker, dùng `RELEASE_COMMIT`, `CF_PAGES_COMMIT_SHA`, `GITHUB_SHA` hoặc `development`. Mẫu header cache nằm ngoài thư mục public cho tới lúc chủ động kích hoạt. Kiểm tra SPA deep link, login, refresh cookie, biểu mẫu public và script nhúng sau khi đưa lên Pages.

Workflow `.github/workflows/cloud-preparation.yml` chỉ chạy bằng `workflow_dispatch`, nhận hai URL public, build/upload artifact vào GitHub Actions, không có provider token và không gọi Cloudflare/Render. Workflow Compose cũ vẫn giữ nguyên đường phát hành hiện tại.

## Phiên bản và chế độ chuẩn bị

Runner cloud **chưa được bật/triển khai** trong đợt chuẩn bị này. Manifest Compose cũ và UI Phiên bản vẫn tương thích. Không điền `RELEASE_CONTROL_URL` tới một controller Compose rồi kỳ vọng nó điều khiển Render.

Khi thử controller trong môi trường chuẩn bị cloud, chọn:

```dotenv
CONTROL_DEPLOYMENT_MODE=prepare-only
```

Controller không khởi chạy runner, không nhận yêu cầu deploy hoặc recovery-deploy (HTTP 409), nhưng vẫn có thể quản lý catalog theo quyền/token hiện có. Không dùng chế độ này thay đổi controller Compose đang vận hành nếu chưa có kế hoạch chuyển đổi. Không đổi generation database để vượt qua kiểm tra.

Điền bản sao `deploy/cloud/topology.example.json`, rồi kiểm tra kế hoạch bằng:

```powershell
npm run plan:cloud --workspace apps/release-controller -- <release.json> <cloud-topology.json>
```

Input release dùng schema hiện có, topology chỉ nhận origin HTTPS, account/project và sáu service ID riêng. CLI không đọc provider token, không gọi mạng/DB/Docker, không nhận shell command; output luôn `executable: false`. Placeholder trong topology mẫu cố ý không hợp lệ cho tới khi thay bằng ID thật. Plan chỉ đối chiếu schemaGeneration trong file, không chứng minh schema database thực tế.

Trước khi có thể chọn phiên bản cloud từ CRM, cần triển khai executor và dữ liệu artifact/frontend bất biến, lưu deployment ID mỗi service, polling/commit check, trạng thái thành công một phần, staging gate, reconcile và rollback phối hợp. Build artifact frontend trong workflow chuẩn bị chưa tự được đăng ký thành release có thể triển khai lên cloud.

## Kiểm tra chuẩn bị

```powershell
npm run deployment:check --workspace apps/api -- --target local
npm run deployment:check --workspace apps/api -- --target cloud
```

Chỉ phân tích cấu hình, không truy cập mạng hoặc ghi database, không in URL/secret. Local thiếu biến cloud vẫn đạt. Cloud còn phần chưa kích hoạt sẽ trả `pending` và exit code 1, kể cả khi credentials đúng; không tuyên bố sẵn sàng production chỉ từ việc điền env.

Tiếp tục dùng unit test và integration local có database tạm. Isolated runner ép cả query/direct URL sang database test, không kế thừa direct URL cloud khi test. Không có test gửi dữ liệu lên tài khoản Cloudflare/Render/DigitalOcean trong đợt này.

Tham chiếu: [Render Blueprint](https://render.com/docs/blueprint-spec), [Cloudflare Pages CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/), [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [node-postgres TLS](https://node-postgres.com/features/ssl), [DigitalOcean pooling modes](https://docs.digitalocean.com/products/databases/postgresql/how-to/manage-connection-pools/).

## Kết quả xác minh ngày 29/10/2026

- API: 295/295 unit test đạt, gồm TLS/config, direct URL, retention opt-in, local preflight và S3 receiver giả.
- Controller: 8/8 unit test đạt; prepare-only trả 409 cho deploy/recovery mà không tạo connection database.
- Typecheck API, controller và frontend đạt trong container tạm chỉ đọc, không mạng. Windows từng thiếu bộ nhớ virtual khi chạy typecheck trực tiếp; không đổi cấu hình máy hoặc dừng tiến trình của người dùng.
- Build frontend local sinh version `development`; build artifact cloud với domain giả sinh đúng commit và checksum, không upload.
- Background lifecycle integration đạt với pool query=3, pool khóa=2; monitor và controller integration cũng đạt, dùng PostgreSQL/Redis tạm riêng.
- JSON/YAML mẫu và workflow chuẩn bị parse thành công. Chưa import Blueprint hoặc kiểm thử hành vi trên tài khoản provider thật.

Các container/database thử nghiệm được dọn riêng; không thay database CRM, file `.env` local, DNS, bucket hay cấu hình dịch vụ bên ngoài.
