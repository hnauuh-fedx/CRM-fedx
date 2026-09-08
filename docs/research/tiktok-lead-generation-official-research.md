# Nghiên cứu chính thức: TikTok Lead Generation API cho CRM

Ngày đối chiếu: 2026-09-07. Phạm vi tài liệu này chỉ là phần TikTok API for Business/Lead Generation, chỉ dùng nguồn first-party của TikTok. Đây là đầu vào cho bản đánh giá kiến trúc tổng thể; không phải đặc tả triển khai hoàn chỉnh.

## Kết luận ngắn

TikTok chính thức hỗ trợ tích hợp CRM tự xây qua **TikTok Custom API with Webhooks**, với cập nhật lead theo thời gian thực. Luồng advertiser phù hợp là Marketing API v1.3: advertiser authorize developer app, backend đổi `auth_code` lấy **long-term access token**, lấy danh sách advertiser đã cấp quyền, đăng ký webhook và/hoặc dùng Lead Retrieval API. [TikTok Help Center: available CRM integrations](https://ads.tiktok.com/help/article/available-crm-integrations-tiktok-lead-generation?lang=en-GB) [TikTok API for Business: API reference/permission table](https://business-api.tiktok.com/gateway/docs/index?doc_id=1735713875563521&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH)

Điểm quan trọng: không dùng nhầm `/tt_user/oauth2/*` và cơ chế access token 1 ngày/refresh token 1 năm. Tài liệu TikTok phân loại đó là short-term token cho TikTok Account; advertiser Marketing API dùng long-term token và endpoint refresh cũ đã deprecated. [TikTok API for Business: v1.3 deprecations](https://business-api.tiktok.com/gateway/docs/index?doc_id=1740579480076290&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH) [TikTok Account short-term token reference](https://business-api.tiktok.com/gateway/docs/index?doc_id=1738084387220481&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=)

## 1. Developer app, quyền và review

Quy trình chính thức là: tạo TikTok for Business account, đăng ký developer, tạo developer app, cấu hình authorization/authentication rồi gọi API. TikTok có sandbox/Postman để thử nghiệm. [TikTok API for Business: step-by-step workflow](https://business-api.tiktok.com/gateway/docs/index?doc_id=1735713609895937&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH)

Developer profile phải được duyệt trước khi tạo app. Hồ sơ app gồm tên/mô tả, intended uses, quyền kỹ thuật cần thiết, access controls (internal/external), advertiser redirect URL và scopes phù hợp. Tài liệu hiện hành cho phép tối đa 10 advertiser redirect URLs (kể cả localhost), tối đa 5 developer apps/developer; review thường 2–3 ngày làm việc và app bị từ chối có thể sửa rồi gửi lại. Từ 2026-03-20, Accounts API Access Application Form được yêu cầu khi xin nhóm scope “TikTok Accounts”; không thấy tài liệu này nói yêu cầu đó áp dụng riêng cho Lead Management. [TikTok API for Business: create a developer app](https://ads.tiktok.com/gateway/docs/index?doc_id=1738855242728450&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH)

Các permission tối thiểu được xác minh từ bảng API hiện hành:

| Nhu cầu | Permission chính thức |
|---|---|
| Lấy lead và field của form | `Lead Management > Leads Retrieval` |
| Lấy advertiser đã authorize | `Ad Account Management > Ad Account Information > Read Ad Account Information` |
| Tạo/lấy/xóa test lead và export task kiểu `/page/lead/*` | `Lead Management > Test Leads` |
| Liệt kê Instant Page/form library | `Creative Management > Instant Page Management` |

Nguồn: [TikTok API for Business: endpoint and permission table](https://business-api.tiktok.com/gateway/docs/index?doc_id=1735713875563521&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH).

TikTok Help Center quy định chỉ người dùng có quyền **Admin** trên ad account mới được download/manage/delete lead; Operator/Analyst không có quyền download lead. Vì vậy người authorize CRM cần có Admin trên đúng ad account. [TikTok: Leads Data Security](https://ads.tiktok.com/help/article/about-leads-data-security?lang=en)

## 2. Advertiser OAuth và token

Authorization URL được TikTok nêu theo mẫu:

```text
https://ads.tiktok.com/marketing_api/auth
  ?app_id=<APP_ID>
  &state=<CSRF_STATE>
  &scope=<REQUESTED_SCOPES>
  &redirect_uri=<CALLBACK_URL>
```

Callback nhận `auth_code` và `state`; redirect URL phải khớp callback đã cấu hình. Nếu bỏ `scope`, tài liệu nói toàn bộ permission hiện có của app sẽ được xin cấp. `auth_code` của advertiser có hiệu lực 1 giờ và dùng một lần. [TikTok API for Business: authorization concepts](https://business-api.tiktok.com/gateway/docs/index?doc_id=1738928364967937&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH)

Endpoint token được xác minh:

- `POST https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/` — lấy long-term access token với JSON.
- `POST https://business-api.tiktok.com/open_api/v1.3/oauth/token/` — biến thể chấp nhận form-urlencoded hoặc JSON.
- `POST https://business-api.tiktok.com/open_api/v1.3/oauth2/revoke_token/` — revoke long-term token.
- `/oauth2/refresh_token/` đã deprecated vì TikTok cung cấp long-term token.

Nguồn: [API reference/permission table](https://business-api.tiktok.com/gateway/docs/index?doc_id=1735713875563521&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH) và [v1.3 deprecations](https://business-api.tiktok.com/gateway/docs/index?doc_id=1740579480076290&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH).

Tài liệu public truy cập được không nêu thời hạn tuyệt đối của long-term Marketing API token. Không nên giả định token “không bao giờ hết hạn”; hệ thống vẫn cần phát hiện revoke/mất quyền và yêu cầu re-authorize.

## 3. Advertiser và Lead APIs v1.3

Base URL hiện hành là `https://business-api.tiktok.com/open_api`, version hiện hành trong tài liệu là `v1.3`. [TikTok API for Business: API reference](https://business-api.tiktok.com/gateway/docs/index?doc_id=1735713875563521&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH)

| Endpoint | Mục đích | Permission | Mức xác minh |
|---|---|---|---|
| `GET /open_api/v1.3/oauth2/advertiser/get/` | Danh sách advertiser đã cấp quyền cho app | Read Ad Account Information | Endpoint và permission đã xác minh |
| `/open_api/v1.3/lead/get/` | Lấy một Instant Form lead hoặc direct-message lead | Leads Retrieval | Endpoint/mục đích/permission đã xác minh; method/params/payload chưa đủ bằng chứng public |
| `/open_api/v1.3/lead/field/get/` | Lấy fields của Instant Form hoặc direct-message leads | Leads Retrieval | Endpoint/mục đích/permission đã xác minh; params/payload chưa đủ bằng chứng public |
| `GET /open_api/v1.3/page/field/get/` | Lấy fields của Instant Form theo `advertiser_id`, `page_id` | Test Leads | Method/params/response đã xác minh |
| `/open_api/v1.3/page/lead/mock/create/` | Tạo test lead | Test Leads | Endpoint/mục đích/permission đã xác minh; request contract chưa đủ bằng chứng public |
| `/open_api/v1.3/page/lead/mock/get/` | Lấy test leads | Test Leads | Endpoint/mục đích/permission đã xác minh |
| `/open_api/v1.3/page/lead/mock/delete/` | Xóa test lead | Test Leads | Endpoint/mục đích/permission đã xác minh |
| `/open_api/v1.3/page/lead/task/` | Tạo lead download task | Test Leads | Endpoint/mục đích/permission đã xác minh |
| `/open_api/v1.3/page/lead/task/download/` | Download dữ liệu khi task hoàn tất | Test Leads | Endpoint/mục đích/permission đã xác minh |

Nguồn tổng hợp endpoint/permission: [TikTok API for Business API reference](https://business-api.tiktok.com/gateway/docs/index?doc_id=1735713875563521&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH). Chi tiết `/page/field/get/`: [Get the fields of an Instant Form](https://business-api.tiktok.com/gateway/docs/index?doc_id=1739054080455681&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH).

Không nên hard-code danh sách field: TikTok có form field API, trong khi form có thể gồm field chuẩn và câu hỏi tùy biến. Nên lưu raw field list và ánh xạ theo `field_id`/tên được API trả về sau khi kiểm tra payload thật trong sandbox.

## 4. Webhook, retry và idempotency

TikTok xác nhận Custom API with Webhooks là phương thức chính thức để nhận cập nhật lead theo thời gian thực. API reference cũng liệt kê Subscription API generic: `/subscription/subscribe/`, `/subscription/get/`, `/subscription/unsubscribe/`. [Available CRM integrations](https://ads.tiktok.com/help/article/available-crm-integrations-tiktok-lead-generation?lang=en-GB) [API reference/Subscription](https://business-api.tiktok.com/gateway/docs/index?doc_id=1735713875563521&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH)

Tuy nhiên, từ tài liệu public truy cập được **chưa xác minh được** các chi tiết sau cho lead webhook: tên event có đúng là `LEAD` hay không; endpoint/method subscription cụ thể; challenge handshake; cấu trúc payload; header/chữ ký xác thực; thuật toán ký; timeout; lịch và số lần retry; điều kiện ack; thứ tự delivery. Không nên triển khai từ blog/SDK cũ hoặc tự suy diễn Subscription API generic là đủ.

Thiết kế CRM vẫn phải idempotent độc lập với chính sách retry của TikTok: lưu raw event trước, tạo unique key theo `(provider, advertiser_id, external_lead_id)` (hoặc event ID chính thức nếu payload cung cấp), trả 2xx nhanh sau khi persist, xử lý business flow bất đồng bộ và cho phép replay. Đây là khuyến nghị kiến trúc nội bộ, không phải thông số webhook do TikTok công bố.

## 5. Retention, backfill, rate limit và test

- TikTok Ads Manager chỉ lưu lead data trong **90 ngày**; lead có thể được truy cập trong Ads Manager, Leads Center, connected CRM và download qua Marketing API. Vì vậy CRM phải ingest sớm và có retention/privacy policy riêng. [Access Leads data on Instant Forms](https://ads.tiktok.com/resources/help/article/access-leads-data-on-instant-forms?lang=en) [Leads Data Security](https://ads.tiktok.com/help/article/about-leads-data-security?lang=en)
- API chính thức có mock-lead endpoints và lead-download task endpoints, đủ cơ sở để thiết kế test lead và backfill/reconciliation. Tuy nhiên cửa sổ thời gian, filter, pagination, giới hạn số bản ghi và quy trình task cụ thể chưa được xác minh từ trang public truy cập được.
- Chưa xác minh được quota/rate limit riêng cho `/lead/get/`, `/lead/field/get/`, mock lead, subscription hoặc download task. Không ghi một con số chung cho Marketing API vì tài liệu nêu có global và endpoint-specific limits.
- Backfill thực tế không thể vượt dữ liệu TikTok còn lưu. Mốc 90 ngày là retention của Ads Manager được xác minh; phạm vi retrievable qua từng API cần kiểm thử sau khi app được cấp quyền.

## 6. Conversion/CRM event postback

TikTok hỗ trợ CRM signal postback qua Events API. Quy trình first-party: tạo CRM Event Set trong Events Manager, lấy Event Set ID, có thể gọi `/crm/list/`, rồi gửi dữ liệu qua `/event/track/` với `event_source=crm` và `event_source_id=<CRM Event Set ID>`. Sau đó map custom/standard CRM events vào bốn funnel stages và kiểm tra attributed events; tài liệu nói dữ liệu có thể mất khoảng 10 phút để xuất hiện. [TikTok: postback signals through Events API](https://ads.tiktok.com/resources/help/article/how-to-postback-signals-through-events-api?lang=nl-NL)

Endpoint/permission liên quan trong API reference:

- `/open_api/v1.3/event/track/` — Events API 2.0, permission `Measurement > Report Conversion Event`.
- `/open_api/v1.3/crm/list/` — lấy CRM Event Sets, permission `CRM Event Management > Read CRM Event Sets`.
- `/open_api/v1.3/crm/create/` — tạo CRM Event Set, permission `CRM Event Management > Create/Manage CRM Event Sets`.

Nguồn: [TikTok API for Business API reference](https://business-api.tiktok.com/gateway/docs/index?doc_id=1735713875563521&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH).

TikTok khuyến nghị ưu tiên `lead_ID` để tăng match rate và gửi hơn 50 lower-funnel signals trong 14 ngày để kết quả tối ưu ổn định hơn. Với offline CRM signals, `event_time` là Unix timestamp giây ở UTC và tối thiểu cần `lead_ID` hoặc PII như email/phone; event name có thể là standard hoặc custom conversion event. [TikTok: signal postback for lead quality optimization](https://ads.tiktok.com/resources/help/article/about-signal-postback-for-lead-quality-optimization?lang=nl-NL)

Đây nên là giai đoạn sau: việc nhận lead không phụ thuộc conversion postback. Token của Events Manager được tạo trong flow manual setup; cần lưu như secret backend và không mặc định dùng chung với Marketing API access token nếu tài liệu/console không xác nhận.

## 7. Bảo mật và dữ liệu cá nhân

TikTok nêu advertiser và TikTok cùng là data controller đối với lead ads; advertiser phải có privacy policy trong lead ad và có thể thêm custom disclaimer. TikTok chỉ cho Admin xem/download lead PII trong các bề mặt quản lý. [TikTok: Leads Data Security](https://ads.tiktok.com/help/article/about-leads-data-security?lang=en)

Yêu cầu triển khai suy ra cho CRM:

- App secret, Marketing API token và Events API token chỉ ở backend; mã hóa at rest và che khỏi log.
- Sinh, lưu một lần và kiểm tra chặt `state` của OAuth; ràng buộc state với CRM admin, tenant và TTL.
- Chỉ permission CRM phù hợp mới connect/disconnect/sync; quyền TikTok Admin không thay thế RBAC nội bộ.
- Raw webhook chứa PII phải có access control, encryption, redaction, retention/deletion policy và audit trail.
- Khi token bị revoke hoặc advertiser mất quyền: đánh dấu connection degraded, dừng retry mù, cảnh báo admin và yêu cầu re-authorize.
- Không tin metadata trong webhook trước khi xác minh signature theo tài liệu chi tiết do TikTok cung cấp/app console hiển thị.

## 8. Chi phí và điều kiện thương mại

Các nguồn official đã kiểm tra xác nhận có Custom API with Webhooks nhưng **không công bố biểu phí riêng cho Lead Retrieval/Custom API**. Không đủ bằng chứng để nói API miễn phí hoặc có phí. Chi phí chắc chắn cần tách thành: ngân sách quảng cáo TikTok; hạ tầng CRM (HTTPS, database, queue/worker nếu dùng, observability); công phát triển/vận hành; và dịch vụ tùy chọn. Với tích hợp trực tiếp, không có phí Zapier/Make theo thiết kế, nhưng điều đó không chứng minh TikTok API không có điều kiện thương mại hoặc eligibility riêng.

## 9. Những việc phải xác minh trong app console/support trước khi code production

1. App có được cấp đúng `Lead Management > Leads Retrieval` và Read Ad Account Information tại thị trường/tài khoản Việt Nam hay không.
2. Request/response schema chính xác của `/lead/get/` và `/lead/field/get/`, gồm IDs, field data, attribution IDs, cursor/time filters và lookback.
3. Lead webhook: event name, subscribe request, payload mẫu, verification/signature, retry/ack/timeout/order.
4. Rate limits thực tế cho từng endpoint và headers phản hồi.
5. Lifetime/revocation semantics của long-term Marketing API token.
6. Window và constraints của backfill/download task; quan hệ giữa API retention và mốc 90 ngày trong Ads Manager.
7. Request schema test lead và liệu mock event có kích hoạt webhook end-to-end hay chỉ xuất hiện qua mock-get.
8. Terms/eligibility/chi phí nếu TikTok hiển thị điều kiện riêng trong developer console hoặc hợp đồng account.

Không nên đóng băng endpoint, payload hoặc signature vào code trước khi tám mục trên được xác minh bằng app đã duyệt, API Playground/Postman chính thức và webhook mẫu thật.
