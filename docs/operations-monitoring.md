# Readiness và giám sát worker

## Hành vi

`GET /api/health` là liveness: tiến trình API còn phản hồi. `GET /api/ready` là readiness: PostgreSQL phải phản hồi và Redis phải trả `PONG` nếu có bất kỳ chức năng Redis nào đang bật. Thời hạn tổng là 3 giây; lỗi, thiếu connection hoặc timeout trả HTTP 503, không lộ lỗi kết nối/credentials.

Các cờ xác định dependency:

| Cờ | Mặc định | Chức năng |
| --- | --- | --- |
| `WEBHOOK_QUEUE_ENABLED` | `true` | Nhập webhook |
| `DISABLE_AUTOMATION_WORKER` | `false` | Khi `true`, tắt automation và các queue phụ |
| `ZALO_QUEUE_ENABLED` | `true` | Xử lý và refresh Zalo |
| `META_QUEUE_ENABLED` | `true` | Xử lý Meta Messenger |
| `REMINDER_QUEUE_ENABLED` | `true` | Nhắc việc và SLA liên hệ lần đầu |

`DISABLE_REDIS=true` chỉ ngắt connection; không tự tuyên bố các chức năng vẫn bật là khỏe. Muốn chạy hoàn toàn không Redis, cần chủ động tắt cả năm nhóm chức năng. Test mode tắt các queue thật; readiness được kiểm thử riêng với dependency được inject.

Heartbeat được gắn trực tiếp vào worker thật: webhook; automation chính, bulk prepare, bulk lead và reassignment; Zalo; Meta; nhắc việc/SLA. Hai nhóm tích hợp và nhắc việc chạy riêng với API theo `docs/background-workers.md`. Mỗi instance ghi queue, định danh instance, commit, heartbeat gần nhất, trạng thái chạy/pause/closing, số lượt hoàn thành/lỗi/stalled và thời gian xử lý gần nhất. Không ghi payload, lead, số điện thoại hoặc token. Heartbeat chỉ được coi khỏe khi worker đang chạy, không pause/closing và heartbeat chưa cũ.

Các instance được tra theo sorted-set index riêng cho từng queue, không dùng `KEYS` hoặc quét toàn bộ Redis. Key heartbeat và index có TTL; mỗi lần lấy mẫu giới hạn tối đa 1.000 instance cho một queue, vượt giới hạn sẽ báo probe lỗi.

## Tiến trình giám sát độc lập

Chạy `npm run monitor:operations --workspace apps/api` từ repo root, hoặc dùng `npm run dev:monitor` sau khi chuẩn bị database. Tiến trình này **không xử lý business job**, không import API hay khởi tạo worker nghiệp vụ. Nó đọc heartbeat/queue, lưu snapshot và trạng thái sự cố vào PostgreSQL, gửi cảnh báo trực tiếp bằng HTTP hoặc log stdout. Redis hỏng không chặn đường gửi cảnh báo.

Database sử dụng migration `20261028110000_operations_monitor_state`. Áp dụng qua quy trình migration hiện hành và backup trước khi làm trên dữ liệu thật. Không tự chạy migration hoặc reset database khi monitor khởi động. Snapshot/state được lưu trong `operations_monitor_states`; một monitor giữ advisory lock trong mỗi database. Chỉ chạy **một replica monitor cho mỗi môi trường**; khi PostgreSQL mất kết nối, monitor dùng trạng thái trong bộ nhớ để tiếp tục cảnh báo. Trong thời gian database hỏng, trạng thái chưa thể lưu bền vững; restart lúc đó có thể phát lại cảnh báo sau thời gian xác nhận.

Monitor chạy riêng với API/worker, nhưng vẫn cần supervisor. Có mẫu `deploy/operations-monitor.service.example`; Compose có service `operations-monitor` riêng, không restart API khi monitor lỗi. Container health check yêu cầu snapshot mới thuộc hostname/commit của chính container monitor, tránh dùng snapshot của bản cũ để báo khỏe.

## Cấu hình

