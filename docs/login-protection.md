# Bảo vệ đăng nhập

## Phạm vi đã triển khai

`POST /api/auth/login` có bộ đếm PostgreSQL dùng chung giữa các API. Kiểm tra trước truy vấn tài khoản/bcrypt và trước khi tạo session. Không cần Redis hoặc dịch vụ mới. Áp dụng cho cả đăng nhập ban đầu và đăng nhập lại qua cùng endpoint.

Mặc định cho phép 100 lần/IP trong 300 giây và 10 lần/email trong 900 giây. Tất cả lượt đăng nhập đều tính, gồm đúng mật khẩu, sai mật khẩu và tài khoản không tồn tại; body không hợp lệ vẫn tính vào IP. Ngân sách IP được kiểm tra trước để nguồn đã bị chặn không tạo thêm khóa email. Không reset bộ đếm khi đăng nhập thành công, tránh race khi có nhiều yêu cầu đồng thời.

Vượt ngưỡng trả `429`, thông báo tiếng Việt và `Retry-After` theo thời gian còn lại. Thời gian chờ không bị kéo dài bởi các lần thử bị chặn. Hết cửa sổ thì được thử lại. Không đổi trạng thái user hoặc thu hồi các session đang hoạt động. Không truy cập được bảng bộ đếm trả `503`, không bỏ qua bảo vệ.

Email chuẩn hóa trim/lowercase như luồng đăng nhập. IP IPv4-mapped IPv6 được chuẩn hóa thành IPv4; địa chỉ IPv6 được nhóm theo /64. Khóa lưu HMAC, không chứa email/IP rõ; cùng JWT secret trên các replica để có cùng khóa. Không ghi password, cookie, token hoặc email/IP vào log limiter. Các sự kiện log là `auth_login_throttled` và `auth_login_limiter_unavailable`. Truy vấn dọn tối đa 100 khóa hết hạn mỗi lần thử, có index và `SKIP LOCKED`.

## Kích hoạt

1. Áp dụng migration `20261028130000_auth_login_throttling` theo quy trình migration hiện có; không dùng `db push` hoặc reset trên dữ liệu thật.
2. Cấu hình giống nhau trên mọi API trong `apps/api/.env` (local) hoặc `api.env` của môi trường triển khai:

```dotenv
AUTH_LOGIN_IP_LIMIT=100
AUTH_LOGIN_IP_WINDOW_SECONDS=300
AUTH_LOGIN_ACCOUNT_LIMIT=10
AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS=900
AUTH_TRUSTED_PROXY_CIDRS=
```

3. Restart API. Không cần worker mới. Nếu migration chưa có, đăng nhập trả 503; các phiên đang hoạt động tiếp tục theo hợp đồng session hiện có.

Không có cờ tắt limiter trong production. Có thể điều chỉnh ngưỡng theo lưu lượng/NAT thực tế. Giới hạn email toàn cục ngăn thử mật khẩu phân tán nhưng cũng cho phép người khác tiêu hao ngân sách của một email, làm người dùng phải chờ tối đa cửa sổ hiện tại. Dùng ngưỡng phù hợp; các phiên đã đăng nhập vẫn dùng được. Đây là đánh đổi của giới hạn tài khoản, không phải khóa tài khoản vĩnh viễn.

## Reverse proxy và tầng triển khai

Repo có Compose xuất API ra loopback nhưng chưa có cấu hình WAF/rate limit ở proxy. Không có quyền truy cập cấu hình server thực tế trong lần triển khai này nên chưa xác nhận được bảo vệ tại đó.

Đã thay `trust proxy = 1` bằng danh sách IP/CIDR rõ ràng. Mặc định rỗng: dùng địa chỉ socket, bỏ qua `X-Forwarded-For`. Nếu chạy sau Nginx/load balancer, đặt `AUTH_TRUSTED_PROXY_CIDRS` chỉ gồm địa chỉ thực sự của proxy khi nhìn từ API. Với Docker, địa chỉ này có thể là gateway thay vì `127.0.0.1`; phải xác minh tại môi trường. Không dùng `true`, số hop hoặc CIDR toàn mạng Internet. Nếu cấu hình thiếu, mọi người qua một proxy có thể chia sẻ ngân sách IP.

Proxy phải ghi đè header chuyển tiếp và firewall phải ngăn truy cập API qua đường không được kiểm soát. Nếu có nhiều lớp CDN/LB, xác minh chuỗi proxy và cấu hình lấy IP thật tại lớp biên; không tin header từ client chỉ vì nó có tên `X-Forwarded-For`.

Có mẫu bổ sung cho Nginx đang dùng tại [nginx-login-protection.conf.example](../deploy/nginx-login-protection.conf.example). Đây là các đoạn cho `http {}` và `server {}`, không phải file cấu hình hoàn chỉnh. Giữ TLS hiện có và chỉnh upstream theo môi trường; chạy `nginx -t` trước khi reload. Với CDN/LB phía trước Nginx, `$remote_addr` cần được xác minh/cấu hình thành IP client thật theo allowlist của lớp đó. Mẫu chưa được cài lên server.

## Kiểm thử local

```powershell
npm run test:login-protection --workspace apps/api
npm run test:integration:login-protection --workspace apps/api
```

Integration runner chỉ chấp nhận PostgreSQL local, tạo database `crm_manual_unassign_test_*` riêng và xóa sau test. Không cần Redis/Docker và không gửi tin ra ngoài. Test chạy migration thật trên database tạm, hai tiến trình API thật, kiểm tra concurrent budget, restart, email không tồn tại, expiry, chặn mật khẩu đúng khi hết ngân sách mà không tạo session, giả mạo IP, proxy tin cậy và lỗi kho bộ đếm. Sau đó chạy hồi quy session/cookie/CSRF/revocation trên cùng database tạm. CI release gọi cả hai bộ này. Log ở `artifacts/login-protection/`.

Kết quả local ngày 28/10/2026: API typecheck, 283/283 unit test, integration bảo vệ đăng nhập và integration session đều đạt. Mẫu Nginx đã được ghép vào cấu hình thử nghiệm và vượt qua `nginx -t` trong container không mở cổng. Chưa áp dụng migration hoặc cấu hình proxy lên server thực tế.

Tham chiếu thiết kế: [OWASP login throttling](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#login-throttling), [Express behind proxies](https://expressjs.com/en/guide/behind-proxies/).
