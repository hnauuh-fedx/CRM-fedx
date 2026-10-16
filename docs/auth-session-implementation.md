# Phiên đăng nhập

Ngày triển khai: 15/10/2026. Phạm vi: cơ chế phiên đăng nhập và trải nghiệm đăng nhập lại; màn hình quản lý thiết bị là đợt sau.

## Quy tắc

| Hành vi | Ghi nhớ thiết bị | Không ghi nhớ |
| --- | --- | --- |
| Thời hạn phiên server | `expires_at = null`, không giới hạn tuyệt đối, không timeout do không hoạt động | 12 giờ từ lúc đăng nhập, gia hạn không kéo dài mốc này |
| Access token | Tối đa 900 giây | Tối đa 900 giây |
| Refresh cookie | Cookie bền vững, tuổi lưu 400 ngày và được cấp lại khi gia hạn | Cookie phiên trình duyệt |
| Khôi phục sau tải lại | Gọi `/auth/refresh` | Gọi `/auth/refresh` nếu cookie còn và chưa hết 12 giờ |
| Đăng xuất | Thu hồi phiên server, xóa cookie và thông báo các tab cùng origin | Tương tự |
| Đổi/đặt lại mật khẩu qua quản lý người dùng | Thu hồi toàn bộ phiên trong cùng transaction cập nhật tài khoản | Tương tự |
| Khóa/ngừng hoạt động qua quản lý người dùng | Thu hồi toàn bộ phiên; middleware cũng đọc lại trạng thái tài khoản | Tương tự |

Phiên ghi nhớ không hết hạn ở server dù người dùng không hoạt động lâu ngày. Trình duyệt vẫn có thể giới hạn tuổi cookie, xóa dữ liệu hoặc không cho third-party cookie. Khi mất cookie, người dùng phải đăng nhập lại. Không bảo đảm cookie phiên sẽ biến mất khi đóng trình duyệt vì một số trình duyệt có khôi phục phiên; giới hạn server 12 giờ vẫn được áp dụng.

## Backend

- `auth_sessions`: chủ sở hữu, chế độ ghi nhớ, bản băm refresh token, phiên bản refresh, thời điểm tạo/sử dụng/đổi token, thời hạn và trạng thái/lý do thu hồi. Có FK tới `users`, chỉ mục theo người dùng/trạng thái thu hồi và thời hạn. Không lưu token gốc.
- Access JWT dùng HS256, có `sub`, `sid`, `type`, `iat`, `exp`. Middleware từ chối JWT cũ không có `sid`, kiểm tra phiên còn hiệu lực, tài khoản, quyền và phạm vi chương trình hiện tại.
- Refresh token dùng HMAC-SHA256 có domain separator riêng từ `JWT_SECRET`, ràng buộc ID phiên và phiên bản. Cách này cho phép trả cùng token kế tiếp cho các request đồng thời mà không lưu token có thể khôi phục trong DB. Xoay `JWT_SECRET` làm token hiện tại mất hiệu lực.
- Gia hạn khóa hàng phiên trong transaction. Các request trong cửa sổ 30 giây hội tụ về cùng thế hệ token. Token thế hệ trước chỉ hợp lệ trong cửa sổ này; tái sử dụng token đã thay thế ngoài cửa sổ sẽ thu hồi phiên và ghi audit. Token giả/malformed bị từ chối trước khi tra cứu phiên.
- Thao tác tạo phiên khóa hàng người dùng và kiểm tra lại mật khẩu/trạng thái để tránh cấp phiên từ mật khẩu vừa bị thay đổi. Thao tác thu hồi nhiều phiên khóa người dùng trước để nhất quán với cập nhật tài khoản.
- Audit: đăng nhập, thu hồi do đăng xuất/đăng xuất tất cả, đổi mật khẩu, khóa tài khoản, phát hiện tái sử dụng token. Không ghi token/cookie/mật khẩu vào log.
- Các API quản lý phiên chỉ tác động lên người dùng sở hữu cookie đã được xác thực. Không có quyền quản trị hoặc phạm vi nghiệp vụ ngầm từ tên role.

| Endpoint | Chức năng |
| --- | --- |
| `POST /api/auth/login` | Email, password, `rememberDevice` (mặc định false cho client cũ); cấp cookie và trả access token/thông tin người dùng |
| `POST /api/auth/refresh` | Kiểm tra/đổi refresh token và trả access token/thông tin người dùng theo chương trình được phép |
| `POST /api/auth/logout` | Thu hồi phiên cookie hiện tại; có thể gọi lặp lại |
| `POST /api/auth/logout-all` | Thu hồi các phiên của chủ sở hữu cookie; chưa có màn hình riêng |
| `GET /api/auth/me` | Đọc lại principal hiện tại qua middleware |