Cấu hình mẫu nằm trong `apps/api/.env.example`. API, tất cả worker và monitor phải dùng cùng `OPERATIONS_ENVIRONMENT`, Redis và cờ chức năng. Mỗi staging/production có database và Redis riêng. Compose tự đặt tên môi trường bằng `CRM_PROJECT`.

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `OPERATIONS_POLL_MS` | 15000 | Chu kỳ lấy mẫu |
| `OPERATIONS_HEARTBEAT_MS` | 15000 | Chu kỳ heartbeat |
| `OPERATIONS_STALE_MS` | 90000 | Heartbeat cũ; tối thiểu ba chu kỳ heartbeat |
| `OPERATIONS_ALERT_AFTER_MS` | 60000 | Thời gian điều kiện phải liên tục xấu trước khi phát cảnh báo |
| `OPERATIONS_RECOVERY_AFTER_MS` | 30000 | Thời gian liên tục khỏe trước khi báo phục hồi |
| `OPERATIONS_ALERT_WEBHOOK_URL` | trống | Không cấu hình thì chỉ xuất structured log |
| `OPERATIONS_ALERT_WEBHOOK_TOKEN` | trống | Bearer token gửi đến receiver, chỉ cần cấu hình trên monitor |
| `OPERATIONS_QUEUE_THRESHOLDS` | `{}` | JSON override ngưỡng theo tên queue thật |

Ngưỡng mặc định cho mỗi queue: `waitingCount=100`, `failedCount=5`, `waitingMs=300000`, `activeMs=900000`, `noProgressMs=600000`. Ví dụ:

```dotenv
OPERATIONS_QUEUE_THRESHOLDS={"webhook_inbound_queue":{"waitingCount":50,"waitingMs":120000},"automation_engine_queue_bulk_prepare":{"activeMs":3600000}}
```

Ngưỡng thời gian tính bằng milliseconds. Cần điều chỉnh theo thời lượng nghiệp vụ thực tế, đặc biệt các job bulk có thể chạy lâu. Monitor dùng tên queue automation integration tùy chỉnh khi `NODE_ENV=integration`, giống worker hiện tại.

## Phát hiện sự cố

- **Worker mất/treo event loop:** không có heartbeat khỏe cho queue sau thời gian xác nhận.
- **Queue tồn đọng:** số job sẵn sàng hoặc delayed đã đến hạn vượt ngưỡng; có tính cả queue đang pause.
- **Chờ lâu:** đầu hàng đợi sẵn sàng được quan sát quá lâu, hoặc job delayed đã quá hạn.
- **Job lỗi:** số job terminal failed đang được lưu vượt ngưỡng; cảnh báo tồn tại đến khi được retry/xử lý. Counter heartbeat cũng ghi nhận các lần thất bại có retry.
- **Job treo trong xử lý:** thời gian từ `processedOn` vượt `activeMs`, ngay cả khi heartbeat vẫn khỏe.
- **Không có tiến độ:** có công việc đến hạn đủ lâu nhưng không có lần xử lý thành công trong khoảng cho phép. Queue rỗng hoặc chỉ có job tương lai không bị báo.
- **Probe lỗi:** Redis còn ping được nhưng không đọc được một queue thì có cảnh báo riêng. Các tình trạng queue chưa xác định không được dùng để báo phục hồi giả.
- **Redis/database lỗi:** điều kiện độc lập; PostgreSQL lỗi vẫn có thể gửi cảnh báo qua HTTP/stdout bằng trạng thái trong bộ nhớ.

Không tải toàn bộ job: lấy count, đầu FIFO/priority/paused, 100 active job cũ nhất, và score/count delayed từ Redis. `waitingAgeMs` cho đầu queue sẵn sàng là **cận dưới từ lần đầu monitor quan sát cùng job**, được lưu qua restart; không dùng `job.timestamp` để tránh tính nhầm thời gian hẹn chạy là thời gian tồn đọng. Khi monitor mới được cài đặt, chỉ số này cần thời gian quan sát. Với delayed, đọc due timestamp theo định dạng score BullMQ v5, đã có integration test với Redis thật. Khi nâng major BullMQ phải kiểm tra lại phép đọc score.

## Cảnh báo và chống trùng

Log `operations_alert` được phát khi chuyển `FIRING`/`RESOLVED`; không phát lại mỗi poll. Pending event được lưu trước khi gửi; HTTP receiver trả 2xx mới được xem đã nhận. Thất bại retry theo backoff 30 giây đến tối đa 15 phút, dùng lại `Idempotency-Key`. Receiver cần dedup theo event ID vì giao nhận là at-least-once, không thể bảo đảm exactly-once giữa HTTP và PostgreSQL.

