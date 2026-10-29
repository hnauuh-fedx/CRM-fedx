# Kế hoạch hoàn thiện file R2 và phiên bản cloud

Ngày lập: 29/10/2026. Tài liệu này ghi phạm vi và tiêu chí của kế hoạch; trạng thái thực hiện được cập nhật bên dưới.

Cập nhật thực hiện: phần mã nguồn file private, cleanup, UI, manifest/journal, provider executor và CI có điều kiện đã được triển khai/test local. Xem [runbook hiện hành](cloud-features-operations.md). Nghiệm thu với tài khoản R2/Render/Pages thật và kích hoạt production vẫn là bước vận hành riêng, chưa thực hiện.

## Mục tiêu và mặc định tương thích

1. Người dùng có quyền có thể chọn file trên máy để đính kèm lead/hồ sơ, sau đó tải file private qua R2.
2. Người vận hành có thể chọn bản phát hành trong CRM để triển khai hoặc quay về phiên bản tương thích trên Render và Cloudflare Pages.

Local tiếp tục chạy bằng `npm run dev`; URL đính kèm cũ và runner Compose vẫn được hỗ trợ. Provider cloud chỉ hoạt động khi chọn rõ cấu hình và bật chức năng tương ứng. Test tự động không cần tài khoản cloud; nghiệm thu staging thật là bước riêng trước production.

Các điểm đã có để tái sử dụng: adapter S3/R2, `files`/`file_relations`/`admission_documents`, permission/scope, activity/audit, catalog release, UUID request, khóa môi trường, staging gate, schemaGeneration, heartbeat và recovery của controller.

## A. Upload/download file private trên R2

### Thiết kế cho phiên bản đầu

- Upload qua API theo multipart với giới hạn dung lượng, số lượt đồng thời và timeout; chưa dùng presigned PUT từ browser. Cách này tận dụng adapter `put` hiện có và kiểm tra nội dung trước khi ghi vào R2.
- Phạm vi đầu tiên: file đính kèm lead và tài liệu tuyển sinh hiện đang dùng bảng `files`. Hồ sơ học viên truy cập qua quan hệ/phạm vi nghiệp vụ hiện có. Không gộp thêm avatar hoặc sửa luồng import Excel.
- Khởi đầu với PDF/JPEG/PNG, đề xuất tối đa 5 MB/file, cấu hình qua env; bổ sung định dạng khác sau khi có kiểm tra nội dung phù hợp. Ngưỡng cuối cùng cần xác nhận theo loại hồ sơ thật trước production.
- Bucket private; object key do server tạo bằng UUID và chương trình tuyển sinh. Client không được truyền key/bucket tùy ý. Không chứa tên, email hoặc số điện thoại trong object key.
- Giữ tùy chọn gắn URL cũ. UI chỉ hiện upload khi API công bố capability đã bật; API kiểm tra lại độc lập với UI.

### Các phần việc và điều kiện hoàn thành

| Mã | Công việc | Kết quả nghiệm thu | Phụ thuộc |
| --- | --- | --- | --- |
| F1 | Mở rộng model và hợp đồng file | Migration bổ sung, URL cũ giữ nguyên; DTO phân biệt file external và file managed | Không |
| F2 | Upload có scope và idempotency | Upload thành công tạo đúng một file association/activity/audit; retry cùng request không tạo trùng | F1 |
| F3 | Download private có quyền | Chỉ người được phép xem entity và dữ liệu nhạy cảm mới nhận URL ngắn hạn | F1, F2 |
| F4 | UI chọn file và mở file | Tiếng Việt, trạng thái đang tải/lỗi/thử lại, hỗ trợ bàn phím và mobile; URL cũ vẫn dùng được | F2, F3 |
| F5 | Dọn upload dở và kiểm thử lỗi | Crash/restart, lỗi R2 hoặc commit DB không tạo file ready sai hoặc xóa nhầm object đã liên kết | F2 |
| F6 | Nghiệm thu local và staging | Test bằng storage giả đạt; sau đó xác minh bucket/domain/credentials thật trên staging | F3–F5 |

### F1: Dữ liệu và hợp đồng

Review lại schema trước migration, mở rộng bảng `files` thay vì tạo bảng file nghiệp vụ trùng:

