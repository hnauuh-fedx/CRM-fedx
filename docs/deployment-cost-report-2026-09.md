# Báo cáo dự toán chi phí triển khai Admission CRM

**Ngày chốt dữ liệu:** 17/09/2026  
**Phạm vi:** chi phí vận hành hạ tầng và dịch vụ bên thứ ba; chưa phải báo giá mua hàng.  
**Nguyên tắc:** chỉ dùng giá niêm yết từ tài liệu/trang chính thức, giữ nguyên USD hoặc VND và không tự quy đổi tỷ giá.

## 1. Kết luận nhanh

DigitalOcean Singapore (`SGP1`) là baseline phù hợp để lập ngân sách ban đầu: có region gần Việt Nam, App Platform, Managed PostgreSQL, Managed Valkey (tương thích Redis) và Spaces object storage/CDN. Tài liệu DigitalOcean xác nhận Singapore là datacenter `SGP1`; cần kiểm tra lại availability của từng SKU tại thời điểm đặt mua ([Regional Availability](https://docs.digitalocean.com/platform/regional-availability/)).

| Kịch bản | Hạ tầng cố định ước tính | GPT theo giả định mẫu | Zalo OA tối thiểu/khuyến nghị |
|---|---:|---:|---:|
| Pilot | **~$71/tháng; $851,08/năm** | **$14,25/tháng** cho 5.000 lần trích xuất | **2.500.000 VND/năm** (gói Tăng trưởng, nếu bật Open API) |
| Production vừa | **~$163/tháng; $1.955,08/năm** | **$142,50/tháng** cho 50.000 lần trích xuất | **2.500.000 VND/năm**; cân nhắc Toàn diện nếu vượt hạn mức |
| HA/tăng trưởng | **~$443/tháng; $5.312,68/năm** | **$712,50/tháng** cho 250.000 lần trích xuất | **6.000.000 VND/năm** (gói Toàn diện) |

Các tổng trên chưa gồm thuế/khấu trừ khi thanh toán dịch vụ nước ngoài, phí chuyển đổi ngoại tệ, lưu lượng vượt quota, email/SMS, WAF, hỗ trợ vận hành, nhân sự DevOps, migration dữ liệu và dự phòng rủi ro. Nên lập ngân sách nội bộ cao hơn baseline 15–25%, nhưng khoản dự phòng này là quyết định quản trị chứ không phải giá nhà cung cấp.

## 2. Căn cứ từ mã nguồn hiện tại

Hệ thống hiện có các thành phần phải triển khai:

- Frontend React/Vite tại `apps/web`; có thể build thành static site.
- API Express/Node.js TypeScript tại `apps/api`.
- PostgreSQL qua Prisma.
- Redis/BullMQ cho webhook bất đồng bộ, automation và Zalo; webhook worker có lệnh chạy riêng trong `docs/deployment.md`.
- Hai worker automation và Zalo hiện được import khi API khởi động; trước khi scale độc lập cần tách lifecycle/entrypoint hoặc bảo đảm mỗi API replica không xử lý job ngoài chủ đích.
- File production theo quy tắc repo phải chuyển sang S3/Cloudinary/MinIO; baseline dùng Spaces S3-compatible.
- Zalo extraction gọi OpenAI Responses API với model mặc định `gpt-5.4-mini`; mỗi request đặt `max_output_tokens: 300`.

Repo hiện chưa có cấu hình production hoàn chỉnh cho container image, CI/CD, secrets manager, reverse proxy/WAF, log tập trung hay runbook khôi phục. Vì vậy chi phí nhân công hoàn thiện production vẫn phải báo giá riêng.

Quy mô hiện tại đã được kiểm kê trong repo: khoảng 70 Prisma models, 25 migrations, 45 web pages, 24 router files với khoảng 220 route declarations, 17 integration suites và khoảng 59.278 dòng trong 342 file TypeScript/TSX/Prisma/SQL được Git theo dõi. Đây là một CRM nhiều module, không còn ở quy mô landing page/CRUD nhỏ; effort triển khai, migration, kiểm thử hồi quy và vận hành phải được dự toán tương ứng. Frontend chưa có test file; health endpoint hiện chỉ trả `{ status: "ok" }`; chưa có Dockerfile, CI/CD/IaC, reverse proxy, Sentry/OpenTelemetry/Prometheus hay object-storage adapter production hoàn chỉnh.

## 3. Đơn giá chính thức dùng trong dự toán

### Compute và frontend

DigitalOcean App Platform là PaaS managed, tính phí theo container và số instance. Giá hiện hành gồm: static site miễn phí (tối đa 3 app static, 1 GiB outbound/app); shared container 1 vCPU/1 GiB `$10` fixed hoặc `$12` có manual scaling; 1 vCPU/2 GiB `$25`; 2 vCPU/4 GiB `$50`; dedicated 1 vCPU/2 GiB `$39`; dedicated 2 vCPU/4 GiB `$78`. Egress vượt quota là `$0,02/GiB`; inbound miễn phí ([App Platform Pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/)).

### PostgreSQL và Redis-compatible cache

- Managed PostgreSQL single-node bắt đầu `$15/tháng` (1 GiB). HA bắt đầu từ primary `$30` cộng ít nhất một standby cùng cấu hình `$30`; storage thêm `$0,21/GiB-tháng` ([PostgreSQL Pricing](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/)). Bảng giá chi tiết hiện niêm yết node 4 GiB/2 vCPU ở `$60,90/tháng` ([Managed Databases Pricing](https://www.digitalocean.com/pricing/managed-databases)).
- Managed Valkey là drop-in replacement tương thích Redis: single-node từ `$15/tháng`; HA từ primary `$30` cộng ít nhất một standby `$30` ([Valkey Pricing](https://docs.digitalocean.com/products/databases/valkey/details/pricing/)).
- DigitalOcean nêu managed database có backup hằng ngày miễn phí; PITR/retention thay đổi theo engine/plan và phải xác nhận trước khi mua ([Backups Pricing](https://www.digitalocean.com/pricing/backups), [Managed Databases](https://docs.digitalocean.com/products/databases/)).

### Object storage, CDN, monitoring và log

- Spaces: `$5/tháng`, gồm 250 GiB storage, 1 TiB outbound và CDN tích hợp; vượt mức là `$0,02/GiB-tháng` storage và `$0,01/GiB` outbound ([Spaces Pricing](https://www.digitalocean.com/pricing/spaces-object-storage)). Spaces không có backup bucket tích hợp; cần thiết kế copy/versioning/DR riêng và tính thêm dung lượng ([Spaces limits](https://docs.digitalocean.com/products/spaces/details/limits/)).
- DigitalOcean infrastructure monitoring/alerting: `$0` ([Monitoring Pricing](https://docs.digitalocean.com/products/monitoring/details/pricing/)). Uptime có một check được credit miễn phí; thêm check là `$1/check-tháng` ([Uptime Pricing](https://docs.digitalocean.com/products/uptime/details/pricing/)).
- Baseline log tập trung dùng Grafana Cloud: Free `$0`, tối đa 50 GB log ingest/tháng, giữ 14 ngày; Pro từ `$19/tháng`, gồm 50 GB ingest và giữ 30 ngày, sau quota tính theo usage ([Grafana Cloud Pricing](https://grafana.com/pricing/)).

### Domain và TLS

- TLS có thể dùng Let's Encrypt với chi phí chứng thư `$0`; Let's Encrypt xác nhận cấp và tự động gia hạn chứng thư miễn phí ([Let's Encrypt](https://letsencrypt.org/about/)). App Platform cũng có HTTPS/CDN managed cho static site.
- Mốc tham chiếu `.com`: Porkbun niêm yết `$11,08/năm` cho đăng ký và gia hạn, đã gồm ICANN/các phí liên quan tại thời điểm khảo sát ([Porkbun domain pricing](https://porkbun.com/products/domains)). Domain thực tế phải tra lại theo tên và TLD khi mua; con số này chỉ dùng để lập baseline.

## 4. Ba kịch bản tải và cấu hình

Các mức người dùng/event dưới đây là **giả định lập kế hoạch, không phải benchmark hay cam kết năng lực của nhà cung cấp**. Cần load test với dữ liệu gần production trước khi ký SLA.

### A. Pilot

Mục tiêu tham khảo: tối đa khoảng 30 nhân sự nội bộ, tải thấp, dưới khoảng 2.000 webhook/ngày; chấp nhận maintenance window và chưa yêu cầu HA.

| Thành phần | Cấu hình | USD/tháng |
|---|---|---:|
| Web | App Platform static | $0 |
| API | 1 shared container, 1 vCPU/2 GiB | $25 |
| Worker | 1 fixed shared container, 1 vCPU/1 GiB | $10 |
| PostgreSQL | Single node, 1 GiB | $15 |
| Valkey | Single node, 1 GiB | $15 |
| Spaces + CDN | 250 GiB/1 TiB outbound included | $5 |
| Monitoring/log | DO Monitoring + Grafana Free + 1 uptime check | $0 |
| Domain `.com` | `$11,08/năm` phân bổ | ~$0,92 |
| **Tổng** |  | **~$70,92/tháng; $851,08/năm** |

Rủi ro: API, worker, database và cache đều có single point of failure; phù hợp chạy thử có kiểm soát, không phù hợp cam kết uptime cao.

### B. Production vừa

Mục tiêu tham khảo: khoảng 30–100 nhân sự, khoảng 2.000–20.000 webhook/ngày; API cần hai replica, PostgreSQL HA, log giữ 30 ngày; worker và cache vẫn chưa HA hoàn toàn.

| Thành phần | Cấu hình | USD/tháng |
|---|---|---:|
| Web | App Platform static | $0 |
| API | 2 × shared 1 vCPU/2 GiB | $50 |
| Worker | 1 × shared 1 vCPU/1 GiB, manual scaling | $12 |
| PostgreSQL | HA tối thiểu: primary + standby, 2 GiB mỗi node | $60 |
| Valkey | Single node 1 GiB | $15 |
| Spaces + CDN | Base plan | $5 |
| Monitoring/log | Grafana Pro base + 2 uptime checks (1 check tính phí) | $20 |
| Domain `.com` | `$11,08/năm` phân bổ | ~$0,92 |
| **Tổng** |  | **~$162,92/tháng; $1.955,08/năm** |

Rủi ro còn lại: một worker hoặc cache hỏng sẽ làm gián đoạn queue; cần theo dõi backlog, retry/dead-letter và có runbook phục hồi.

### C. HA/tăng trưởng

Mục tiêu tham khảo: khoảng 100–300 nhân sự, khoảng 20.000–100.000 webhook/ngày; API/worker chạy ít nhất hai replica, database/cache có standby. Đây vẫn là điểm bắt đầu, không phải sizing cuối cùng cho 500.000+ hồ sơ.

| Thành phần | Cấu hình | USD/tháng |
|---|---|---:|
| Web | App Platform static | $0 |
| API | 2 × dedicated 2 vCPU/4 GiB | $156 |
| Worker | 2 × dedicated 1 vCPU/2 GiB | $78 |
| PostgreSQL | 2 × node 4 GiB/2 vCPU (primary + matching standby) | $121,80 |
| Valkey | HA tối thiểu, 2 GiB primary + standby | $60 |
| Spaces + CDN | Base plan | $5 |
| Monitoring/log | Grafana Pro base + 3 uptime checks (2 check tính phí) | $21 |
| Domain `.com` | `$11,08/năm` phân bổ | ~$0,92 |
| **Tổng** |  | **~$442,72/tháng; $5.312,68/năm** |

Chi phí log vượt 50 GB, storage/egress vượt quota, read replica PostgreSQL, backup object storage độc lập, support plan hoặc WAF chưa nằm trong tổng.

## 5. OpenAI GPT cho Zalo extraction

Repo mặc định dùng `gpt-5.4-mini`. OpenAI niêm yết giá text token: input `$0,75/1M`, cached input `$0,075/1M`, output `$4,50/1M`; regional processing endpoint cộng 10% ([GPT-5.4 Mini model pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini)).

Công thức không dùng cache/không regional uplift:

```text
chi phí = (input_tokens / 1.000.000 × $0,75)
         + (output_tokens / 1.000.000 × $4,50)
```

Ví dụ planning: 2.000 input token và 300 output token/lần gọi (300 là mức trần hiện có trong code) tương đương `$0,00285/lần`.

| Số lần trích xuất/tháng | Chi phí mẫu |
|---:|---:|
| 5.000 | $14,25 |
| 50.000 | $142,50 |
| 250.000 | $712,50 |

Đây là phép tính theo giả định token, không phải phí cố định. Cần log `usage` thực tế, giới hạn độ dài hội thoại, chỉ gọi GPT sau bộ lọc `mayContainLeadInformation`, đặt budget alert và đo lại sau 2–4 tuần pilot.

## 6. Zalo Official Account

Từ 01/06/2026, Zalo có bốn gói OA mới. Trang chính thức nêu ứng dụng nội bộ/bên thứ ba muốn liên kết OA qua API phải dùng **Tăng trưởng hoặc Toàn diện** ([Zalo OA pricing](https://zalo.solutions/oa/pricing), [thông báo áp dụng từ 01/06/2026](https://oa.zalo.me/home/resources/news/chinh-thuc-quyen-loi-va-bieu-phi-cac-goi-dich-vu-zalo-oa-moi-tu-162026-_5100578039811031184)).

| Gói | Giá chính thức | Hạn mức đáng chú ý |
|---|---:|---|
| Tăng trưởng | 2.500.000 VND/năm (~208.000 VND/tháng) | Open API 100 request/phút; tối đa 15 nhân sự OA |
| Toàn diện | 6.000.000 VND/năm (~500.000 VND/tháng) | Open API 2.000 request/phút; tối đa 100 nhân sự OA |

Tin tư vấn ngoài khung 48 giờ sau khi hết quota có giá `55 VND/tin`. Giá Zalo trên trang đã gồm VAT 10%. ZNS/ZBS Template Message có bảng giá riêng và chưa được cộng vì mã nguồn hiện tại chưa cho biết sản lượng gửi hoặc loại template; phải lấy số lượng dự kiến và tra bảng giá ZNS tại thời điểm lập báo giá.

## 7. Ước lượng công triển khai một lần

Bảng dưới đây là **ước lượng kỹ thuật từ khoảng trống hiện tại của repository**, không phải đơn giá thị trường hay báo giá nhà thầu. Một person-day là một ngày làm việc của một người có năng lực phù hợp; có thể phân bổ song song giữa backend, frontend, DevOps, QA và security.

| Nhóm công việc | Person-day tham khảo |
|---|---:|
| Container production, cấu hình môi trường, migration và rollback | 6–10 |
| CI/CD, staging, secrets và custom domain/TLS | 5–8 |
| Object storage, upload/download an toàn và lifecycle file | 5–8 |
| Tách/kiểm soát worker, scheduler và graceful shutdown | 4–7 |
| Health/readiness, log tập trung, metrics và cảnh báo | 5–8 |
| Security/privacy hardening cho dữ liệu lead/admission/student và dịch vụ AI | 10–18 |
| Backup/restore drill, load test và capacity tuning | 6–10 |
| Data migration, smoke/E2E, UAT, runbook, đào tạo và go-live | 12–22 |
| **Tổng tham khảo** | **53–91 person-day** |

Công thức ngân sách nhân công:

```text
chi phí triển khai = person-day × đơn giá nội bộ/nhà thầu mỗi person-day
```

Ví dụ để lập khung ngân sách, không phải báo giá:

| Đơn giá giả định | 53 person-day | 91 person-day |
|---:|---:|---:|
| 4.000.000 VND/ngày | 212.000.000 VND | 364.000.000 VND |
| 6.000.000 VND/ngày | 318.000.000 VND | 546.000.000 VND |

Nên cộng 15–25% dự phòng cho dữ liệu nguồn bẩn, thay đổi nghiệp vụ trong UAT, yêu cầu bảo mật phát sinh và xử lý tích hợp bên thứ ba. Các tính năng chưa nằm trong code hiện tại như cổng thanh toán, tổng đài, portal thí sinh/sinh viên, SMS/email/ZNS quy mô lớn hoặc phê duyệt nhiều cấp phải tách thành dự án/epic riêng, không nằm trong 53–91 person-day trên.

Chi phí vận hành con người cũng chưa nằm trong hóa đơn cloud. Với giai đoạn đầu, có thể lập kế hoạch khoảng 0,2–0,5 FTE/tháng cho theo dõi cảnh báo, vá bảo mật, kiểm tra backup, xử lý queue/dead-letter và hỗ trợ người dùng; quy đổi bằng đơn giá nhân sự thực tế của đơn vị.

## 8. Các khoản cần bổ sung trước khi phê duyệt ngân sách

Không nên ký ngân sách production chỉ từ tiền cloud. Cần lấy báo giá/ước lượng riêng cho:

1. Hoàn thiện container/build pipeline, migrations, secrets, custom domain, rollback và môi trường staging.
2. Tách/kiểm soát worker automation và Zalo khi tăng API replica; kiểm thử idempotency và queue recovery.
3. Migration dữ liệu ban đầu, làm sạch dữ liệu, import file và thời gian downtime.
4. Security hardening, WAF/rate limit ở edge, dependency scanning, penetration test và xử lý dữ liệu cá nhân.
5. On-call, incident response, monitoring dashboard, log redaction, backup restore drill và mục tiêu RPO/RTO.
6. Email/SMS/voice/ZNS, support plan của cloud, phí ngân hàng, thuế nhà thầu/thuế dịch vụ số nếu áp dụng.
7. Staging/UAT: nếu dựng tương đương pilot thì dự trù thêm gần một cấu hình pilot; có thể bật theo giờ/tháng để giảm chi phí.

## 9. Dữ liệu cần thu thập để chốt sizing sau pilot

- Peak concurrent users và request/giây theo endpoint.
- Webhook/ngày, peak request/phút, thời gian xử lý, retry rate, dead-letter rate và queue lag.
- Dung lượng PostgreSQL, tăng trưởng/tháng, connection count, query p95/p99 và index hit rate.
- Redis memory, số job chờ, job/giây và retention.
- File upload/tháng, tổng storage, CDN egress và kích thước file trung bình.
- Log GB/ngày và retention bắt buộc.
- Số hội thoại Zalo được gửi vào GPT, input/output token thực tế và tỉ lệ bị loại trước khi gọi GPT.
- Số tin Zalo ngoài khung 48 giờ, ZNS theo loại template và peak Open API request/phút.

Sau 2–4 tuần pilot, dùng các số đo trên để thay thế giả định trong bảng, chạy load test và chốt cấu hình với ít nhất 30% headroom cho peak đã quan sát.
