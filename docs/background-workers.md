# Worker độc lập và an toàn khi restart

## Tiến trình

- API (`src/api.ts` → `src/server.ts`) ép role API trước khi import module, chỉ phục vụ HTTP, lưu webhook và enqueue. Import API/router không tạo worker Zalo/Meta, không chạy timer nhắc việc/SLA. Meta không còn fallback xử lý tin ngay trong API khi Redis lỗi.
- `npm run worker:integrations --workspace apps/api`: consumer Zalo/Meta, scheduler phục hồi message và refresh Zalo.
- `npm run worker:reminders --workspace apps/api`: consumer quét nhắc việc đến hạn/quá hạn và SLA liên hệ lần đầu.
- Automation, webhook và operations monitor giữ entrypoint riêng đã có. `npm run dev` bổ sung hai worker mới; monitor vẫn chạy riêng bằng `npm run dev:monitor`.

Các module `*-queue.service.ts` là producer; `*-worker.service.ts` chỉ cung cấp factory. Chỉ worker entrypoint gọi factory/scheduler. Một worker process có thể chứa cả Zalo và Meta nhưng không chạy automation worker ngoài ý muốn.

## Cửa sổ lỗi và chống trùng

Webhook được ghi PostgreSQL **trước khi trả 200**. Provider event ID có unique key; khi hai API cùng upsert, lỗi unique conflict được đọc lại thành cùng message. Job ID ổn định theo provider/message ID. Redis/enqueue lỗi trả lỗi cho sender retry; sự kiện đã lưu vẫn được recovery worker tìm lại theo lô tối đa 500. Không tải toàn bộ message về bộ nhớ.

Consumer dùng PostgreSQL session advisory lock theo conversation, không dựa vào Redis lock TTL 120 giây để bảo vệ một tác vụ có thể chạy lâu. Khóa tự giải phóng khi process chết. Table `integration_task_receipts` ghi checkpoint trước hành động và trạng thái `running`, `completed`, `needs_review`.

- Receipt completed: không chạy lại hành động.
- Chưa có receipt: bắt đầu xử lý một lần khi giữ được khóa conversation.
- Receipt running còn sót sau crash hoặc mất kết nối: không tự replay một chuỗi có thể đã tạo lead/activity hoặc gọi bên ngoài; đưa message về `needs_review` để đối soát.
- Lỗi giữa chừng: lưu trạng thái cần đối soát, BullMQ kết thúc job bằng UnrecoverableError. Người vận hành xem trạng thái/lỗi ở nhật ký tích hợp đã có.
- Message đã completed nhưng receipt chưa completed cũng là kết quả chưa xác nhận: có thể còn bước automation sau commit. Recovery không bỏ qua cửa sổ này; đưa về đối soát, không tự tạo lại lead.

Cách này không tuyên bố toàn bộ chuỗi HTTP + PostgreSQL là exactly-once. Một tác vụ bị kill có thể đã ghi một phần; phần đã ghi được giữ lại và cần kiểm tra trước khi xử lý tiếp. Không reset receipt hoặc tạo event mới chỉ để vượt qua trạng thái này. Dữ liệu lead được đối chiếu theo chương trình của connection, tránh liên kết lead cùng số điện thoại ở chương trình khác.

Refresh token Zalo được khóa riêng theo connection và receipt theo token version. Không tự dùng lại refresh token khi lần gọi trước chưa rõ kết quả. Nếu đã đổi token version thành công, có thể xác nhận bước refresh cũ đã xong. Nếu cần sửa thủ công, sử dụng luồng cập nhật kết nối hiện có; token version tăng khi lưu credential mới. Recovery không tiếp tục enqueue receipt đã cần đối soát.

## Nhắc việc và SLA

Scheduler BullMQ có ID cố định `reminders-and-first-contact-sla`, chu kỳ 60 giây; các replica đăng ký cùng ID. Sau restart, worker nhận job chờ/stalled từ Redis và quét lại tác vụ đến hạn trong PostgreSQL.

Giữ cơ chế nghiệp vụ hiện có: claim `due_notified_at`/`overdue_notified_at` và tạo notification/activity trong **cùng transaction**; SLA claim trạng thái job và tạo notification/activity/audit trong cùng transaction, có khóa assignment. Nhiều scan chạy đồng thời hoặc scan lại sau restart không tạo thêm thông báo cho cùng lượt nhắc. Kill trước commit khiến transaction rollback; kill sau commit thì lần sau nhìn thấy claim đã hoàn tất.

Thêm `REMINDER_QUEUE_ENABLED=true`; readiness yêu cầu Redis khi nhóm này bật, và monitor theo dõi `crm_reminders_queue` như các queue khác. Có thể đặt tên reminder queue riêng chỉ trong integration bằng `REMINDER_QUEUE_NAME`.

## Gửi tin ra ngoài và kết quả chưa rõ

Các worker Zalo/Meta ở đây chủ yếu xử lý **tin nhận vào và trích xuất lead**. Email/SMS/ZNS/webhook gửi ra từ automation có delivery record riêng và tiếp tục dùng delivery ID ổn định trong `Idempotency-Key`.

Mặc định không giả định provider hiểu header này. Các cờ sau mặc định `false`:

```dotenv
AUTOMATION_EMAIL_IDEMPOTENCY_SUPPORTED=false
AUTOMATION_SMS_IDEMPOTENCY_SUPPORTED=false
AUTOMATION_ZNS_IDEMPOTENCY_SUPPORTED=false
AUTOMATION_WEBHOOK_IDEMPOTENCY_SUPPORTED=false
```

Khi chưa xác nhận hợp đồng idempotency, timeout/lỗi mạng/HTTP tạm thời và lease gửi đã cũ chuyển delivery sang `needs_review`, không tự gửi lại. Các delivery failed cũ cũng cần đối soát trước khi claim lại. Chỉ bật cờ cho channel khi **mọi receiver/provider đang dùng channel đó** thực sự dedup theo cùng key và có thời hạn lưu key đủ cho retry. Khi bật, retry dùng lại cùng ID; fencing attempt count ngăn worker cũ ghi đè kết quả mới.

Trạng thái cần đối soát phải được kiểm tra với delivery ID/provider delivery ID, log của receiver và bản ghi CRM. Không kết luận “chưa gửi” chỉ vì CRM chưa ghi `sent`. Không có API tự đánh dấu đối soát hoặc xóa receipt/audit trong đợt này; thao tác xử lý sự cố cần người vận hành có quyền và lưu audit.

## Dừng an toàn và triển khai

Worker nhận SIGTERM/SIGINT: ngừng nhận job mới, chờ job hiện tại qua `worker.close()`, sau đó đóng queue, khóa PostgreSQL, Redis và Prisma. `WORKER_SHUTDOWN_TIMEOUT_MS` mặc định 30 giây; quá thời hạn process thoát lỗi để supervisor tiếp quản. Receipt của tác vụ chưa rõ không bị xóa khi dừng. API cũng drain HTTP rồi đóng producer, không dừng tác vụ nghiệp vụ ở process khác.

Compose chạy trực tiếp Node + tsx, có `init: true` và `stop_grace_period: 45s` cho API/worker mới, tránh mất signal ở lớp npm. Nếu tăng timeout ứng dụng, tăng grace period của container/supervisor tương ứng. Không dùng shutdown timeout quá ngắn cho các tác vụ thực tế.

Trước khi bật bản mới:

1. Áp dụng migration `20261028120000_background_task_receipts` theo quy trình database đang dùng; không dùng reset hoặc db push trên dữ liệu thật.
2. Dừng hết API phiên bản cũ còn chứa timer/consumer nhúng, rồi bật API và worker mới cùng release. Không chạy lẫn worker cũ không có receipt trong thời gian chuyển đổi.
3. Chạy tối thiểu một `integrations-worker` khi bật Zalo/Meta, một `reminders-worker` khi bật nhắc việc. API có thể nhân bản với cùng database/Redis, JWT key và cấu hình origin; kiểm thử tải vẫn cần thực hiện trước khi chốt sizing.
4. Operations monitor cùng `OPERATIONS_ENVIRONMENT` sẽ kiểm tra heartbeat từng queue. Controller phiên bản cập nhật cả worker mới bằng cùng image API.
5. Tăng số worker theo tải và connection budget PostgreSQL: mỗi job tích hợp đang chạy giữ một session lock. Pool khóa tối đa 12 connection cho mỗi process tích hợp, ngoài pool Prisma.

Đây là refactor entrypoint/queue/migration, chưa triển khai lên server ngoài máy hoặc thay đổi schema database CRM đang dùng.

## Kiểm thử

```powershell
npm run test:integration:background-lifecycle --workspace apps/api
```

Runner tạo database PostgreSQL riêng `crm_manual_unassign_test_*` và Redis container `crm-background-test-*` với cổng loopback random, rồi dọn sau test. Không dừng Redis hay API CRM đang dùng. Processor tích hợp trong fixture được inject để không gọi Meta/Zalo/OpenAI thật; provider gửi tin là HTTP server loopback giả.

Kịch bản: hai API không có consumer, ingest trùng, restart API không mất job, hai worker tranh cùng sự kiện chỉ ghi một hiệu ứng, graceful drain, kill sau hiệu ứng nhưng trước checkpoint, nhiều reminder scan và restart không tạo trùng, provider đã nhận nhưng mất response được giữ đối soát, provider có idempotency được retry cùng key mà không tạo thêm lần gửi.

Tham khảo: [BullMQ graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown), [job schedulers](https://docs.bullmq.io/guide/job-schedulers/).

### Kết quả xác minh ngày 28/10/2026

- API typecheck và 278/278 unit test đạt; unit test dùng cấu hình giả, tắt queue.
- Integration lifecycle đạt với PostgreSQL tạm và Redis riêng: hai API, hai consumer cạnh tranh, graceful shutdown, kill/restart worker, nhắc việc/SLA không tạo trùng và xử lý kết quả gửi chưa rõ.
- Migration receipt được thực thi trên database tạm. Hai entrypoint `integrations.worker.ts` thật phục hồi message bị thiếu job và chuyển message đã hoàn tất nhưng receipt còn chạy sang `needs_review`; không gọi nhà cung cấp bên ngoài.
- Operations integration, release-controller integration/typecheck và Docker image build đã đạt trong đợt triển khai này. Kiểm thử gửi dùng HTTP receiver giả trên loopback.

Chưa áp dụng migration lên database CRM thật hoặc triển khai lên server. Kiểm thử này xác minh hành vi restart/cạnh tranh; chưa thay thế kiểm thử tải theo lưu lượng thực tế.
