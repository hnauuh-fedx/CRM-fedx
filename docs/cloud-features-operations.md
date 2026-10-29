# File private và triển khai phiên bản cloud

Mã nguồn đã có luồng file private và executor Render/Cloudflare tùy chọn. Không tự bật chức năng, đổi `.env` local hoặc tạo tài nguyên provider. Chưa thực hiện nghiệm thu trên tài khoản cloud thật.

## Nâng cấp database trước khi chạy bản mới

- API: migration `20261029100000_private_files` bổ sung metadata/trạng thái/idempotency vào `files`, giữ URL cũ và cho phép managed file không có `file_url`.
- Controller: chạy lại `npm run db:init --workspace apps/release-controller` trên database controller riêng để tạo `deployment_components`; không ghi đè schemaGeneration đã có.
- Review baseline, backup và thử migration trên staging. Không dùng `db push` hoặc reset trên database CRM thật.
- Local giữ `FILE_STORAGE_PROVIDER=external`, `FILE_UPLOADS_ENABLED=false`, `CONTROL_DEPLOYMENT_MODE=compose`; sau khi nâng database, `npm run dev` vẫn chạy mà không cần credentials cloud.

## Kích hoạt R2 trên staging

```dotenv
FILE_STORAGE_PROVIDER=s3
FILE_UPLOADS_ENABLED=true
FILE_UPLOAD_MAX_BYTES=5242880
FILE_UPLOAD_CONCURRENCY=2
FILE_CLEANUP_TTL_SECONDS=86400
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=crm-staging-private
S3_ACCESS_KEY_ID=<server-only>
S3_SECRET_ACCESS_KEY=<server-only>
S3_SIGNED_URL_SECONDS=300
```

Giữ bucket private và credential đúng bucket. API kiểm tra permission/scope trước multipart, giới hạn dung lượng và PDF/JPEG/PNG, kiểm tra chữ ký định dạng/extension/MIME, rồi kiểm tra lại quyền trước finalize. Đây không phải antivirus hoặc chứng nhận file an toàn: cần chốt chính sách kiểm tra hồ sơ trước production. Không inline preview hoặc public-read.

Endpoint mới:

| Endpoint | Hành vi |
| --- | --- |
| `GET /api/files/capabilities` | Đã xác thực; chỉ trả trạng thái và giới hạn |
| `POST /api/leads/:leadId/files/upload` | Multipart một file, bearer token, `X-Institution-Program-Id`, `X-Request-Id` UUID |
| `POST /api/admissions/:leadId/files/upload?documentType=...` | Cùng hợp đồng, giữ mutation/activity/audit tuyển sinh |
| `POST /api/files/:fileId/download-url` | Kiểm tra entity, permission/scope, trạng thái ready trước khi cấp URL có hạn |

Client không được truyền bucket/key. UI giữ form gắn URL cũ và thêm chọn tệp khi capability bật. Retry cùng tệp dùng cùng UUID; thay tệp/đích tạo UUID mới. Tệp ready replay an toàn; pending đang có lease trả 409, pending hết lease có thể tiếp tục với nội dung khớp; failed cần yêu cầu mới. Lease 10 phút bảo vệ writer đang chạy, không giữ transaction DB trong lúc gọi R2.

Signed URL không được lưu vào database/list/log. URL đã cấp có thể còn dùng tới hết TTL sau khi thu hồi quyền; lần xin URL tiếp theo phải kiểm tra lại. Download tài liệu admission giữ các permission nhạy cảm hiện có. External link cũ không bị server fetch lại, tránh tạo đường SSRF mới.

Cleanup tự chạy theo reminders worker khi provider là s3, tối đa 5 record mỗi scan; có thể chạy CLI `npm run maintenance:private-files --workspace apps/api`. Chỉ claim pending/failed/deleting hết TTL, hết lease, chưa có quan hệ sử dụng. Delete object idempotent rồi ghi trạng thái deleted và audit. Không xóa file ready hoặc audit. Đổi bucket chứa dữ liệu hiện có cần migration riêng.

## Kích hoạt controller cloud

Controller phải độc lập CRM API/worker; `compose` vẫn là mặc định, `prepare-only` vẫn chặn deploy. Chỉ chọn mode cloud sau khi staging và tài nguyên provider sẵn sàng:

```dotenv
CONTROL_DEPLOYMENT_MODE=render-cloudflare
CONTROL_CLOUD_TOPOLOGY_FILE=/operator-owned/topologies.json
CONTROL_RENDER_TOKEN=<server-only>
CONTROL_CLOUDFLARE_TOKEN=<server-only>
CONTROL_ARTIFACT_ENDPOINT=https://<account>.r2.cloudflarestorage.com
CONTROL_ARTIFACT_BUCKET=crm-release-artifacts
CONTROL_ARTIFACT_ACCESS_KEY_ID=<artifact-read-key>
CONTROL_ARTIFACT_SECRET_ACCESS_KEY=<artifact-read-secret>
CONTROL_STAGING_CRM_DATABASE_URL=postgresql://<monitor-role>@<direct-host>/crm_staging
CONTROL_PRODUCTION_CRM_DATABASE_URL=postgresql://<monitor-role>@<direct-host>/crm_production
CONTROL_CRM_DATABASE_SSL_CA=<PEM-if-required>
CONTROL_CLOUD_TIMEOUT_MS=600000
```

CRM connections dùng verify-full TLS; role đọc cần SELECT `operations_monitor_states` và `files` để kiểm tra phiên bản worker và khả năng đọc dữ liệu private đã có. Database controller dùng `CONTROL_DATABASE_*` riêng, direct/session pooling để giữ advisory lock.

Topology file có hai khóa staging/production. Mỗi giá trị theo `cloud-plan.ts`: environment, schemaGeneration, renderOwnerId, publicApiOrigin, publicWebOrigin, pages { accountId, projectName, productionBranch }, render { api, webhooks, automation, integrations, reminders, monitor }, requiredCapabilities. Đặt `requiredCapabilities: ["private-files-v1"]` khi dùng file private. Các service ID, Pages project và origin giữa hai môi trường phải tách; database/Redis/bucket cũng phải tách. Chỉ thay nhãn telemetry không phân vùng được các queue hiện có.

Render executor yêu cầu **image-backed services** (runtime image), không dùng trực tiếp Git-backed Docker Blueprint của giai đoạn chuẩn bị. API là web_service, năm tiến trình còn lại là background_worker, cùng image repository; auto-deploy phải tắt. Command chính xác:

| Thành phần | Command |
| --- | --- |
| API | `node --import tsx apps/api/src/api.ts`, hoặc CMD mặc định của API image |
| Webhook | `node --import tsx apps/api/src/workers/webhook.worker.ts` |
| Automation | `node --import tsx apps/api/src/workers/automation.worker.ts` |
| Tích hợp | `node --import tsx apps/api/src/workers/integrations.worker.ts` |
| Nhắc việc | `node --import tsx apps/api/src/workers/reminders.worker.ts` |
| Monitor | `node --import tsx apps/api/src/workers/operations-monitor.worker.ts` |

Tất cả dùng image đã chứa đúng commit; không gán RELEASE_COMMIT khác để vượt probe. Graceful shutdown của Render phải dài hơn timeout ứng dụng. Chọn region/plan theo tải; executor hiện quản lý đủ sáu service, không tự lược bỏ service đang tắt feature.

Pages dùng hai Direct Upload project độc lập, mỗi project có nhánh production cấu hình riêng (mặc định main), không có Git integration tự phát hành. Controller dùng Wrangler phiên bản pin, argv cố định và thư mục artifact đã kiểm tra; không tải CLI động từ browser/CI request. Có Dockerfile riêng `deploy/Dockerfile.controller`.

Đặt controller trên private service/host độc lập với ingress quản trị. CI chỉ cần ingress HTTPS riêng cho POST /v1/releases; deploy/recovery phải ở kênh quản trị hoặc mạng nội bộ. API dùng RELEASE_CONTROL_URL/TOKEN. Không mở toàn bộ controller công khai chỉ vì có bearer token; token Render/Pages không được đưa vào frontend hoặc CI.

## CI và artifact

Giữ repository variable RELEASE_PROVIDER trống/compose cho đường cũ. Chỉ đặt `RELEASE_PROVIDER=render-cloudflare` khi chủ động kích hoạt. Nhánh cloud của workflow releases vẫn chạy quality gates và publish images, rồi build hai frontend biến thể staging/production, upload archive vào bucket release riêng, đăng ký manifest; **không gọi deploy**.

