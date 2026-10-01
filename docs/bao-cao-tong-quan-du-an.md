# Báo cáo hiện trạng và phương án triển khai Admission CRM

**Ngày cập nhật:** 22/09/2026

**Phạm vi:** triển khai hệ thống lên các nền tảng dịch vụ để có thể vận hành thực tế; không phải roadmap phát triển chức năng nghiệp vụ.

**Căn cứ:** source code hiện tại, `docker-compose.yml`, cấu hình môi trường mẫu, tài liệu webhook, báo cáo chi phí triển khai tháng 09/2026 và các script kiểm thử trong repository.

## 1. Kết luận đề xuất

Phương án phù hợp nhất cho giai đoạn đầu là triển khai trên **DigitalOcean Singapore (`SGP1`)** theo mô hình PaaS managed:

- Frontend React/Vite: DigitalOcean App Platform Static Site.
- Backend API Express: DigitalOcean App Platform Web Service.
- Webhook worker: DigitalOcean App Platform Worker riêng.
- PostgreSQL: DigitalOcean Managed PostgreSQL.
- Redis-compatible queue/cache: DigitalOcean Managed Valkey.
- File: DigitalOcean Spaces và CDN sau khi hoàn thiện adapter upload/download.
- DNS/TLS: custom domain và HTTPS managed; có thể dùng chứng thư Let's Encrypt.
- Log/giám sát: DigitalOcean Monitoring kết hợp Grafana Cloud và uptime check.
- Dịch vụ ngoài: Zalo OA và OpenAI API nếu bật tính năng tiếp nhận Lead từ hội thoại.

DigitalOcean được chọn làm baseline vì có region gần Việt Nam, đủ compute, PostgreSQL, Valkey và object storage trên cùng một nhà cung cấp, phù hợp với đội vận hành nhỏ. Giá và availability của từng SKU cần được xác nhận lại tại thời điểm mua.

Hệ thống **chưa thể đưa thẳng lên production chỉ bằng việc tạo server và chạy lệnh**. Trước go-live cần hoàn thiện container/build, migration production, object storage, worker lifecycle, CI/CD, secrets, monitoring, backup/restore và kiểm thử bảo mật.

## 2. Thành phần cần triển khai

| Thành phần | Hiện trạng trong repository | Đích triển khai đề xuất |
| --- | --- | --- |
| Web | React/Vite tại `apps/web`, build thành static assets | App Platform Static Site/CDN |
| API | Express/TypeScript tại `apps/api` | App Platform Web Service |
| Webhook worker | Có entrypoint và graceful shutdown riêng | App Platform Worker riêng |
| Automation worker | Được khởi tạo khi API import module automation | Tách thành worker/service riêng trước khi scale API |
| Zalo worker | Được khởi tạo khi API import module Zalo | Tách thành worker/service riêng trước khi scale API |
| Reminder processor | Chạy interval trong process API | Chuyển sang scheduled worker hoặc bảo đảm singleton |
| PostgreSQL | Prisma kết nối qua `DATABASE_URL` | Managed PostgreSQL, private networking |
| Redis/BullMQ | Dùng cho webhook, automation và Zalo | Managed Valkey/Redis-compatible |
| File | Hiện chủ yếu lưu metadata và URL | Spaces S3-compatible + signed URL/CDN |
| Webhook public | `/api/webhooks/:webhookKey` | Public HTTPS endpoint qua API service |
| Public Form | `/forms/:publicKey` và public API | Static web + public HTTPS API |
| Zalo OA | Có API/webhook và token mã hóa | Zalo OA Open API + public callback URL |
| OpenAI | Có cấu hình model/API key cho trích xuất Zalo | OpenAI API với budget và usage monitoring |

## 3. Kiến trúc triển khai mục tiêu

### 3.1 Luồng truy cập chính

1. Người dùng truy cập frontend qua domain HTTPS.
2. Frontend gọi API qua `VITE_API_URL`.
3. API xác thực JWT, kiểm tra permission/scope và đọc ghi PostgreSQL.
4. API đưa tác vụ bất đồng bộ vào Valkey/BullMQ.
5. Worker nhận job, xử lý webhook/automation/tích hợp và ghi kết quả về PostgreSQL.
6. File được tải lên Spaces; cơ sở dữ liệu chỉ lưu metadata và object key/URL có kiểm soát.
7. Log, metrics và cảnh báo được gửi đến nền tảng giám sát.

