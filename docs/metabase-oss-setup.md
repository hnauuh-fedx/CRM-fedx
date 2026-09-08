# Thiết lập Metabase OSS cho Admission CRM

## Thành phần

- `metabase`: image chính thức `metabase/metabase:v0.63.2.x`, chỉ bind vào `127.0.0.1:3001` trong môi trường local.
- `metabase-postgres`: PostgreSQL metadata database riêng; không dùng chung database/schema nghiệp vụ.
- Ba view an toàn theo scope: `reporting.sale_pipeline_scope_fact`, `reporting.admission_candidate_scope_fact` và `reporting.student_scope_fact`. Các view không chứa CCCD, phone, email, tên/mã định danh cá nhân, note, file, password hoặc audit payload.
- `crm_reporting_reader`: group role chỉ có `CONNECT`, `USAGE` schema `reporting` và `SELECT` các reporting view.
- Backend CRM: dashboard allowlist, signed guest JWT TTL 5 phút và locked parameters `scope_key`, `institution_program_id`.

## Khởi tạo local

1. Sao chép `apps/metabase/.env.example` thành `apps/metabase/.env`, thay toàn bộ secret mẫu. Compose tự ánh xạ metadata credential từ `POSTGRES_*` sang `MB_DB_*`, không cần khai báo lặp lại ba biến `MB_DB_DBNAME`, `MB_DB_USER`, `MB_DB_PASS`.
2. Đặt cùng giá trị embedding secret vào `METABASE_EMBEDDING_SECRET` của `apps/api/.env` và `MB_EMBEDDING_SECRET_KEY` của `apps/metabase/.env`.
3. Chạy Prisma migration, sau đó chạy `database/metabase/create-readonly-role.sql` bằng tài khoản quản trị PostgreSQL.
4. Tạo login riêng và gán group role, không ghi credential vào Git:

   ```sql
   CREATE ROLE crm_reporting_metabase LOGIN PASSWORD '<random-secret>';
   GRANT crm_reporting_reader TO crm_reporting_metabase;
   ```

5. Chạy `docker compose up -d metabase-postgres metabase`.
6. Trong Metabase Admin, thêm database Admission CRM bằng login `crm_reporting_metabase`; chỉ đồng bộ schema `reporting`. Sau migration mở Admin > Databases > Sync database schema now để Metabase nhận hai view mới.
7. Tạo dashboard từ `reporting.sale_pipeline_scope_fact`. Mọi card phải nối hai dashboard filter bắt buộc:
   - `scope_key` -> cột `scope_key`;
   - `institution_program_id` -> cột `institution_program_id`.
8. Bật signed embedding cho dashboard, khóa cả hai parameter, tắt public link, rồi đặt dashboard ID vào `METABASE_DASHBOARD_SALE_PIPELINE_ID` của API.
9. Khởi động lại API và mở `/bao-cao/dashboard` bằng tài khoản có quyền báo cáo Sale.

## Tạo nội dung dashboard bằng API tạm thời

1. Trong Metabase Admin, tạo API key tạm thời thuộc nhóm `Administrators`.
2. Tạo `apps/metabase/.automation.env` từ `.automation.env.example`; file thật đã được Git bỏ qua.
3. Chạy `node apps/metabase/scripts/setup-reporting-content.mjs` từ repository root.
4. Script tạo hoặc cập nhật collection, 7 KPI cards, dashboard Sale/Pipeline, layout và hai locked parameters.
5. Đặt dashboard ID do script trả về vào `METABASE_DASHBOARD_SALE_PIPELINE_ID` của API CRM.
6. Sau khi kiểm thử hoàn tất, thu hồi API key tạm thời trong Metabase và xóa `.automation.env` nếu không còn cần chạy automation.

API key này chỉ phục vụ khởi tạo nội dung Metabase. Không đưa key vào Compose, API CRM hoặc frontend.

## KPI PoC đề xuất

- Tổng lead trong kỳ.
- Lead đang ở tiến trình Đăng ký học (L3), được coi là đã có hồ sơ, và tỷ lệ lead -> L3.
- Sinh viên nhập học và tỷ lệ hồ sơ -> nhập học.
- Phân bổ theo giai đoạn pipeline và nguồn lead.
- Doanh thu tháng tổng hợp (không có thông tin định danh người học).

## Quy tắc vận hành

- Không cấp quyền Metabase author cho nhân viên nghiệp vụ. Nhân viên tạo KPI cá nhân trong CRM từ allowlist.
- Bộ dựng KPI CRM hiện hỗ trợ kho khách hàng tiềm năng, ứng viên/hồ sơ tuyển sinh và sinh viên. Output và bộ lọc chỉ lấy từ catalog trường an toàn; giá trị dropdown được backend truy vấn lại theo permission, program và access scope của người xem.
- Chia sẻ chỉ chia sẻ cấu hình; backend chạy lại báo cáo bằng `request.authUser` của người xem.
- Không dùng public embedding, không đưa embedding secret hoặc database credential vào Vite/frontend.
- Không thêm bảng nghiệp vụ trực tiếp vào Metabase. Mở rộng báo cáo bằng view/materialized view mới trong schema `reporting`.
- Khi dữ liệu lớn hơn 500.000 bản ghi, chuyển các phép tổng hợp nặng sang materialized view theo ngày, refresh đồng thời ngoài giờ cao điểm và giữ index theo program/date/scope.