Variables: CLOUD_STAGING_API_URL, CLOUD_STAGING_WEB_URL, CLOUD_PRODUCTION_API_URL, CLOUD_PRODUCTION_WEB_URL, CLOUD_ARTIFACT_ENDPOINT, CLOUD_ARTIFACT_BUCKET. Secrets: CLOUD_ARTIFACT_WRITE_KEY_ID, CLOUD_ARTIFACT_WRITE_SECRET, RELEASE_CONTROL_CI_TOKEN. CI giữ quyền ghi artifact/đăng ký; controller dùng credential artifact đọc riêng, tách bucket hồ sơ.

Chuẩn bị local: `CLOUD_ARTIFACT_ENVIRONMENT=staging|production` và `npm run prepare:cloud:web`. Metadata là `web-artifact-<environment>.json`; tên archive có môi trường/checksum. `npm run publish:cloud-artifacts --workspace apps/release-controller` có tác dụng ghi bucket và đăng ký khi cấp secrets, không chạy chỉ để test local.

Manifest giữ API/web image field cũ và bổ sung provider, capabilities, cloud.staging/cloud.production { key, sha256, size, apiOrigin, webOrigin }. Controller kiểm tra key/commit/checksum, giới hạn archive/expanded size/file count, từ chối traversal/symlink và Pages function/config executable. Image web Docker giữ cho catalog/Compose; Pages dùng archive riêng. Không dùng bundle staging cho production hoặc build lại từ một branch đã thay đổi lúc người dùng chọn bản.

## Deploy, đối soát và rollback

Giữ quyền release.view/release.deploy và scope ALL. Production yêu cầu staging thành công cùng schemaGeneration. Operator review khả năng cuốn chiếu của API/job payload; executor không phân tích SQL hoặc tự tạo maintenance mode cho release không tương thích.

Journal ghi PLANNED/REQUESTED/VERIFYING/VERIFIED/UNKNOWN cho mỗi thành phần, intent trước mutation và provider ID trước polling. Backend/worker cập nhật trước, Pages cuối. Chỉ thành công khi digest, ready API, heartbeat/monitor, Pages canonical deployment, version và origin build đều khớp.

Mất phản hồi sau khi provider có thể nhận lệnh: không tự POST lại; khóa môi trường và giữ journal để đối soát. Backend đạt nhưng Pages lỗi không phải thành công. UI nhật ký hiển thị từng thành phần và trạng thái cần đối soát.

Rollback tái triển khai artifact/digest cũ đã xác minh cho cả Render/Pages, ghi deployment ID mới và verify lại; chỉ chọn release từng thành công và tương thích schema/dữ liệu. Không phụ thuộc preview deployment hoặc lịch sử provider còn giữ. Không rollback database hoặc tự hoàn tác khi kết quả mơ hồ.

Cloud reconcile phải đọc provider và probe phiên bản/heartbeat thực tế trước mở khóa, không chỉ nhận lời xác nhận version. Nếu thành phần chưa đồng nhất, sửa/redeploy qua kênh quản trị có lưu vết rồi mới reconcile. Không sửa schemaGeneration để vượt khóa.

## Kiểm thử

```powershell
npm run test:integration:private-files --workspace apps/api
npm test --workspace apps/release-controller
npm run test:integration --workspace apps/release-controller
npm run test:private-files-browser --workspace apps/web
npm run test:releases-browser --workspace apps/web
```

Test file dùng database tạm và S3 loopback, cloud test dùng Render/Pages giả, không dùng tài khoản thật. Trước production phải nghiệm thu R2, Render image/command/health, Pages/cookie/CORS/callback, restart/rollback, Redis persistence/noeviction, backup/restore và tải thực tế trên staging.

Kết quả xác minh local ngày 29/10/2026:

- API: 298 unit test đạt; frontend: 54 unit test đạt; controller: 13 unit test đạt.
- Typecheck API, frontend và controller đạt. Integration file private, vòng đời worker và controller journal/khóa/recovery đạt trên PostgreSQL tạm.
- Browser smoke test file private và phiên bản đạt ở desktop/mobile; React Doctor 93/100, không báo issue.
- Frontend build đạt, hai lần build cùng commit/cấu hình tạo cùng checksum archive. Docker image controller build đạt; Wrangler 4.155.0 chạy được trong container không mạng.
- Những kết quả này dùng storage/provider giả; chưa thay thế nghiệm thu dịch vụ cloud thật.
