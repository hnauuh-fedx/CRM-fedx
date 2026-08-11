# Phac thao chuc nang Admission CRM Web

Ngay cap nhat: 2026-06-01

Tai lieu nay tong hop cac chuc nang dang co trong repository Admission CRM va dinh huong phat trien tiep theo. Can cu chinh: route frontend trong `apps/web`, API router trong `apps/api`, schema Prisma/PostgreSQL va checklist chuc nang hien co.

## 1. Tong quan san pham

Admission CRM la he thong quan ly tuyen sinh theo chuoi nghiep vu:

1. Marketing tao chien dich, nguon lead, UTM va bieu mau thu lead.
2. Sale/Telesale tiep nhan lead, phan cong, cham soc, ghi chu, nhac viec va chuyen giai doan pipeline.
3. Admission tao va xu ly ho so tuyen sinh, tai lieu, trang thai, phi va hoc phi.
4. Student Service quan ly sinh vien sau khi nhap hoc va cac yeu cau ho tro.
5. Management/Admin quan ly nguoi dung, vai tro, scope, quyen va nhat ky he thong.
6. Reporting/Dashboard tong hop so lieu cho dieu hanh va cac bo phan.

He thong hien thiet ke theo huong phan quyen va pham vi du lieu: moi chuc nang bao ve bang dang nhap, permission va scope. Cac danh sach nghiep vu dung phan trang, loc, tim kiem va sap xep o phia server de phu hop voi tap du lieu lon.

## 2. Nen tang ky thuat hien co

- Frontend: React, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, TanStack Table, React Hook Form, Zod.
- Backend: Node.js TypeScript, Express, PostgreSQL, Prisma, JWT, RBAC.
- Monorepo: `apps/web`, `apps/api`, `packages/shared`, `database`, `docs`.
- Database source of truth: `apps/api/prisma/schema.prisma` va cac migration SQL trong `database/migrations`.
- API base path: `/api`.
- Local dev:
  - Web: `http://localhost:5173`
  - API: `http://localhost:3000/api`

## 3. Phan quyen va pham vi truy cap

### 3.1 Vai tro he thong

He thong da dinh huong cac vai tro chinh:

- `DIRECTOR`: xem tong quan kinh doanh, dashboard, bao cao, audit.
- `ADMIN`: cau hinh he thong, nguoi dung, vai tro, permission, phong ban, pipeline.
- `MARKETING_MANAGER`: quan ly marketing theo phong ban.
- `MARKETING_STAFF`: quan ly chien dich, bieu mau va lead cua minh.
- `SALE_MANAGER`: quan ly lead, phan cong, KPI va pipeline theo phong ban.
- `TELESALE`: xu ly lead duoc gan, ghi chu, hoat dong, nhac viec.
- `ADMISSION_OFFICER`: xu ly ho so tuyen sinh, tai lieu, trang thai, phe duyet.
- `STUDENT_SERVICE`: quan ly sinh vien va dich vu sinh vien.
- `VIEWER`: chi doc dashboard va bao cao.

### 3.2 Scope du lieu

Scope hien duoc dung trong user/role management:

- `ALL`: xem toan he thong.
- `DEPARTMENT`: xem theo phong ban.
- `ASSIGNED_ONLY`: chi lead/cong viec duoc gan.
- `OWNED_ONLY`: chi du lieu do minh tao/phu trach.
- `READ_ONLY`: chi xem, khong thao tac ghi.

### 3.3 Chuc nang da co

- Dang nhap JWT va API `/api/auth/login`, `/api/auth/me`.
- Protected route o frontend theo permission.
- Menu hien thi theo permission.
- Quan ly nguoi dung: danh sach, loc, tao, cap nhat, gan role, phong ban va access scope.
- Quan ly vai tro: danh sach, tao, cap nhat, xoa khi chua duoc gan, gan permission va scope.
- Quan ly access scope: bat/tat va mo ta scope.
- Nhat ky audit cho cac thao tac nghiep vu quan trong.

### 3.4 Du kien phat trien

- Man hinh quan ly permission rieng, gom nhom permission theo module.
- Quan ly phong ban rieng thay vi chi dung trong form nguoi dung.
- Cau hinh menu va dashboard theo vai tro.
- Chinh sach mat khau, khoa tai khoan, reset mat khau, doi mat khau lan dau.
- Session management, refresh token, dang xuat tat ca thiet bi.
- Audit export co kiem soat quyen va co gioi han du lieu.