### 3.2 Network và quyền truy cập

- Chỉ frontend, API public route, public form và webhook callback được mở Internet.
- PostgreSQL và Valkey dùng private networking, không mở cổng public nếu không cần thiết.
- Trang quản trị và API nghiệp vụ bắt buộc đi qua HTTPS, authentication, permission và scope.
- Database user của ứng dụng chỉ có quyền cần thiết; tài khoản migration tách riêng nếu nền tảng hỗ trợ.
- Spaces bucket để private; file nhạy cảm dùng signed URL có thời hạn thay vì public URL cố định.
- CORS chỉ cho phép domain frontend chính thức và domain staging tương ứng.

## 4. Môi trường triển khai

### 4.1 Local development

- PostgreSQL và Redis chạy qua `docker-compose.yml`.
- Web mặc định `http://localhost:5173`.
- API mặc định `http://localhost:3000/api`.
- Không dùng dữ liệu production hoặc secret production tại local.

### 4.2 Staging/UAT

- Tách database, Valkey, bucket, domain và secrets khỏi production.
- Dùng dữ liệu giả hoặc dữ liệu đã masking.
- Chạy migration, smoke test, integration test và UAT tại đây trước production.
- Chỉ kết nối Zalo/OpenAI sandbox hoặc tài khoản thử nghiệm khi có thể.
- Có thể dùng cấu hình nhỏ tương đương pilot và bật theo nhu cầu để tiết kiệm chi phí.

### 4.3 Production

- Dùng database, queue, bucket và secrets riêng.
- Chỉ deploy từ nhánh/tag release đã qua quality gate.
- Migration có backup và kế hoạch rollback.
- Bật log tập trung, uptime check, cảnh báo queue/worker và kiểm tra backup.
- Giới hạn quyền truy cập console theo nguyên tắc least privilege và bật MFA.

## 5. Cấu hình dịch vụ đề xuất

### 5.1 Kịch bản Pilot

Phù hợp thử nghiệm có kiểm soát với khoảng tối đa 30 người dùng nội bộ, tải thấp và chưa cam kết HA.

| Thành phần | Cấu hình tham khảo | Chi phí tham khảo |
| --- | --- | ---: |
| Web | Static Site | $0/tháng |
| API | 1 shared container, 1 vCPU/2 GiB | $25/tháng |
| Worker | 1 shared container, 1 vCPU/1 GiB | $10/tháng |
| PostgreSQL | Single node, 1 GiB | $15/tháng |
| Valkey | Single node, 1 GiB | $15/tháng |
| Spaces + CDN | Gói cơ bản | $5/tháng |
| Monitoring/log | Gói miễn phí ban đầu | $0/tháng |
| Domain `.com` | Tham chiếu phân bổ | khoảng $0,92/tháng |
| **Tổng cố định** | Chưa gồm GPT/Zalo/thuế/nhân công | **khoảng $70,92/tháng** |

Rủi ro: API, worker, database và Valkey đều có single point of failure. Chỉ phù hợp pilot có maintenance window.

### 5.2 Kịch bản Production vừa

Phù hợp khoảng 30–100 người dùng và 2.000–20.000 webhook/ngày sau khi load test.

| Thành phần | Cấu hình tham khảo | Chi phí tham khảo |
| --- | --- | ---: |
| Web | Static Site | $0/tháng |
| API | 2 × shared 1 vCPU/2 GiB | $50/tháng |
| Worker | 1 × shared 1 vCPU/1 GiB | $12/tháng |
| PostgreSQL | Primary + standby, 2 GiB/node | $60/tháng |
| Valkey | Single node, 1 GiB | $15/tháng |
| Spaces + CDN | Gói cơ bản | $5/tháng |
| Monitoring/log | Grafana Pro cơ bản + uptime | $20/tháng |
| Domain `.com` | Tham chiếu phân bổ | khoảng $0,92/tháng |
| **Tổng cố định** | Chưa gồm GPT/Zalo/thuế/nhân công | **khoảng $162,92/tháng** |

Điều kiện bắt buộc trước khi chạy nhiều API replica: tách automation worker, Zalo worker và reminder processor khỏi lifecycle của API hoặc có cơ chế singleton/leader election rõ ràng.

### 5.3 Kịch bản HA/tăng trưởng

Phù hợp khoảng 100–300 người dùng và 20.000–100.000 webhook/ngày sau benchmark.