Cookie có `HttpOnly`, host-only, `Path=/api/auth`, `SameSite=lax` mặc định. Với `NODE_ENV=production` hoặc frontend HTTPS, cookie có `Secure`. Có thể cấu hình `AUTH_COOKIE_SAME_SITE=none` cho triển khai cross-site có HTTPS; trình duyệt vẫn có thể chặn cookie bên thứ ba. CORS chỉ cho `WEB_ORIGIN` và bật credentials. Frontend gửi `credentials: include`, `X-CRM-Auth: 1` cho các POST auth. Server kiểm tra Origin nếu có, yêu cầu custom header cho cookie mutations và login từ trình duyệt. Client HTTP không có Origin có thể đăng nhập như trước; refresh/logout vẫn cần custom header. Response auth có `Cache-Control: no-store`.

`JWT_EXPIRES_IN_SECONDS` mặc định 900 và bị chặn tối đa 900 ngay cả nếu `.env` cũ đang để 28800. Giữ hostname frontend/API nhất quán ở local, ví dụ cùng dùng `localhost`, để SameSite hoạt động đúng.

## Frontend và nội dung đang nhập

- Access token chỉ nằm trong bộ nhớ; không lưu credential trong localStorage/sessionStorage. Xóa hai khóa token cũ khi mở app, yêu cầu đăng nhập lại một lần sau nâng cấp.
- Khôi phục phiên từ cookie, gia hạn trước request nếu token còn dưới 30 giây. Dùng một promise trong tab và Web Locks giữa các tab khi trình duyệt hỗ trợ. Backend xử lý đồng thời khi Web Locks không có.
- Khi request trả 401, gia hạn rồi chỉ tự thử lại GET/HEAD một lần. Không tự gửi lại POST/PUT/PATCH/DELETE; hiển thị yêu cầu thực hiện lại thao tác. Request thất bại do mạng hoặc 5xx không tự đăng xuất.
- Nếu gia hạn bị 401 khi đang làm việc, giữ cây giao diện và cache trong bộ nhớ, chặn tương tác bằng hộp thoại đăng nhập lại cùng email. Đăng nhập lại đúng tài khoản cập nhật principal và tải lại dữ liệu để kiểm tra quyền. Form giữ nội dung khi còn được mount; không lưu nháp dài hạn, không giữ qua tải lại trang, đăng xuất, đổi tài khoản hoặc thay đổi quyền/phạm vi khiến trang không còn được phép hiển thị.
- Khôi phục ban đầu gặp lỗi mạng/5xx hiển thị nút thử lại, không chuyển nhầm sang đăng nhập. Trang public vẫn hoạt động độc lập.
- Login/logout gửi sự kiện storage không chứa credential. Tab khác xóa identity/cache cũ thay vì tự chuyển sang tài khoản mới. Các request đang chờ thuộc identity cũ không được áp dụng vào phiên mới.
- Đăng xuất thất bại do mạng giữ giao diện và báo thử lại; không báo thành công khi server chưa thu hồi phiên.
- Giữ cả pathname, query và hash khi quay lại trang sau đăng nhập. Hộp thoại có nhãn tiếng Việt, quản lý focus bằng Radix Dialog, hỗ trợ màn hình nhỏ và reduced motion.

## File chính