## 4. Tong quan Workspace va Dashboard

### 4.1 Dang co

- Route `/tong-quan`.
- Neu user co `dashboard.view_all`, hien Dashboard giam doc.
- Neu khong co dashboard tong, hien workspace ca nhan voi thong tin quyen truy cap hien tai.
- Dashboard giam doc gom:
  - Tong lead.
  - Ho so tuyen sinh.
  - Sinh vien nhap hoc.
  - Ty le chuyen doi.
  - Doanh thu thang.
  - Lead theo nguon.
  - Pipeline lead.
  - Lead theo phong ban.
  - KPI nhan vien.
  - Funnel tuyen sinh.

API lien quan:

- `GET /api/dashboard/director`

### 4.2 Du kien phat trien

- Dashboard rieng cho Marketing, Sale, Admission, Student Service va Admin.
- Bo loc dashboard theo thoi gian, chuong trinh, co so, phong ban.
- Bieu do xu huong theo ngay/tuan/thang.
- Canh bao SLA, lead tre han, ho so thieu tai lieu, cong no qua han.
- Dashboard ca nhan cho telesale: lead can goi, nhac viec den han, pipeline cua toi.

## 5. CRM Marketing

### 5.1 Chien dich Marketing

Dang co:

- Route web: `/marketing/chien-dich`.
- API:
  - `GET /api/campaigns`
  - `GET /api/campaigns/options`
  - `POST /api/campaigns`
  - `PATCH /api/campaigns/:id`
  - `DELETE /api/campaigns/:id`
- Danh sach phan trang, tim kiem, loc trang thai, loc loai chien dich, loc chuong trinh.
- Tao, sua, xoa chien dich theo permission.
- Trang thai: planning, active, paused, completed.
- Quan ly ngay bat dau, ngay ket thuc, ngan sach, chuong trinh tuyen sinh.
- Hien chi so hieu qua: lead phat sinh, ho so, sinh vien nhap hoc, ty le vao ho so, chi phi/lead.
- Ghi audit khi tao, sua, xoa.
- Chan xoa chien dich da co UTM hoac bieu mau.
- Scope: `campaign.view_all`, `campaign.view`, `campaign.view_own`, `campaign.update_own`.

Du kien phat trien:

- Lap ke hoach ngan sach theo kenh.
- Ghi nhan chi phi thuc te theo ngay/kenh.
- Import chi phi tu Facebook Ads, Google Ads, TikTok Ads.
- Muc tieu KPI chien dich: lead, CPL, ho so, sinh vien nhap hoc.
- Phan tich ROI theo chien dich va chuong trinh.

### 5.2 Nguon lead

Dang co:

- Route web: `/marketing/nguon-lead`.
- API:
  - `GET /api/lead-sources`
  - `GET /api/lead-sources/options`
- Danh sach nguon lead co phan trang, tim kiem, loc loai nguon.
- Nguon lead duoc dung trong tao/cap nhat lead va phan tich chien dich.

Du kien phat trien:

- Tao, sua, khoa/mo khoa nguon lead tu UI.
- Gop nguon bi trung.
- Mapping nguon lead voi kenh marketing va UTM.
- Cau hinh quyen quan ly nguon theo phong ban.

### 5.3 Theo doi UTM

Dang co:

- Route web: `/marketing/utm`.
- API:
  - `GET /api/utm-trackings`
  - `GET /api/utm-trackings/options`
  - `GET /api/utm-trackings/analytics`
  - `GET /api/utm-trackings/leads`
- Danh sach UTM co loc source, medium, campaign, khoang ngay.
- Phan tich theo source, campaign hoac to hop UTM.
- Drill-down tu dong tong hop xuong danh sach lead phat sinh.
- Chi so: luot ghi nhan, lead, ho so, nhap hoc, chi phi/lead.

Du kien phat trien:

- Xuat du lieu UTM theo quyen.
- Tao link UTM tu campaign builder.
- Tu dong nhan dien va gan UTM khi lead vao tu form/API.
- Canh bao UTM khong hop le hoac thieu campaign.

### 5.4 Bieu mau Marketing

Dang co:

- Route web: `/marketing/bieu-mau`.
- API:
  - `GET /api/marketing-forms`
  - `GET /api/marketing-forms/options`
  - `POST /api/marketing-forms`
  - `PATCH /api/marketing-forms/:id`
  - `DELETE /api/marketing-forms/:id`
- Danh sach bieu mau, loc theo trang thai, platform, campaign.
- Tao, sua, xoa bieu mau theo permission/scope.
- Gan bieu mau voi chien dich.
- Mapping field bieu mau ve field lead.
- Bat buoc mapping `full_name` va `phone`.
- Kiem tra field mapping trung.

Du kien phat trien:

- Endpoint nhan lead tu bieu mau public/webhook.
- Chong trung lead theo phone/email.
- Audit va timeline khi lead duoc tao tu bieu mau.
- Cau hinh form public, landing page, ma nhung.
- Captcha, rate limit va xac thuc webhook.

## 6. CRM Sale / Telesale

### 6.1 Danh sach lead

Dang co:

- Route web: `/sale/leads`.
- Route chi tiet: `/sale/leads/:leadId`.
- API:
  - `GET /api/leads`
  - `GET /api/leads/options`
  - `GET /api/leads/action-options`
  - `GET /api/leads/:id`
  - `POST /api/leads`
  - `PATCH /api/leads/:id`
  - `DELETE /api/leads/:id`
- Phan trang, tim kiem, loc status, pipeline stage, source, chuong trinh, assignee.
- Sap xep theo ngay tao, ho ten, ma lead, trang thai.
- Tao/cap nhat lead voi thong tin:
  - Thong tin lien he: ho ten, phone, email, gioi tinh, ngay sinh, CCCD.
  - Hoc van, tot nghiep, truong THPT, dia chi.
  - Nguoi than.
  - Chuong trinh, nganh, trang thai ho so.
  - Diem xet tuyen, dot tuyen sinh, doanh thu thang.
  - UTM/GCLID, tag.
- Kiem tra trung so dien thoai.
- Detail lead gom thong tin profile, assignment, note, activity, reminder, file, admission lien quan.
- Soft-delete/xoa theo quyen `lead.delete`.

### 6.2 Pipeline va cham soc lead

Dang co:

- API:
  - `PATCH /api/leads/:id/stage`
  - `POST /api/leads/:id/notes`
  - `POST /api/leads/:id/files`
  - `POST /api/leads/:id/assign`
- Doi giai doan pipeline theo stage tu database, khong hardcode tren UI.
- Them ghi chu lead.
- Gan file vao lead bang metadata file.
- Phan cong/reassign lead cho nhan vien va phong ban.
- Tao lead activity, status history, audit va notification theo luong nghiep vu.

### 6.3 Quan ly Sale tong hop

Dang co:

- Routes web:
  - `/sale/phan-cong`
  - `/sale/hoat-dong`
  - `/sale/nhac-viec`
  - `/sale/kpi`
- API:
  - `GET /api/sale/options`
  - `GET /api/sale/assignments`
  - `GET /api/sale/activities`
  - `POST /api/sale/activities`
  - `PATCH /api/sale/activities/:id`
  - `GET /api/sale/reminders`
  - `POST /api/sale/reminders`
  - `PATCH /api/sale/reminders/:id`
  - `PATCH /api/sale/reminders/:id/complete`
  - `GET /api/sale/kpi`
- Quan ly danh sach phan cong.
- Quan ly hoat dong sale.
- Quan ly nhac viec sale, hoan thanh nhac viec.
- Theo doi KPI sale.
- Notification nhac viec den han va qua han.

Du kien phat trien:

- Kanban pipeline keo-tha lead.
- Goi dien/tong dai, log cuoc goi, recording va disposition.
- Rule phan bo lead tu dong theo nguon, chuong trinh, workload.
- SLA cham soc lead va canh bao lead nguoi dung bo quen.
- KPI theo telesale: toc do xu ly, ty le lien he, ty le ho so, ty le nhap hoc.
- Import/export lead co kiem soat quyen va audit.
- Dedup va merge lead.

## 7. CRM Tuyen sinh

### 7.1 Ho so tuyen sinh

Dang co:

- Route web: `/tuyen-sinh/ho-so`.
- API:
  - `GET /api/admissions`
  - `GET /api/admissions/options`
  - `GET /api/admissions/action-options`
  - `POST /api/admissions`
  - `PUT /api/admissions/:id`
  - `POST /api/admissions/:id/approve`
  - `POST /api/admissions/:id/status`
  - `POST /api/admissions/:id/convert-to-student`
- Danh sach ho so phan trang, tim kiem, loc trang thai, chuong trinh, nganh.
- Tao ho so tu lead.
- Cap nhat ho so voi nganh, loai dao tao, lop, to hop mon, diem, dot tuyen sinh, ma dao tao, tram dang ky, so quyet dinh, ngay ky, doanh thu, trang thai phi/hoc phi.
- Duyet ho so.
- Chuyen trang thai ho so theo flow.
- Chuyen ho so thanh sinh vien khi du dieu kien.
- Kiem soat chuong trinh tuyen sinh theo scope.

### 7.2 Tai lieu ho so

Dang co:

- Route web: `/tuyen-sinh/tai-lieu-ho-so`.
- API:
  - `GET /api/admissions/documents`
  - `GET /api/admissions/documents/options`
  - `GET /api/admissions/documents/action-options`
  - `POST /api/admissions/documents`
  - `POST /api/admissions/documents/:id/status`
- Danh sach tai lieu phan trang, tim kiem, loc status va loai tai lieu.
- Upload/ghi nhan tai lieu theo lead/ho so.
- Cap nhat trang thai tai lieu: pending, approved, rejected, missing, supplement_requested.

### 7.3 Trang thai va luong xu ly ho so

Dang co:

- Route web: `/tuyen-sinh/trang-thai-ho-so`.
- API:
  - `GET /api/admissions/statuses`
  - `GET /api/admissions/statuses/flow`
  - `POST /api/admissions/statuses`
  - `PUT /api/admissions/statuses/:id`
  - `DELETE /api/admissions/statuses/:id`
  - `PUT /api/admissions/statuses/flow`
- Quan ly ten, ma, mau trang thai.
- Quan ly flow chuyen trang thai.
- Chan xoa trang thai dang duoc su dung.

### 7.4 Phi / hoc phi

Dang co:

- Route web: `/tuyen-sinh/phi-hoc-phi`.
- API:
  - `GET /api/admissions/fees`
  - `GET /api/admissions/fees/options`
  - `GET /api/admissions/fees/:id/history`
  - `POST /api/admissions/fees/:id/payment`
  - `POST /api/admissions/fees/:id/debt-confirmation`
- Danh sach phi/hoc phi phan trang, tim kiem, loc status.
- Cap nhat trang thai phi, hoc phi, doanh thu, so tien thanh toan, phuong thuc, ngay thanh toan, ghi chu.
- Xem lich su phi/hoc phi.
- Xac nhan cong no: confirmed, pending, disputed.

### 7.5 Quan ly nganh

Dang co:

- Route web: `/tuyen-sinh/nganh`.
- API:
  - `GET /api/majors`
  - `GET /api/majors/options`
  - `POST /api/majors`
  - `PATCH /api/majors/:id`
  - `DELETE /api/majors/:id`
- Quan ly ma nganh, ten nganh, khoa/faculty, chuong trinh dao tao.
- Kiem soat quyen `admission_major.manage`.

Du kien phat trien:

- Checklist ho so theo nganh/chuong trinh.
- Quy tac tu dong danh dau ho so du/Thieu tai lieu.
- Phe duyet nhieu cap.
- Email/SMS/Zalo thong bao bo sung ho so, ket qua duyet, thanh toan.
- Quan ly dot tuyen sinh va chi tieu theo nganh.
- Ket noi cong thanh toan hoc phi.
- Quan ly hoc bong, mien giam, cong no chi tiet.

## 8. CRM Sinh vien

### 8.1 Danh sach sinh vien

Dang co:

- Route web: `/sinh-vien/danh-sach`.
- API:
  - `GET /api/students`
  - `GET /api/students/options`
  - `GET /api/students/:id`
  - `PATCH /api/students/:id`
- Danh sach sinh vien phan trang, tim kiem, loc trang thai, chuong trinh, nganh, khoa, lop.
- Sap xep theo ngay nhap hoc, ma sinh vien, trang thai.
- Xem chi tiet sinh vien.
- Cap nhat thong tin hoc vu co ban: status, faculty, class.