| Thành phần | Cấu hình tham khảo | Chi phí tham khảo |
| --- | --- | ---: |
| Web | Static Site | $0/tháng |
| API | 2 × dedicated 2 vCPU/4 GiB | $156/tháng |
| Worker | 2 × dedicated 1 vCPU/2 GiB | $78/tháng |
| PostgreSQL | Primary + standby, 4 GiB/2 vCPU mỗi node | $121,80/tháng |
| Valkey | Primary + standby, 2 GiB/node | $60/tháng |
| Spaces + CDN | Gói cơ bản | $5/tháng |
| Monitoring/log | Grafana Pro + uptime checks | $21/tháng |
| Domain `.com` | Tham chiếu phân bổ | khoảng $0,92/tháng |
| **Tổng cố định** | Chưa gồm GPT/Zalo/thuế/nhân công | **khoảng $442,72/tháng** |

Đây là cấu hình khởi điểm, không phải cam kết sizing cho hơn 500.000 hồ sơ. Cần dùng metrics pilot và load test để chốt.

Chi tiết căn cứ và đơn giá nằm trong `docs/deployment-cost-report-2026-09.md`.

## 6. Dịch vụ bên thứ ba

### 6.1 Zalo Official Account

- Muốn dùng Open API cần gói Zalo OA phù hợp.
- Baseline hiện tại: gói Tăng trưởng khoảng **2.500.000 VND/năm**.
- Khi số nhân sự/hạn mức API tăng: cân nhắc gói Toàn diện khoảng **6.000.000 VND/năm**.
- ZNS, tin ngoài cửa sổ chăm sóc, template và sản lượng gửi phải dự toán riêng.
- Callback webhook phải dùng HTTPS public và xác minh đúng secret/signature của Zalo.

### 6.2 OpenAI API

- Hiện cấu hình mặc định dùng model `gpt-5.4-mini` để trích xuất thông tin từ hội thoại Zalo.
- Chi phí phụ thuộc số lần gọi và token thực tế, không phải phí cố định.
- Giả định trong báo cáo chi phí: khoảng `$0,00285` cho một lần gọi 2.000 input token và 300 output token.
- Cần ghi nhận usage, đặt budget alert, giới hạn hội thoại và lọc trước khi gọi model.
- API key chỉ lưu trong secrets manager/runtime secret, không đưa vào frontend, log hoặc repository.

### 6.3 Email, SMS, tổng đài và thanh toán

Các dịch vụ này chưa nằm trong cấu hình production hiện tại. Nếu triển khai phải lựa chọn nhà cung cấp, ký hợp đồng, tính phí theo sản lượng và thực hiện security review riêng.

## 7. Biến môi trường và secrets

### 7.1 Frontend

| Biến | Mục đích |
| --- | --- |
| `VITE_API_URL` | URL API public, ví dụ `https://api.example.com/api` |

Biến Vite được đóng vào build artifact, vì vậy không được chứa secret.

### 7.2 API và worker

| Biến | Mức độ | Mục đích |
| --- | --- | --- |
| `DATABASE_URL` | Secret | Kết nối PostgreSQL |
| `JWT_SECRET` | Secret | Ký JWT, tối thiểu 32 ký tự |
| `JWT_EXPIRES_IN_SECONDS` | Config | Thời gian sống access token |
| `PORT` | Config | Cổng API |
| `WEB_ORIGIN` | Config | Origin frontend được phép |
| `REDIS_URL` | Secret | Kết nối Valkey/Redis |
| `WEBHOOK_QUEUE_ENABLED` | Config | Bật queue webhook |
| `WEBHOOK_WORKER_CONCURRENCY` | Config | Mức song song worker |
| `WEBHOOK_MAX_ATTEMPTS` | Config | Số lần retry |
| `WEBHOOK_PROCESSING_STALE_SECONDS` | Config | Ngưỡng job stale |
| `WEBHOOK_RATE_LIMIT_PER_MINUTE` | Config | Rate limit mỗi webhook |
| `WEBHOOK_LOG_RETENTION_DAYS` | Config cần bổ sung vào schema/env | Thời gian giữ log webhook |
| `ZALO_APP_ID` | Secret/config | Zalo application ID |
| `ZALO_APP_SECRET` | Secret | Zalo application secret |
| `ZALO_OA_SECRET_KEY` | Secret | Xác minh callback OA |
| `ZALO_TOKEN_ENCRYPTION_KEY` | Secret | Mã hóa access/refresh token |
| `GPT_API_KEY` | Secret | OpenAI API key |
| `GPT_MODEL` | Config | Model trích xuất |