Outbox gộp trạng thái chưa gửi của cùng điều kiện thành trạng thái mới nhất, giới hạn backlog theo số điều kiện; lịch sử giữ 100 lần chuyển gần nhất. Nếu receiver ngừng hoạt động suốt một sự cố đã phục hồi, nó sẽ nhận trạng thái phục hồi mới nhất; log và lịch sử vẫn ghi nhận lần phát sinh. Không dùng bảng này thay thế hệ thống lưu log dài hạn.

Payload receiver:

```json
{
  "eventId": "environment:condition:incident-time:FIRING",
  "environment": "production",
  "condition": "queue:webhook_inbound_queue:worker",
  "state": "FIRING",
  "message": "...",
  "observedAt": "2026-10-28T00:00:00.000Z"
}
```

URL receiver bắt buộc HTTPS ở production; chỉ cho HTTP loopback khi test/development. Không theo redirect, timeout HTTP 5 giây, tối đa 10 lần gửi song song mỗi poll. Không log URL, token, payload job hay response body của receiver. Chưa cấu hình địa chỉ nhận thực tế nên không gửi email/chat bên ngoài; có thể dùng receiver chuyển tiếp đến kênh vận hành phù hợp.

## Đọc trạng thái và giám sát monitor

`GET /api/system/operations` yêu cầu session, quyền `system.manage` và scope `ALL`. Response chỉ chứa snapshot kỹ thuật, sự cố, 100 sự kiện gần nhất và số cảnh báo chờ gửi. Không trả observation job IDs hoặc thông tin webhook receiver. Không có endpoint sửa/xóa lịch sử giám sát.

Không có snapshot hoặc snapshot cũ trả HTTP 503; ngưỡng snapshot cũ là lớn hơn giữa 60 giây và 4 chu kỳ poll. Cần cấu hình hệ thống uptime bên ngoài kiểm tra endpoint được bảo vệ này hoặc supervisor/container health: một monitor không thể tự phát cảnh báo khi toàn bộ host của nó đã ngừng hoạt động. `/api/ready` vẫn chỉ kiểm tra dependency phục vụ; không đưa backlog worker vào readiness để tránh restart API hàng loạt khi một queue chậm.

## Kiểm thử local

```powershell
npm run test:operations --workspace apps/api
npm run test:integration:operations --workspace apps/api
```

Integration cần Docker Desktop và PostgreSQL local trong `apps/api/.env`; user database cần quyền tạo database test. Script tạo Redis container cổng random chỉ bind loopback và database `crm_ops_test_*`, áp dụng riêng SQL monitoring, dùng worker giả xử lý dữ liệu giả và receiver HTTP loopback. Nó không pause Redis đang dùng bởi CRM, không gọi provider thật và dọn toàn bộ tài nguyên test sau khi chạy.

Các tình huống: job tương lai, delayed quá hạn, tồn đọng, job lỗi/retry, worker heartbeat khỏe nhưng job treo, worker bị dừng, monitor restart không gửi trùng, Redis bị pause và phục hồi; cảnh báo vẫn đến HTTP receiver khi Redis đang dừng. Đồng thời xác nhận readiness thất bại khi webhook tắt nhưng automation bật và Redis ngừng phản hồi. Unit test kiểm tra timeout, flag dependency, ngưỡng, debounce, trạng thái unknown và backoff.

Tham khảo hợp đồng queue: [BullMQ architecture](https://docs.bullmq.io/guide/architecture), [BullMQ metrics](https://docs.bullmq.io/guide/metrics/).

## Kết quả kiểm chứng ngày 28/10/2026

- Toàn bộ 275 unit test API đạt; trong đó có 8 test riêng cho readiness/monitoring.
- Integration Redis container và PostgreSQL tạm riêng đạt, bao gồm Redis outage vẫn gửi được cảnh báo đến receiver HTTP local, delayed quá hạn và không lộ payload job.
- Typecheck API/controller đạt; integration controller quản lý phiên bản vẫn đạt sau khi thêm service monitor.
- Build Docker API và kiểm tra Compose/YAML đạt. Không triển khai ra môi trường ngoài máy.
- Các database/container test đã được dọn. Chưa áp dụng migration lên database CRM đang dùng, chưa cấu hình receiver cảnh báo thực tế.

Các file chính: `src/modules/operations/*`, `src/workers/operations-monitor.worker.ts`, hook trong các worker webhook/automation/Zalo/Meta, cấu hình Redis/readiness, Prisma schema/migration, `.env.example`, và `deploy/compose.yml`. API chẩn đoán là backend; chưa bổ sung một trang dashboard giám sát riêng trên frontend.