- Schema/migration: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261015100000_auth_sessions/migration.sql`.
- Backend auth: `apps/api/src/modules/auth/{auth.service,auth-session.service,auth-cookie,auth.router,auth.types,session-tokens}.ts`, middleware, cấu hình env/CORS.
- Thu hồi khi cập nhật tài khoản: `apps/api/src/modules/users/user-management.service.ts`.
- Frontend: `apps/web/src/modules/auth/{auth-context,reauth-dialog,session-restore-error}.tsx`, `session-client.ts`, `auth-storage.ts`, login page, protected route, API/auth services và kiểu AuthSession.
- Kiểm thử: `apps/api/src/modules/auth/session-tokens.test.ts`, `apps/api/src/integration/auth-session.integration.ts`, `apps/web/tests/auth-session*`. Fixture Form & Survey và transition-note đã chuyển từ token Web Storage sang mock refresh.

## Migration và bảo trì

Migration mới đã được áp dụng riêng vào PostgreSQL local `localhost:5432/crm_db` bằng `prisma db execute --file ...`, sau đó `prisma migrate resolve --applied 20261015100000_auth_sessions`. Migration Meta `20260928160000_add_meta_messenger_integration` vốn đang chờ được giữ nguyên; không chạy migrate deploy hàng loạt lên local này.

Trên môi trường khác, kiểm tra migration status, sao lưu theo quy trình triển khai và áp dụng migration trước khi chạy API mới. Không chạy `db push` hoặc reset database. Cần triển khai API/frontend cùng đợt vì JWT/storage cũ bị loại bỏ. Chưa triển khai ra dịch vụ ngoài hoặc production.

Chạy `npm run maintenance:auth-sessions --workspace apps/api` để xem số phiên đã hết hạn/thu hồi quá 30 ngày; thêm `-- --apply` để xóa tối đa 1000 bản ghi mỗi lần. Không xóa phiên ghi nhớ còn hoạt động hoặc audit logs. Script chưa được lập lịch tự động.

## Kiểm chứng

- Unit test: thời hạn ghi nhớ/12 giờ, phiên bị thu hồi, token malformed/giả, ràng buộc phiên bản.
- Integration PostgreSQL/API: cookie HttpOnly/path/persistence, TTL access, JWT cũ bị từ chối, CSRF, sáu request gia hạn đồng thời, hoạt động sau thời gian dài, phát hiện tái sử dụng, thời hạn 12 giờ, đăng xuất từng phiên/tất cả, khóa tài khoản, thu hồi khi thay mật khẩu và audit không chứa token.
- Browser: khôi phục/reload, redirect giữ query/hash, gia hạn và retry GET, không replay thao tác ghi, lỗi 5xx giữ form, sai mật khẩu khi reauth, giữ draft, đồng bộ hai tab, lỗi đăng xuất, lỗi khôi phục có retry, 375px/reduced motion/focus.
- Hồi quy builder thật: fixture Form & Survey thêm tình huống đăng nhập lại ngay khi đang chỉnh câu hỏi; kiểm tra giữ nội dung và không tự lưu.

Lệnh chạy:

```powershell
npm run test:auth --workspace apps/api
npm run test:integration:auth --workspace apps/api
npm run test:integration:access-control --workspace apps/api
npm run typecheck --workspace apps/api
npm run test:auth-browser --workspace apps/web
npm run test:auth-form-browser --workspace apps/web
npm run typecheck:auth --workspace apps/web
npm run test:marketing-form-g4-browser --workspace apps/web
npm run build --workspace apps/web
npx tsc --noEmit -p apps/web/tsconfig.json
npx react-doctor@latest --verbose --diff
```

Trong đợt triển khai auth ban đầu, typecheck toàn frontend có lỗi tại các module ngoài auth (admission, dashboard, custom fields, automation monitoring, Meta và sale). Đợt sửa riêng ngày 15/10/2026 đã xử lý 24 diagnostics; typecheck toàn frontend hiện đạt. Build Vite không thay thế kiểm tra TypeScript.

Suite G4 đầy đủ từng đi qua đăng nhập lại ở builder nhưng dừng ở public survey. Đợt sửa riêng ngày 15/10/2026 xác định callback focus tiêu đề chạy muộn giành focus từ ô trả lời và bổ sung chờ input khi quay lại chỉnh sửa. Sau sửa, G4 đầy đủ đạt ba lượt liên tiếp ở 375/768/1440px; `test:auth-form-browser` và `test:auth-browser` vẫn đạt. Chi tiết tại [báo cáo sửa lỗi](bao-cao-fix-typecheck-va-survey-g4.md).

Kết quả nghiệm thu local:

| Kiểm tra | Kết quả |
| --- | --- |
| Prisma generate/validate, migration auth riêng | Đạt |
| Unit auth, integration auth với PostgreSQL | Đạt |
| Integration user/role/scope | Các assertions báo thành công; dừng tiến trình sau đó vì kết nối worker nền của harness còn giữ process |
| Typecheck API, typecheck frontend auth | Đạt |
| Build frontend | Đạt; còn cảnh báo bundle lớn |
| Browser auth, gồm callback từ phiên đã đăng xuất bị chặn | Đạt |
| Reauth trên builder thật 375/768/1440px | Đạt, giữ câu hỏi đang sửa và không tự gửi lại thao tác lưu |
| React Doctor trực tiếp 7 file auth/API/guard được sửa | 100/100, không có finding |
| Typecheck toàn frontend | Đạt sau đợt sửa riêng ngày 15/10/2026 |
| Suite G4 đầy đủ | Đạt 3 lượt liên tiếp ở 375/768/1440px sau đợt sửa riêng ngày 15/10/2026 |
| Cleanup phiên | Đã chạy dry-run, không xóa dữ liệu |

Ảnh nghiệm thu mobile: `artifacts/auth-session/reauth-mobile.png`. Không commit hoặc triển khai production trong đợt này.
