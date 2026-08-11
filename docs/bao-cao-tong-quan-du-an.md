# Báo cáo tổng quan dự án Admission CRM

Ngày cập nhật: 07/07/2026

## 1. Tóm tắt dự án

Admission CRM là hệ thống quản lý tuyển sinh theo mô hình CRM, hỗ trợ nhà trường theo dõi toàn bộ hành trình từ lúc thí sinh để lại thông tin quan tâm cho đến khi trở thành sinh viên và tiếp tục được chăm sóc sau nhập học.

Hệ thống được chia thành các mảng nghiệp vụ chính:

- CRM Marketing: quản lý chiến dịch, nguồn lead, UTM và biểu mẫu thu thập thông tin.
- CRM Sale / Telesale: tiếp nhận lead, phân công nhân viên, chăm sóc, ghi chú, nhắc việc và chuyển giai đoạn pipeline.
- CRM Tuyển sinh: tạo hồ sơ tuyển sinh, quản lý tài liệu, trạng thái hồ sơ, phí và học phí.
- CRM Sinh viên: quản lý sinh viên đã nhập học, dịch vụ sinh viên và lịch sử hỗ trợ.
- Quản lý / Admin: quản lý người dùng, vai trò, quyền hạn, phòng ban, pipeline, cấu hình hệ thống và nhật ký.
- Báo cáo / Dashboard: tổng hợp số liệu vận hành, hiệu quả marketing, sale, tuyển sinh và sinh viên.

Mục tiêu của dự án là giúp các bộ phận phối hợp trên cùng một dữ liệu, giảm thất thoát lead, kiểm soát quyền truy cập và cung cấp báo cáo rõ ràng cho quản lý.

## 2. Đối tượng sử dụng

Hệ thống phục vụ nhiều nhóm người dùng với quyền và phạm vi dữ liệu khác nhau:

| Nhóm người dùng | Vai trò chính |
| --- | --- |
| Giám đốc / Director | Xem tổng quan kinh doanh, báo cáo, hiệu quả tuyển sinh và nhật ký hệ thống. |
| Admin | Cấu hình người dùng, vai trò, quyền, phòng ban, pipeline và hệ thống. |
| Marketing Manager / Staff | Quản lý chiến dịch, nguồn lead, biểu mẫu, UTM và hiệu quả marketing. |
| Sale Manager | Quản lý danh sách lead, phân công, pipeline, KPI và hoạt động sale. |
| Telesale | Chăm sóc lead được giao, tạo ghi chú, hoạt động, nhắc việc và cập nhật trạng thái. |
| Admission Officer | Xử lý hồ sơ tuyển sinh, tài liệu, trạng thái hồ sơ và chuyển sinh viên. |
| Student Service | Theo dõi sinh viên, dịch vụ sinh viên và lịch sử hỗ trợ. |
| Viewer | Chỉ xem dashboard và báo cáo theo quyền được cấp. |

## 3. Luồng nghiệp vụ tổng thể

Luồng xử lý chính của Admission CRM có thể hiểu như sau:

 1. Marketing tạo chiến dịch, nguồn lead, UTM hoặc biểu mẫu.
 2. Thí sinh để lại thông tin qua biểu mẫu, chiến dịch hoặc được nhập thủ công.
 3. Lead được lưu vào hệ thống và gắn với nguồn, chiến dịch, chương trình tuyển sinh nếu có.
 4. Sale Manager phân công lead cho Telesale hoặc nhân viên phụ trách.
 5. Telesale chăm sóc lead, ghi chú, tạo nhắc việc, cập nhật hoạt động và chuyển giai đoạn pipeline.
 6. Khi lead đủ điều kiện, bộ phận Tuyển sinh tạo hồ sơ tuyển sinh.
 7. Admission Officer xử lý hồ sơ, tài liệu, trạng thái xét tuyển, phí và học phí.
 8. Khi hồ sơ được duyệt và đủ điều kiện, hệ thống chuyển hồ sơ thành sinh viên.
 9. Student Service tiếp tục quản lý thông tin sinh viên và các yêu cầu hỗ trợ.
10. Dashboard và báo cáo tổng hợp dữ liệu xuyên suốt từ marketing đến sinh viên.

## 4. Các phân hệ chức năng

### 4.1 Dashboard và tổng quan