### 8.2 Dich vu sinh vien va lich su ho tro

Dang co:

- Routes web:
  - `/sinh-vien/dich-vu`
  - `/sinh-vien/lich-su-ho-tro`
- API:
  - `GET /api/students/services`
  - `GET /api/students/services/options`
  - `POST /api/students/services`
  - `PATCH /api/students/services/:serviceId`
  - `GET /api/students/support-history`
- Tao yeu cau dich vu sinh vien.
- Cap nhat loai yeu cau, noi dung, nguoi xu ly, trang thai.
- Trang thai dich vu: open, in_progress, resolved, closed, cancelled.
- Xem lich su ho tro theo sinh vien/pham vi.

Du kien phat trien:

- Ho so sinh vien day du: dia chi, nguoi than, lich su hoc tap, lop, khoa, nganh.
- Ticket service co SLA, uu tien, file dinh kem.
- Portal sinh vien xem trang thai ho so/yeu cau.
- Lich su tuong tac sau nhap hoc.
- Bao cao retention, tinh trang hoc tap, yeu cau ho tro theo nhom.

## 9. Bao cao

### 9.1 Dang co

Routes web:

- `/bao-cao/tong-hop`
- `/bao-cao/marketing`
- `/bao-cao/sale`
- `/bao-cao/tuyen-sinh`
- `/bao-cao/sinh-vien`

API hien co:

- `GET /api/reports/overview`
- `GET /api/reports/overview/options`
- `GET /api/reports/marketing-detail`
- `GET /api/reports/sale-detail`

Bao cao tong hop gom:

- Lead, ho so, sinh vien, ty le chuyen doi.
- Breakdown theo trang thai ho so, khoa, nganh.

Bao cao Marketing gom:

- Hieu qua chien dich.
- Hieu qua nguon lead.
- Lead/ho so/sinh vien theo kenh.
- Chi phi/lead va ty le chuyen doi.

Bao cao Sale gom:

- Pipeline sale.
- Hieu qua nhan vien.
- Hoat dong, nhac viec, chuyen doi theo sale.

Frontend da co trang chi tiet Tuyen sinh va Sinh vien; backend hien moi expose overview, marketing-detail va sale-detail.

### 9.2 Du kien phat trien

- API backend rieng cho bao cao Tuyen sinh va Sinh vien.
- Bo loc ngay, chuong trinh, co so, khoa, nganh, phong ban, nhan vien.
- Export Excel/PDF theo quyen.
- Luu cau hinh bao cao ca nhan.
- Drill-down tu chi so tong ve danh sach ban ghi.
- Dashboard forecast: du bao lead, ho so, sinh vien nhap hoc.

## 10. Thong bao va nhat ky he thong

### 10.1 Thong bao ca nhan

Dang co:

- UI thong bao tren topbar.
- API:
  - `GET /api/notifications`
  - `PATCH /api/notifications/:id/read`
- Thong bao nhac viec den han va qua han.
- Huong mo rong trong code: thong bao assignment, admission approval, missing documents, student creation, SLA violation.

Du kien phat trien:

- Notification center day du: loc da doc/chua doc, loai thong bao, ngay.
- WebSocket/SSE realtime.
- Cau hinh kenh thong bao email/SMS/Zalo.
- Template thong bao theo module.

### 10.2 Audit logs

Dang co:

- Route web: `/he-thong/nhat-ky`.
- API:
  - `GET /api/audit-logs`
  - `GET /api/audit-logs/options`
  - `GET /api/audit-logs/:id`
- Danh sach audit co phan trang, tim kiem, loc.
- Xem chi tiet old_data/new_data, entity, action, user, IP, thoi gian.
- Chi user co `audit.view` moi xem duoc.

Du kien phat trien:

- Export audit co masking du lieu nhay cam.
- Canh bao hanh vi bat thuong.
- Luu tru/lifecycle audit theo chinh sach.

## 11. Quan ly chuong trinh, co so va nganh

Dang co:

- API:
  - `GET /api/institution-programs/options`
- Database da co:
  - `institutions`
  - `program_types`
  - `institution_programs`
  - `majors`
  - lien ket chuong trinh voi lead, campaign, admission, student.