Ngoài các biến hiện có, khi tích hợp Spaces cần bổ sung endpoint, region, bucket, access key, secret key, CDN/base URL và chính sách signed URL.

### 7.3 Quy tắc quản lý secret

- Không commit `.env` chứa thông tin thật.
- Tách secrets theo môi trường và theo service.
- Có quy trình rotate JWT, webhook, Zalo, OpenAI và storage credentials.
- Không in token, payload nhạy cảm hoặc connection string đầy đủ vào log.
- Người quản trị cloud phải bật MFA và giới hạn quyền theo vai trò.

## 8. Khoảng trống phải xử lý trước khi triển khai

### P0 — Chặn go-live

1. **Container/build production:** repo chưa có Dockerfile cho web/API/worker.
2. **CI/CD:** chưa có pipeline build, test, migration, deploy và rollback.
3. **Database migration:** cần release step chạy `prisma migrate deploy`, backup trước migration và quy tắc migration tương thích ngược.
4. **Worker lifecycle:** automation và Zalo đang chạy cùng API; reminder cũng chạy trong API. Phải tách hoặc bảo đảm chỉ có một instance xử lý.
5. **Object storage:** UI/API hiện nhận URL file; chưa có adapter upload thật vào S3/Spaces và signed URL.
6. **Health/readiness:** `/api/health` mới chỉ trả trạng thái tĩnh, chưa kiểm tra database, Valkey hoặc readiness.
7. **Secrets:** chưa có quy trình secrets manager và rotation production.
8. **Monitoring:** chưa có log tập trung, trace/metrics, queue alert và incident notification.
9. **Backup/restore:** cần xác nhận PITR, backup bucket và diễn tập restore.
10. **Security/privacy:** cần hoàn thiện masking Admission/Student/file/export và kiểm thử scope.

### P1 — Nên hoàn thành trong pilot

1. WAF/edge rate limit cho public form và webhook.
2. Dependency/container scanning và cảnh báo lỗ hổng.
3. Queue dashboard, dead-letter workflow và lịch recovery.
4. Log redaction và retention policy.
5. Load test với dữ liệu gần production.
6. Runbook vận hành, rollback, xử lý queue và sự cố tích hợp.
7. Staging/UAT tách biệt hoàn toàn production.

## 9. CI/CD và quy trình phát hành

### 9.1 Quality gate trên pull request

- Cài dependency bằng lockfile.
- Generate Prisma client.
- Typecheck API.
- Build frontend.
- Chạy unit test automation.
- Chạy integration test phù hợp với database/Valkey tạm thời.
- Scan dependency, secret và container image.

### 9.2 Deploy staging

1. Build artifact/container có version theo commit SHA.
2. Backup database staging nếu migration có dữ liệu quan trọng.
3. Chạy migration.
4. Deploy API và worker cùng một release version.
5. Deploy web với `VITE_API_URL` staging.
6. Chạy smoke test đăng nhập, Lead, public form, webhook, worker và report.
7. Thực hiện UAT và phê duyệt release.

### 9.3 Deploy production

1. Tạo backup/snapshot và xác nhận khả năng restore.
2. Đóng băng thay đổi dữ liệu nếu migration yêu cầu.
3. Chạy migration tương thích ngược.
4. Deploy API theo rolling strategy.
5. Deploy worker đúng release version.
6. Deploy frontend sau khi API tương thích đã sẵn sàng.
7. Chạy smoke test và theo dõi error rate, latency, DB connection, queue lag.
8. Mở lại traffic đầy đủ và ghi nhận biên bản go-live.

### 9.4 Rollback

- Ứng dụng: rollback về container/artifact trước đó.
- Migration: ưu tiên forward-fix và migration tương thích ngược; không tự động rollback migration phá hủy dữ liệu.
- Database restore chỉ dùng khi có quyết định sự cố và chấp nhận mất dữ liệu theo RPO.
- Webhook/queue: tạm dừng worker nhưng giữ durable request trong PostgreSQL, sau đó recovery/replay có kiểm soát.

## 10. Tác vụ vận hành bắt buộc