- `storage_provider`: external hoặc s3; bản ghi cũ mặc định external.
- `storage_bucket`, `object_key`: chỉ dành cho managed file, có unique/index phù hợp để đối chiếu object.
- `storage_status`: pending, ready, failed, deleting; truy vấn người dùng chỉ trả file ready.
- `institution_program_id`: scope của managed file, đối chiếu lại với entity đang liên kết.
- Request ID và thông tin kiểm tra integrity như checksum/size/type để phục hồi và chống trùng. Unique request phải gắn với người dùng và đích nghiệp vụ; dùng lại request cho payload/đích khác trả conflict.
- `file_url`: giữ URL của external file; cho phép không có URL đối với managed file bằng migration bổ sung được review. Không ghi signed URL vào cột này.

DTO mới trả `storageKind`/`canDownload` và metadata được serialize rõ ràng. Không trả credentials, raw bucket/key hoặc signed URL trong danh sách hàng loạt. Chỉ file external mới có link URL cũ. Kiểm kê các serializer lead/admission/student đang dùng `file_url` trước khi thay kiểu.

Migration theo hướng expand trước; triển khai code tương thích và giữ upload tắt, rồi mới bật tạo managed file. Khi đã có file private, không rollback về bản chưa hỗ trợ loại file này; ghi nhận yêu cầu tương thích trong release/schema generation đã review.

### F2: Upload và giao dịch

API dự kiến:

- `POST /api/leads/:leadId/files/upload`: multipart + request UUID; authentication, quyền upload hiện có và scope lead.
- Endpoint tương ứng trong domain admission cho tài liệu tuyển sinh, giữ permission và các mutation/audit của domain đó.
- Endpoint capability chỉ công bố trạng thái bật, loại file và giới hạn; không công bố cấu hình hạ tầng.

Luồng xử lý:

1. Xác thực, kiểm tra permission/scope trước khi nhận nội dung tốn tài nguyên; giới hạn multipart, filename, byte thực tế, MIME và nhận diện định dạng. Không tin extension hoặc MIME do client gửi. Từ chối file thực thi, HTML/SVG hoặc định dạng ngoài allowlist.
2. Tạo record pending và đích liên kết trong transaction ngắn, dựa trên request UUID. Record pending chưa được expose như file dùng được.
3. Upload tới key server đã tạo, ngoài transaction database; kiểm tra lại size/type và integrity bằng adapter. Không giữ transaction mở trong lúc gọi R2.
4. Kiểm tra lại quyền, scope và trạng thái entity trước khi chuyển pending thành ready. Cập nhật metadata, liên kết nghiệp vụ, activity và audit trong một transaction có điều kiện claim.
5. Retry cùng UUID trả lại kết quả cũ hoặc trạng thái đang xử lý; không thực hiện song song nhiều lần upload cùng key. UUID dùng với nội dung khác trả 409.

Nếu quyền bị thu hồi, entity bị xóa/chuyển chương trình hoặc commit thất bại sau upload: không chuyển ready; ghi nhận cleanup cần làm. Không trả URL ký sẵn trong lỗi/log. Chính sách kiểm tra malware cần được chốt trước khi cho phép thêm định dạng hoặc dùng dữ liệu thật; không tuyên bố file đã được quét khi chưa có scanner.

### F3: Download

- `POST /api/files/:fileId/download-url`: yêu cầu bearer session và không cache; resolve file qua quan hệ entity, kiểm tra permission + scope + ready state. Với tài liệu nhạy cảm, giữ thêm quyền tương ứng của domain admission/student.
- Không cấp quyền chỉ dựa vào uploaded_by, ID file hoặc việc đoán đúng key. Kiểm tra mọi quan hệ có thể cho phép truy cập; file không có entity hợp lệ không được tải.
- Cấp URL attachment ngắn hạn, mặc định theo cấu hình 300 giây; không log URL/token. Ghi audit phù hợp cho cấp quyền tải file nhạy cảm.
- UI gọi API đã xác thực rồi mở URL trả về. Không dùng anchor tới API cần bearer vì browser không tự gửi access token theo cách đó.
- Khi mất quyền, lần xin URL tiếp theo phải bị từ chối. URL đã cấp là bearer capability và có thể dùng tới khi hết hạn; muốn thu hồi tức thì phải dùng proxy download, không hứa điều đó với presigned URL.
- External link cũ vẫn mở theo hành vi hiện tại; không thêm chức năng server fetch URL tùy ý để tránh mở đường SSRF.

### F5–F6: Cleanup, kiểm thử và kích hoạt

Bổ sung thao tác delete vào adapter và worker cleanup có batch/TTL/claim. Chỉ dọn managed object của record pending/failed hết hạn đã được claim; kiểm tra lại quan hệ và trạng thái trước khi xóa. Retry cleanup phải idempotent, không xóa audit hoặc file ready. Không quét/xóa cả bucket dựa vào việc object chưa xuất hiện trong một truy vấn tức thời.