Dashboard giúp người dùng xem nhanh tình hình vận hành theo quyền của mình. Tài khoản có quyền xem toàn hệ thống có thể theo dõi các chỉ số như tổng lead, hồ sơ tuyển sinh, sinh viên nhập học, tỷ lệ chuyển đổi, doanh thu, lead theo nguồn, pipeline, KPI nhân viên và funnel tuyển sinh.

### 4.2 CRM Marketing

Phân hệ Marketing hỗ trợ:

- Quản lý chiến dịch marketing theo trạng thái, loại chiến dịch, ngân sách và chương trình tuyển sinh.
- Quản lý nguồn lead.
- Theo dõi UTM để biết lead đến từ kênh, campaign hoặc medium nào.
- Quản lý biểu mẫu marketing, mapping field biểu mẫu về dữ liệu lead.
- Xem hiệu quả theo lead, hồ sơ, sinh viên nhập học, chi phí/lead và tỷ lệ chuyển đổi.

### 4.3 CRM Sale / Telesale

Phân hệ Sale là nơi xử lý lead sau khi được tạo. Các chức năng chính gồm:

- Danh sách lead có phân trang, tìm kiếm, lọc và sắp xếp.
- Tạo, cập nhật và xem chi tiết lead.
- Phân công hoặc chuyển giao lead cho nhân viên.
- Quản lý pipeline và giai đoạn xử lý.
- Ghi chú, hoạt động, nhắc việc và file liên quan đến lead.
- Theo dõi KPI sale, hoạt động sale và nhắc việc đến hạn hoặc quá hạn.

### 4.4 CRM Tuyển sinh

Phân hệ Tuyển sinh quản lý giai đoạn sau khi lead đã đủ điều kiện lập hồ sơ. Các chức năng chính gồm:

- Tạo hồ sơ tuyển sinh từ lead.
- Cập nhật ngành, chương trình, lớp, tổ hợp môn, điểm, đợt tuyển sinh và trạng thái hồ sơ.
- Quản lý tài liệu hồ sơ theo trạng thái như chờ duyệt, đã duyệt, từ chối, thiếu hoặc yêu cầu bổ sung.
- Quản lý trạng thái và luồng xử lý hồ sơ.
- Theo dõi phí, học phí, lịch sử thanh toán và xác nhận công nợ.
- Chuyển hồ sơ đủ điều kiện thành sinh viên.

### 4.5 CRM Sinh viên

Phân hệ Sinh viên quản lý dữ liệu sau nhập học:

- Danh sách sinh viên có phân trang, tìm kiếm, lọc theo trạng thái, chương trình, ngành, khoa và lớp.
- Xem và cập nhật thông tin học vụ cơ bản.
- Tạo và xử lý yêu cầu dịch vụ sinh viên.
- Xem lịch sử hỗ trợ theo sinh viên và theo phạm vi được cấp quyền.

### 4.6 Quản lý / Admin

Phân hệ Quản lý dành cho cấu hình hệ thống và vận hành:

- Quản lý người dùng, vai trò, quyền hạn và phòng ban.
- Quản lý access scope để xác định phạm vi dữ liệu mỗi người được xem.
- Quản lý pipeline và các giai đoạn pipeline.
- Quản lý chương trình, cơ sở, ngành và cấu hình hệ thống.
- Xem nhật ký hệ thống để truy vết thao tác quan trọng.
- Quản lý automation rule cho các tác vụ tự động hóa.

### 4.7 Báo cáo

Hệ thống có các nhóm báo cáo:

- Báo cáo tổng hợp: lead, hồ sơ, sinh viên và tỷ lệ chuyển đổi.
- Báo cáo marketing: hiệu quả chiến dịch, nguồn lead, kênh, chi phí/lead và conversion.
- Báo cáo sale: pipeline, hiệu quả nhân viên, hoạt động, nhắc việc và chuyển đổi.
- Báo cáo tuyển sinh: hồ sơ, trạng thái, ngành, khoa, phí và học phí.
- Báo cáo sinh viên: số lượng sinh viên, trạng thái, lớp, khoa và dịch vụ hỗ trợ.

## 5. Kiến trúc kỹ thuật

Dự án được tổ chức theo monorepo:

| Khu vực | Mô tả |
| --- | --- |
| `apps/web` | Ứng dụng frontend dùng React, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, TanStack Table, React Hook Form và Zod. |
| `apps/api` | Backend API dùng Node.js TypeScript, Express, PostgreSQL, Prisma, JWT và RBAC. |
| `packages/shared` | Nơi đặt type, constant hoặc validator dùng chung giữa frontend và backend. |
| `database` | Migration SQL, seed hoặc tài liệu liên quan đến cơ sở dữ liệu. |
| `docs` | Tài liệu dự án. |
| `uploads` | Thư mục upload local cho môi trường phát triển. |

API chạy dưới prefix `/api`. Khi phát triển local:

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api`

## 6. Dữ liệu chính

Cơ sở dữ liệu PostgreSQL được quản lý qua Prisma. Các nhóm bảng quan trọng gồm:

| Nhóm dữ liệu | Bảng tiêu biểu |
| --- | --- |
| Phân quyền | `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `departments`, `access_scopes`. |
| Marketing | `campaigns`, `lead_sources`, `utm_trackings`, `marketing_forms`, `marketing_form_fields`, `marketing_form_submissions`. |
| Sale / Lead | `leads`, `lead_assignments`, `lead_activities`, `lead_notes`, `lead_status_histories`, `reminders`, `kpi_targets`. |
| Pipeline | `pipelines`, `pipeline_stages`. |
| Tuyển sinh | `admission_profiles`, `admission_documents`, `admission_statuses`, `faculties`, `majors`. |
| Sinh viên | `students`, `student_profiles`, `student_classes`, `student_services`. |
| File | `files`, `file_relations`. |
| Hệ thống | `notifications`, `automation_jobs`, `automation_rules`, `audit_logs`, `system_settings`, `report_configs`. |
| Mở rộng | `tags`, `entity_tags`, `custom_fields`, `custom_field_values`. |
| Đa chương trình | `institutions`, `program_types`, `institution_programs`. |

Thiết kế dữ liệu tách theo domain để tránh dồn toàn bộ thông tin vào một bảng lớn. Ví dụ, dữ liệu lead, hồ sơ tuyển sinh, sinh viên, địa chỉ, người thân, file và custom field được lưu ở các bảng riêng.

## 7. Bảo mật và phân quyền

Hệ thống định hướng bảo vệ chức năng theo ba lớp:

1. Authentication: người dùng phải đăng nhập.
2. Permission: người dùng phải có quyền phù hợp với hành động.
3. Scope: người dùng chỉ được xem hoặc thao tác trên dữ liệu thuộc phạm vi của mình.

Các scope chính:

- `ALL`: toàn hệ thống.
- `DEPARTMENT`: theo phòng ban.
- `ASSIGNED_ONLY`: chỉ dữ liệu được phân công.
- `OWNED_ONLY`: chỉ dữ liệu do mình tạo hoặc phụ trách.
- `READ_ONLY`: chỉ xem, không thao tác ghi.

Nguyên tắc quan trọng:

- Không cấp quyền chỉ dựa vào tên vai trò hardcode.
- Không trả dữ liệu nhạy cảm như password hash, CCCD, phone, email hoặc audit data ngoài phạm vi cho phép.
- Các danh sách lớn phải dùng phân trang, tìm kiếm, lọc và sắp xếp ở phía server.
- Các thao tác quan trọng như tạo, sửa, xóa, phân công, duyệt và chuyển trạng thái cần ghi audit log.

## 8. Khả năng mở rộng

Dự án được định hướng phục vụ ít nhất 50.000 sinh viên và có khả năng mở rộng lên hơn 500.000 bản ghi trong tương lai. Vì vậy, hệ thống cần duy trì các nguyên tắc:

- Không tải toàn bộ danh sách lớn lên frontend.
- API danh sách phải có pagination, filter, search và sort.
- Query phải áp dụng scope dữ liệu ngay ở backend.
- Pipeline stage phải đọc từ cơ sở dữ liệu, không hardcode.
- File production nên lưu qua S3, Cloudinary hoặc MinIO; local storage chỉ phù hợp cho phát triển.
- Báo cáo lớn có thể cần cache, job nền hoặc kho dữ liệu báo cáo khi dữ liệu tăng mạnh.

## 9. Tình trạng hiện tại

Theo cấu trúc code và tài liệu hiện có, dự án đã có nền tảng cho các nhóm chức năng chính:

- Đăng nhập JWT và lấy thông tin người dùng hiện tại.
- Protected route ở frontend theo permission.
- Quản lý người dùng, vai trò, quyền hạn, phòng ban, scope và pipeline.
- Các màn hình nghiệp vụ chính cho Marketing, Sale, Tuyển sinh, Sinh viên, Báo cáo, Audit và Notification.
- API backend theo domain cho auth, users, roles, permissions, campaigns, marketing forms, leads, admissions, students, dashboard, reports, notifications, audit logs, system và automations.
- Seed demo data và một số integration test cho lead workflow, director lead CRUD, demo data, majors, campaigns, UTM, marketing forms và access control.

Một số phần trong tài liệu cũ vẫn ở mức phác thảo hoặc cần hoàn thiện thêm, ví dụ đặc tả yêu cầu chi tiết, thiết kế API tổng hợp và thiết kế database dạng tài liệu đầy đủ.

## 10. Roadmap đề xuất

### Giai đoạn 1: Hoàn thiện nền tảng vận hành

- Hoàn thiện tài liệu yêu cầu, API và database.
- Rà soát copy tiếng Việt và lỗi encoding nếu còn trong UI hoặc tài liệu.
- Hoàn thiện dashboard riêng theo vai trò.
- Bổ sung test cho user, role, admission, student service và report.
- Chuẩn hóa audit cho toàn bộ thao tác nghiệp vụ quan trọng.

### Giai đoạn 2: Hoàn thiện Marketing đến Sale

- Hoàn thiện public form, webhook và xử lý lead từ biểu mẫu.
- Chống trùng lead theo phone, email hoặc CCCD theo chính sách sản phẩm.
- Tự động phân bổ lead theo nguồn, chương trình, phòng ban hoặc workload.
- Theo dõi chi phí quảng cáo và ROI chiến dịch.
- Bổ sung export có kiểm soát quyền và audit.

### Giai đoạn 3: Hoàn thiện Tuyển sinh đến Sinh viên

- Checklist tài liệu theo ngành và chương trình.
- Flow phê duyệt nhiều cấp.
- Quản lý công nợ, học phí và tích hợp thanh toán.
- Chuyển admission thành student với dữ liệu lớp, ngành, khoa đầy đủ.
- Portal cho thí sinh hoặc sinh viên tự theo dõi trạng thái.

### Giai đoạn 4: Tự động hóa và phân tích nâng cao

- SLA engine và automation jobs.
- Notification realtime qua WebSocket hoặc SSE.
- Báo cáo dự báo tuyển sinh và drill-down từ chỉ số về danh sách bản ghi.
- Export Excel/PDF có masking dữ liệu nhạy cảm.
- Tích hợp tổng đài, email, SMS hoặc Zalo.

## 11. Các điểm cần xác nhận thêm

Để hoàn thiện sản phẩm theo đúng nghiệp vụ thực tế, cần xác nhận thêm với product owner:

- Bộ trạng thái lead, pipeline và hồ sơ tuyển sinh mặc định.
- Quy trình phân công lead: thủ công, tự động hay kết hợp.
- Chính sách xử lý lead trùng.
- Quy trình phí, học phí, công nợ và tích hợp thanh toán.
- Danh sách báo cáo bắt buộc cho từng vai trò.
- Quy tắc che dữ liệu nhạy cảm như phone, email, CCCD và audit.
- Phạm vi multi-institution: một người dùng có thể thuộc một hay nhiều chương trình/cơ sở.

## 12. Kết luận

Admission CRM là một hệ thống CRM tuyển sinh có phạm vi khá đầy đủ, bao phủ từ marketing, sale, tuyển sinh, sinh viên đến quản trị và báo cáo. Điểm mạnh của thiết kế hiện tại là tách module theo nghiệp vụ, dùng phân quyền dựa trên permission và scope, có định hướng xử lý dữ liệu lớn và có cơ sở để mở rộng automation, notification, reporting trong tương lai.

Trong giai đoạn tiếp theo, dự án nên ưu tiên hoàn thiện tài liệu đặc tả, chuẩn hóa dữ liệu/phân quyền, tăng kiểm thử integration và làm rõ các quy trình nghiệp vụ thực tế để giảm rủi ro khi triển khai cho người dùng cuối.