| Tác vụ | Tần suất đề xuất | Ghi chú |
| --- | --- | --- |
| Webhook queue recovery | 1–5 phút | Chạy script maintenance riêng, bảo đảm singleton |
| Webhook log cleanup | Hằng ngày | Theo retention đã phê duyệt |
| Backup PostgreSQL | Theo dịch vụ managed | Kiểm tra thực tế và diễn tập restore định kỳ |
| Backup/replication Spaces | Hằng ngày hoặc theo RPO | Spaces không thay thế backup độc lập |
| Kiểm tra dead-letter/failed jobs | Liên tục + tổng hợp hằng ngày | Có cảnh báo và owner xử lý |
| Dependency/security update | Hằng tuần/tháng | Theo mức độ lỗ hổng |
| Restore drill | Hằng quý | Ghi nhận thời gian và sai lệch RPO/RTO |
| Capacity review | Sau pilot, rồi hằng tháng | Dựa trên p95/p99 và tăng trưởng dữ liệu |

## 11. Monitoring và cảnh báo

### 11.1 Chỉ số cần theo dõi

- API request rate, error rate, p50/p95/p99 latency và số request 401/403/429/500.
- CPU, memory, restart count và số replica của API/worker.
- PostgreSQL storage, connection, slow query, lock, CPU và replication lag.
- Valkey memory, connection, eviction và availability.
- BullMQ waiting/active/delayed/failed, oldest job age và processing duration.
- Webhook accepted/succeeded/retrying/dead-letter và queue lag.
- Zalo token expiry, callback error, retry và số lần gọi OpenAI.
- OpenAI token usage, cost estimate, error và timeout.
- Spaces storage, request error và outbound bandwidth.

### 11.2 Cảnh báo tối thiểu

- API health fail từ hai khu vực kiểm tra.
- Error rate hoặc latency vượt ngưỡng liên tục.
- Database/Valkey không kết nối được.
- Queue backlog hoặc oldest job age vượt SLA.
- Có dead-letter mới.
- Worker restart lặp lại.
- Storage/database đạt 70%, 85% và 95%.
- Backup thất bại hoặc chưa có backup hợp lệ.
- OpenAI/Zalo usage gần hạn mức ngân sách.

## 12. Backup, RPO và RTO

Mức mục tiêu cần được lãnh đạo phê duyệt. Đề xuất ban đầu:

| Môi trường | RPO đề xuất | RTO đề xuất |
| --- | --- | --- |
| Pilot | Không quá 24 giờ | 4–8 giờ |
| Production vừa | Không quá 1 giờ nếu dịch vụ hỗ trợ PITR phù hợp | 2–4 giờ |
| HA/tăng trưởng | 15–60 phút | 1–2 giờ |

Phải kiểm tra chính sách backup/PITR thật của gói PostgreSQL trước khi mua. Với file, cần versioning hoặc bản sao sang bucket/tài khoản khác. Backup chỉ được coi là hợp lệ sau khi restore thử thành công.

## 13. Kế hoạch triển khai theo giai đoạn

### Giai đoạn 1 — Chuẩn hóa ứng dụng cho production (10–17 person-day)

- Tạo Dockerfile/build configuration cho web, API và worker.
- Tách automation/Zalo/reminder khỏi API hoặc triển khai singleton an toàn.
- Bổ sung object storage adapter.
- Hoàn thiện health/readiness và graceful shutdown.
- Chuẩn hóa env schema và log redaction.

### Giai đoạn 2 — Hạ tầng và CI/CD (10–16 person-day)

- Tạo project, network, PostgreSQL, Valkey, Spaces, domain và TLS.
- Tạo staging và production tách biệt.
- Thiết lập secrets và quyền truy cập.
- Xây dựng pipeline build/test/migration/deploy/rollback.
- Có thể bổ sung IaC sau khi topology được chốt.

### Giai đoạn 3 — Bảo mật, quan sát và phục hồi (15–26 person-day)

- Hardening dữ liệu nhạy cảm, CORS, rate limit và file access.
- Log tập trung, dashboard, metrics và alert.
- Backup/restore, queue recovery và dead-letter runbook.
- Dependency/container scan và security test.

### Giai đoạn 4 — Migration, UAT và go-live (18–32 person-day)

- Làm sạch/import dữ liệu ban đầu.
- Chạy integration, smoke, load test và UAT.
- Kiểm tra Zalo/OpenAI trên tài khoản production.
- Đào tạo người dùng và bàn giao runbook.
- Go-live có giám sát tăng cường và kế hoạch rollback.