Test bắt buộc: đúng/sai permission; chéo chương trình; tài liệu nhạy cảm; spoof MIME; vượt dung lượng; multipart không hợp lệ; trùng request; timeout R2; process chết trước/sau upload và trước/sau commit; download hết hạn; quyền bị thu hồi; cleanup cạnh tranh với hoàn tất upload; URL cũ vẫn dùng được.

Local dùng receiver S3 giả cùng database tạm; browser test đi qua API thật. Chỉ khi local đạt mới bật provider trên staging và kiểm tra bucket private, CORS cần thiết, giới hạn tải và credential scope. Production bật bằng cờ riêng sau nghiệm thu. Bật cờ không tự migrate URL/file lịch sử sang R2.

## B. Executor Render/Cloudflare cho trang Phiên bản

### Thiết kế cho phiên bản đầu

- Controller độc lập với API CRM và worker, có kênh recovery được bảo vệ. Provider `compose` vẫn là mặc định; `prepare-only` vẫn chặn mọi thực thi. Thêm cloud executor theo lựa chọn môi trường rõ ràng.
- Service ID, account/project, URL probe và secret là cấu hình của người vận hành. Browser chỉ gửi release ID, môi trường, thao tác, request UUID và lý do như hiện tại; không gửi command, token hoặc provider target.
- Staging/production dùng tài nguyên tách biệt: database, Redis, bucket/prefix có policy tương ứng, Pages project và service Render. Tên queue hiện có chưa phân vùng đầy đủ theo môi trường nên không dùng chung Redis instance rồi chỉ đổi nhãn telemetry.
- API và năm tiến trình nền dùng cùng image digest. Frontend dùng artifact đã build và kiểm tra checksum, không build lại từ một nhánh Git có thể đã đổi trong lúc người dùng chọn release.
- Không có giao dịch nguyên tử giữa hai nhà cung cấp. Trạng thái thành công một phần phải được lưu, đối soát và khóa môi trường khi chưa rõ.

### Các phần việc và điều kiện hoàn thành

| Mã | Công việc | Kết quả nghiệm thu | Phụ thuộc |
| --- | --- | --- | --- |
| C1 | Manifest cloud và lưu artifact | Nhận diện chính xác commit/digest/checksum/config build; manifest Compose cũ vẫn hợp lệ | Không |
| C2 | Journal triển khai từng thành phần | Lưu intent, provider ID, lần thử, trạng thái và bằng chứng xác minh bền vững | C1 |
| C3 | Adapter Render | Triển khai đúng digest cho sáu service cấu hình sẵn; polling và phát hiện deploy ngoài controller | C1, C2 |
| C4 | Adapter Cloudflare Pages | Publish đúng frontend artifact cho project/môi trường đã chọn; lấy deployment ID và xác minh version | C1, C2 |
| C5 | Điều phối, recovery và rollback | Không báo thành công khi còn thành phần sai phiên bản; restart không deploy trùng mù quáng | C3, C4 |
| C6 | CI và UI Phiên bản | Push chỉ build/đăng ký; UI hiển thị từng thành phần, lỗi một phần và thao tác được phép | C1, C5 |
| C7 | Kiểm thử và nghiệm thu staging | Fake providers/local đạt; sau đó deploy/restart/rollback trên tài nguyên staging thật | C3–C6 |

### C1: Manifest và frontend theo môi trường

Mở rộng schema theo version/provider, giữ parser/backward compatibility cho manifest Compose hiện tại. Cloud manifest dự kiến gồm:

- Commit đầy đủ, version, schemaGeneration, build URL và API image digest đã được registry allowlist.
- Frontend artifact cho từng môi trường: bucket/key hoặc artifact locator thuộc nguồn đã allowlist, checksum SHA256, kích thước, commit và cấu hình public đã dùng lúc build.
- Capability/tương thích dữ liệu cần thiết, chẳng hạn hỗ trợ private files, để chặn rollback về code không đọc được dữ liệu đã phát sinh.

`VITE_API_URL` và `VITE_PUBLIC_WEB_URL` được nhúng lúc build: staging và production thường có artifact khác nhau dù cùng commit. Chọn hướng build sẵn hai biến thể theo cùng commit, lưu checksum riêng; không dùng trực tiếp bundle staging cho production. Đổi cách đặt tên artifact hiện tại để tránh build hai lần ghi đè `web-<commit>.tar.gz` trong cùng thư mục.

