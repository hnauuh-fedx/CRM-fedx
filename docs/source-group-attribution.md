# Nhóm nguồn khách hàng

Áp dụng cho các lần nhận dữ liệu mới từ webhook và form nội bộ.

## Quy tắc

1. Nhóm cố định trong cấu hình webhook/form, nếu được chọn.
2. `utm_source` trực tiếp hoặc `utm_source` trong URL tracking.
3. Tên miền trang giới thiệu (`source_referrer` / `referrer`).
4. Không nhận diện được: **Khác**.

Danh mục: Facebook, Google, TikTok, Zalo, Instagram, YouTube, Website, Khác.
Các biến thể như `fb`, `facebook_ads`, `Meta Ads` được chuẩn hóa về Facebook.
Không suy đoán nhóm từ tên form/webhook, nhãn Nguồn, nền tảng (`platform`) hoặc hostname của landing page.
Không tự tạo nhóm từ giá trị UTM lạ. Nhận diện referrer kiểm tra ranh giới domain để không nhận nhầm `facebook.com.evil.test`.

## Cấu hình

- Webhook: chọn **Nhóm nguồn khách hàng** trong form tạo/chỉnh sửa; API dùng `sourceGroup` (mã chữ thường), `auto`/`null` để tự động.
- Form: tab **Dữ liệu CRM** trong builder hoặc cài đặt nâng cao của hộp tạo/chỉnh sửa; lưu tại `advancedSettings.sourceGroup`.
- Form dùng chung nhiều kênh nên để **Tự động theo UTM / trang giới thiệu**.
- Webhook nhận `utm_source`, `source_url`/`utm_url`, `source_referrer`/`referrer` trực tiếp từ payload. URL đã mapping vào `sourceGroupUrl` cũng được đọc UTM.
- Request vào hàng đợi giữ nhóm cấu hình tại thời điểm nhận. Sửa cấu hình sau đó không thay đổi request đã nhận.

Nguồn khách hàng vẫn giữ tên nguồn cụ thể theo luồng fallback hiện có. Nguồn học viên là dữ liệu riêng.
Tracking được giữ trong payload request/submission; lịch sử form còn lưu tracking và kết quả phân loại trong details. Các bộ lọc dữ liệu nhạy cảm/URL hiện có tiếp tục được áp dụng.
Không phân loại lại lịch sử cũ.

## Database

Migration: `apps/api/prisma/migrations/20261026100000_webhook_source_group/migration.sql`.
Thêm `webhooks.source_group VARCHAR(32) NULL`; NULL nghĩa là tự động.
Migration đã được kiểm thử trong database tạm và áp dụng riêng cho PostgreSQL local; không chạy các migration khác.

## Kiểm chứng

- 31 unit test cấu hình form và resolver nhóm nguồn đạt.
- 7 bộ tích hợp webhook/form đạt trên database local tạm.
- Kiểm thử API lưu nhóm cố định, chuyển lại tự động, từ chối nhóm lạ và sao chép cấu hình form đạt.
- Browser smoke test: chọn bằng bàn phím, lưu/tải lại và chuyển về tự động ở 375/768/1440px đạt.
- Typecheck frontend/backend, build web đạt; React Doctor giữ 100/100.

Log tích hợp: `artifacts/source-group-flow/` (kết quả API cấu hình cuối ở `configuration-final/inbound-webhooks.log` và `configuration/marketing-form-program-scope.log`).
Lệnh UI: `node tests/marketing-form-g4.browser-smoke.mjs --source-group-only` trong `apps/web`.