**Tổng effort tham khảo:** 53–91 person-day. Đây là ước lượng kỹ thuật, chưa phải báo giá nhà thầu.

## 14. Checklist go-live

### Ứng dụng

- [ ] Web, API và các worker dùng cùng release version.
- [ ] Build frontend và typecheck API thành công.
- [ ] Toàn bộ test bắt buộc pass trên staging.
- [ ] Không còn worker ngoài chủ đích trong API replica.
- [ ] Migration đã chạy thử trên bản sao dữ liệu.

### Bảo mật

- [ ] Không có secret thật trong Git, image hoặc frontend artifact.
- [ ] MFA và least privilege đã bật trên cloud/Zalo/OpenAI.
- [ ] CORS, JWT, permission, scope và masking đã nghiệm thu.
- [ ] Bucket private; file nhạy cảm không dùng public URL cố định.
- [ ] Log đã redaction phone, email, CCCD, token và payload nhạy cảm.

### Hạ tầng

- [ ] PostgreSQL, Valkey và Spaces đúng region/network.
- [ ] Domain, TLS, DNS và webhook callback hoạt động.
- [ ] Health/readiness và graceful shutdown hoạt động.
- [ ] Backup tồn tại và restore thử thành công.
- [ ] Cảnh báo API, database, queue, worker và dung lượng đã thử nghiệm.

### Nghiệp vụ

- [ ] Đăng nhập và chọn đúng chương trình tuyển sinh.
- [ ] Tạo Lead thủ công và qua public form.
- [ ] Nhận webhook `202 Accepted`, worker xử lý và tạo/cập nhật Lead.
- [ ] Phân công, đổi pipeline, reminder và notification hoạt động.
- [ ] Chuyển Lead → Admission → Student đúng điều kiện.
- [ ] Báo cáo/export đúng scope và không lộ dữ liệu nhạy cảm.
- [ ] Zalo OA/OpenAI chạy đúng budget và có cách tắt khẩn cấp.

## 15. Dữ liệu cần đo sau 2–4 tuần pilot

- Peak concurrent users và request/giây.
- API latency p95/p99 và error rate theo endpoint.
- Webhook/ngày, peak/phút, retry, dead-letter và queue lag.
- PostgreSQL storage growth, connection, slow query và index hit rate.
- Valkey memory, job/giây và eviction.
- File upload/tháng, tổng storage và CDN egress.
- Log GB/ngày và retention thực tế.
- Số hội thoại Zalo gọi OpenAI, token/lần và chi phí/ngày.
- Số sự cố, thời gian xử lý và kết quả backup/restore.

Dựa trên số liệu này để chuyển từ Pilot sang Production vừa hoặc HA, giữ tối thiểu khoảng 30% headroom trên peak đã quan sát.

## 16. Quyết định cần phê duyệt

1. Chọn DigitalOcean hay nhà cung cấp khác theo chính sách mua sắm và dữ liệu của đơn vị.
2. Chọn mức Pilot, Production vừa hay HA.
3. Domain chính thức và người sở hữu tài khoản DNS/cloud.
4. RPO, RTO, thời gian bảo trì và mức SLA mong muốn.
5. Retention cho database, webhook payload, audit log và file.
6. Ngân sách cố định cloud, ngân sách OpenAI và gói Zalo OA.
7. Người trực vận hành, nhận cảnh báo và phê duyệt incident/restore.
8. Phạm vi dữ liệu được phép đưa lên cloud và yêu cầu pháp lý/bảo mật nội bộ.

## 17. Kết luận

Admission CRM có thể triển khai thực tế theo mô hình DigitalOcean App Platform + Managed PostgreSQL + Managed Valkey + Spaces. Kịch bản Pilot có chi phí hạ tầng cố định khoảng **$71/tháng**, còn Production vừa khoảng **$163/tháng**, chưa gồm Zalo, OpenAI, thuế, lưu lượng vượt quota và nhân công vận hành.

Trước khi go-live, các việc quan trọng nhất là chuẩn hóa container và CI/CD, tách worker khỏi API, triển khai object storage, hoàn thiện bảo mật dữ liệu, thiết lập monitoring/backup và diễn tập migration/rollback. Sau 2–4 tuần pilot, cần dùng số liệu thực tế để chốt sizing và SLA production.