- Frontend co context luu chuong trinh/co so dang chon de ap scope hien thi.

Du kien phat trien:

- UI quan ly co so/institution.
- UI quan ly loai chuong trinh/program type.
- Cau hinh chuong trinh tuyen sinh theo nam/dot.
- Gan user/department vao chuong trinh duoc phu trach.
- Bao cao da co so va da chuong trinh.

## 12. Du lieu va entity chinh

Schema hien co gom cac nhom bang:

- Access control: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `departments`, `user_departments`, `access_scopes`, `role_access_scopes`, `user_access_scopes`.
- Marketing: `campaigns`, `lead_sources`, `utm_trackings`, `marketing_forms`, `marketing_form_field_mappings`.
- Sale/Lead: `leads`, `lead_assignments`, `lead_activities`, `lead_notes`, `lead_status_histories`, `reminders`, `kpi_targets`.
- Pipeline: `pipelines`, `pipeline_stages`.
- Admission: `admission_profiles`, `admission_documents`, `admission_statuses`, `faculties`, `majors`.
- Student: `students`, `student_profiles`, `student_classes`, `student_services`.
- Profile data: `addresses`, `relatives`.
- File: `files`, `file_relations`.
- System: `notifications`, `automation_jobs`, `sla_rules`, `audit_logs`, `system_settings`, `report_configs`.
- Extensibility: `tags`, `entity_tags`, `custom_fields`, `custom_field_values`.
- Multi-program: `institutions`, `program_types`, `institution_programs`.

## 13. Yeu cau phi chuc nang can giu

- Moi protected endpoint phai co authentication, permission va scope.
- Khong tra ve password hash hoac du lieu nhay cam ngoai scope.
- Danh sach lon phai dung server-side pagination, search, filter, sorting.
- UI copy cho nguoi dung cuoi viet bang tieng Viet.
- Form nghiep vu chinh can validate bang Zod/React Hook Form.
- Audit cho thao tac tao, sua, xoa, phan cong, duyet, chuyen trang thai.
- File nen luu qua S3/Cloudinary/MinIO khi len moi truong that; local chi dung mock/dev.
- Khong hardcode pipeline stage tren frontend/backend; doc tu database.

## 14. Roadmap de xuat

### Giai doan 1: Hoan thien nen tang van hanh

- Sua encoding hien thi tieng Viet neu con bi loi trong source/output.
- Hoan thien quan ly permission, phong ban, pipeline va system settings.
- Bo sung backend cho bao cao Tuyen sinh va Sinh vien.
- Hoan thien role dashboard theo tung vai tro.
- Bo sung test integration cho user/role/admission/student services.

### Giai doan 2: Hoan thien luong Marketing -> Sale

- Public/webhook endpoint nhan lead tu marketing forms.
- Dedup lead, merge lead va audit merge.
- Rule phan bo lead tu dong.
- UTM builder va export UTM.
- Tracking chi phi ads va ROI chien dich.

### Giai doan 3: Hoan thien Admission -> Student

- Checklist tai lieu theo nganh/chuong trinh.
- Flow phe duyet nhieu cap.
- Cong thanh toan va cong no chi tiet.
- Hoan thien convert admission to student voi thong tin lop/nganh/khoa day du.
- Portal theo doi ho so cho thi sinh/sinh vien.

### Giai doan 4: Tu dong hoa va phan tich nang cao

- SLA engine va automation jobs.
- Notification realtime.
- Bao cao forecast va drill-down.
- Export co masking va permission.
- Dong bo tong dai, email, SMS/Zalo.
- Data warehouse/reporting cache neu du lieu vuot quy mo van hanh truc tiep.

## 15. Khoang trong can xac nhan voi product owner

- Dinh nghia chinh xac cac trang thai lead, pipeline va admission status mac dinh.
- Quy trinh phan cong lead: thu cong, tu dong hay ket hop.
- Chinh sach trung lead: trung phone, email, CCCD hay theo nhieu truong.
- Quy trinh phi/hoc phi va tich hop thanh toan.
- Danh sach bao cao bat buoc cho tung vai tro.
- Chinh sach bao mat du lieu nhay cam: phone, email, CCCD, audit.
- Pham vi multi-institution: moi user chon mot chuong trinh hay duoc gan nhieu chuong trinh.