Artifact frontend cần lưu bền vững trong kho release riêng, tách bucket/prefix và credentials với hồ sơ người dùng; không chỉ dựa vào artifact GitHub có hạn lưu. Đăng ký lại cùng commit/variant chỉ được chấp nhận nếu nội dung giống; khác checksum/config phải bị từ chối. Kiểm tra checksum trước publish và giới hạn dung lượng/số file/đường dẫn khi giải nén, từ chối traversal/symlink.

Staging gate xác nhận cùng commit và API digest, cộng với biến thể frontend production được tạo trong build đã kiểm tra. Không tuyên bố hai frontend bundle giống byte khi cấu hình public khác nhau.

### C2: Journal và state machine

Review schema controller trước migration bổ sung. Tái sử dụng `deployments`, `deployment_events`, `environments`, thêm bảng/record thành phần theo deployment để lưu:

- Component/service/project đã chọn từ cấu hình; target digest/checksum và phiên bản trước đó.
- Intent/request UUID, provider deployment ID, trạng thái, timestamp, deadline, lần quan sát cuối và kết quả verify.
- Mã lỗi đã sanitize, actor/lý do qua journal hiện có; không lưu provider token hoặc signed artifact URL trong log.

Giữ một deployment hoạt động mỗi môi trường và khóa runner. Ghi intent trước khi gọi provider; lưu provider ID ngay khi có. Nếu timeout/mất phản hồi sau khi provider có thể đã nhận yêu cầu, tra cứu/đối soát lần deploy phù hợp; chỉ tiếp tục nếu nhận diện được duy nhất. Không mặc định API provider có idempotency giống database CRM, không retry tạo deploy khi chưa rõ kết quả.

Môi trường chỉ cập nhật currentReleaseId sau khi tất cả thành phần được xác nhận. Khi chạy dở, UI hiển thị bản xác nhận gần nhất kèm tiến trình, không gọi đó là bản chắc chắn đang chạy. Restart hoặc mất khóa giữa chừng đưa vào đối soát; một runner mới không tiếp tục ghi đè trạng thái bằng kết quả chưa có bằng chứng.

### C3–C4: Adapter provider

**Render:** dùng image-backed service theo digest, ánh xạ cố định API/webhooks/automation/integrations/reminders/monitor. Token chỉ ở controller. Xác minh service thuộc topology đúng môi trường, tắt auto-deploy để push không vượt qua trang Phiên bản. Poll trạng thái tới deadline; lấy current deployment từ provider, kiểm tra digest, readiness API và heartbeat mới của các queue/monitor đúng commit, tránh chấp nhận heartbeat cũ hoặc replica cũ còn sống.

**Cloudflare Pages:** dùng Direct Upload cho artifact đã kiểm tra. Dự kiến gọi Wrangler bản pin trong image controller, truyền argv cố định và credential qua env riêng; không `npx` tải binary mới hoặc nhận shell command từ request. Chạy với thư mục tạm được kiểm soát và timeout, sanitize output; lấy deployment ID qua provider và xác minh commit/`version.json` không cache.

Dùng hai Pages project độc lập cho staging và production. Trong mỗi project, publish vào nhánh production được cấu hình của chính project đó. Không dùng preview deployment làm đích rollback: Cloudflare chỉ cho rollback về production deployment phù hợp theo [tài liệu Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/). Direct Upload hỗ trợ publish thư mục build sẵn theo [hướng dẫn chính thức](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).

### C5: Thứ tự triển khai và khôi phục

Trước mỗi deployment: kiểm tra quyền/global scope ở API, schemaGeneration/capability, staging gate, artifact tồn tại và checksum đúng; kiểm tra không có deploy ngoài controller đang chạy ở các target. Chốt snapshot provider trước khi thay đổi để có cơ sở đối soát.

Với release tương thích cuốn chiếu: cập nhật API/worker theo thứ tự đã kiểm thử, xác minh backend trước, frontend cuối, rồi xác minh toàn bộ. Không khẳng định zero downtime vì các thành phần có thể tạm chạy khác phiên bản. Release không tương thích API/job payload phải dùng maintenance/quiesce và drain worker có quy trình riêng; không tự tiếp tục theo luồng rolling thông thường.

Timeout/failure một phần: giữ journal từng provider, chuyển NEEDS_REVIEW và khóa môi trường; không tự rollback một thao tác chưa rõ kết quả. Recovery dùng target/service ID đã lưu và dữ liệu provider để xác nhận chính xác trạng thái thực tế. Xử lý khi chính CRM lỗi bằng controller độc lập và credential recovery theo hợp đồng hiện có.

Rollback là một deployment có kiểm tra lại: chỉ về release từng thành công trong môi trường đích và tương thích schema/dữ liệu/job. Phối hợp rollback Render và Pages; lưu các provider ID mới hoặc đích rollback thực tế rồi verify tất cả. Giữ artifact/digest và giới hạn retention phù hợp; nếu provider đã xóa lịch sử cần tái triển khai artifact đã kiểm tra theo quy trình rõ ràng, không chọn ngẫu nhiên bản còn lại. Không restore/rollback database tự động.

Render có triển khai image theo digest; API rollback không tự tắt auto-deploy, nên phải kiểm tra chính sách đó riêng. Tham chiếu [image-backed services](https://render.com/docs/deploying-an-image) và [Render rollback](https://render.com/docs/rollbacks).

### C6–C7: CI, UI và kiểm thử

CI chỉ build/test/publish artifacts và đăng ký manifest. Token CI không được triển khai production. Trang Phiên bản giữ quyền `release.view`/`release.deploy` và scope ALL; bổ sung tiến trình từng thành phần, lý do chặn, trạng thái lỗi một phần và bước đối soát. Không đưa credentials hoặc chi tiết Docker/CLI thành dữ liệu người dùng có thể sửa.

Test bắt buộc: Compose/manifest cũ; thiếu provider credentials; auto-deploy còn bật; sai môi trường hoặc URL frontend; artifact mất/sai checksum; giải nén không an toàn; registry sai; duplicate request; hai runner; timeout/rate limit; provider nhận deploy nhưng mất phản hồi; controller chết trước/sau lưu provider ID; Render đạt nhưng Pages lỗi và ngược lại; heartbeat stale/sai commit; deploy ngoài controller; staging gate; rollback dữ liệu không tương thích; secrets không xuất hiện trong API/log.

Local dùng fake Render/Cloudflare HTTP APIs, PostgreSQL tạm và publisher giả. Compose tiếp tục có test riêng; không cần provider token thật trong unit/integration. Sau khi local đạt mới kiểm thử với hai môi trường staging/production tách biệt đã được chuẩn bị; production chỉ bật sau diễn tập rollback/recovery và backup/restore database trên staging.

## Thứ tự thực hiện và cổng nghiệm thu

| Đợt | Nội dung | Điều kiện chuyển tiếp |
| --- | --- | --- |
| 1 | F1–F3: dữ liệu và API file | Đọc được file cũ; chặn truy cập chéo scope; upload/retry/download local đạt |
| 2 | F4–F6: UI, cleanup, nghiệm thu R2 staging | File private, lỗi/crash được phục hồi, không có orphan cleanup sai |
| 3 | C1–C2: manifest và journal cloud | Tương thích Compose, artifact hai môi trường phân biệt, migration controller kiểm thử |
| 4 | C3–C5: provider adapters và điều phối | Fake-provider test đạt cho thành công một phần, restart và rollback |
| 5 | C6–C7: CI/UI và staging thật | Chọn phiên bản, deploy, rollback và recovery được diễn tập; mới bật production |

Có thể bắt đầu C1–C2 khi hợp đồng tương thích dữ liệu của F1 đã chốt. Đây là thứ tự công việc, không tự tạo tài nguyên cloud hoặc cấp quyền deploy.

Trước khi viết API/UI tương ứng, áp dụng các skill access-control/domain-workflows; với UI dùng ui-ux-pro-max và kiểm tra react-doctor theo quy tắc repository. Sau mỗi đợt chạy typecheck, test tập trung, integration cần thiết; không chỉ đợi đến cuối mới kiểm tra local.

## Hoàn thành khi nào

- Người dùng có quyền upload/download file thật trên staging, URL cũ vẫn hoạt động, các test scope và cleanup đạt.
- Người vận hành chọn một release cloud và xác nhận đúng phiên bản trên cả API, năm tiến trình nền và Pages; thất bại một phần không bị báo thành công.
- Controller có thể đối soát/rollback khi CRM lỗi; không tự thay đổi schema hoặc dữ liệu thật.
- Local chạy/test được khi không có credentials cloud; mặc định Compose và external attachments được giữ.
- Tài liệu, biến môi trường, migration, runbook sự cố và chính sách giữ artifact/file được cập nhật theo bản đã nghiệm thu.
