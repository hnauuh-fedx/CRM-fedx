# Runbook dữ liệu legacy và rollout G0/G1

Ngày 15/10/2026. Quy trình này đã được lập và kiểm thử kỹ thuật cục bộ; chưa được coi là phê duyệt sửa/chặn form ở môi trường thật.

## Kiểm tra chỉ đọc

Chỉ người vận hành được cấp quyền truy cập database và được giao kiểm kê mới chạy CLI này. Đây không phải endpoint cho người dùng thường; không mở rộng quyền app/DB để chạy. Không chia sẻ credential, backup, câu trả lời hoặc output chứa metadata vận hành ra ngoài nhóm được phép.

```powershell
npm run maintenance:marketing-form-scope --workspace apps/api -- --fail-on-unresolved --limit=100
```

Đọc `DATABASE_URL` từ môi trường đang được cấu hình; phải xác nhận đúng target trước khi chạy, không đưa URL/credential vào log. CLI mở transaction `REPEATABLE READ`, đặt `READ ONLY`; không update/backfill hoặc thay status. Có thể chạy trước/sau expand migration: chương trình trực tiếp đọc bằng `to_jsonb`, không tham chiếu cột chưa có.

- `assigned`: có chương trình trực tiếp, không cần campaign.
- `missingProgram`: thiếu chương trình trực tiếp, gồm cả ứng viên backfill và trường hợp thủ công. Không được hiểu `backfillable` là đã an toàn để submit.
- `backfillable`: thiếu trực tiếp nhưng campaign có chương trình; chỉ là đề xuất, không tự thực thi.
- `unresolved`: cả form lẫn campaign không cho biết chương trình.
- `liveMissingProgram`: form active/published thiếu chương trình, có nguy cơ gián đoạn.
- `campaignMismatch`: chương trình form khác campaign; không tự chọn bên thắng hoặc chuyển lịch sử.
- `review`: tối đa 100 ID/status/campaign/program/reason, không tên khách/đáp án/public key/webhook secret. `nextCursor` và `hasMore` cho phép xem hết, không bỏ qua phần sau trang đầu. Các counts luôn là tổng, không chỉ phần sau cursor.

```powershell
npm run maintenance:marketing-form-scope --workspace apps/api -- --after=<UUID-nextCursor> --limit=100
```

Thay placeholder bằng UUID trả về, không nhập nguyên dấu `< >`. Exit 0 nếu truy vấn thành công; thêm `--fail-on-unresolved` thì exit 2 khi thiếu cột chương trình, còn `missingProgram` hoặc `campaignMismatch`; exit 1 khi lỗi kết nối/input/query. Gate này chỉ đánh giá scope, không thay kiểm tra mapping/version/quyền hay phê duyệt rollout. `legacyModes` phân biệt mode/policy version/action; đừng tự coi legacy là mode mới.

## Xử lý danh sách cần xác nhận

1. Chủ form và quản trị nghiệp vụ xác nhận từng ID thuộc chương trình nào; đối chiếu campaign, nguồn/ngành, scope người quản lý, Lead/liên kết phản hồi đã có. Không suy ra chương trình chỉ từ tài khoản đang đăng nhập hoặc điện thoại trùng.
2. Lập phiếu thay đổi gồm ID cụ thể, giá trị cũ/mới, người duyệt, thời điểm, người thực hiện, phương án backup/rollback và nơi lưu audit. Nếu không xác minh được chương trình, giữ cách ly và ghi rõ đầu mối xử lý; không gán mặc định.
3. Nếu có form active/published bị ảnh hưởng, gửi chủ form danh sách link/landing page/webhook liên quan qua kênh nội bộ có quyền, thông báo khoảng gián đoạn và hướng dẫn tiếp nhận thay thế. Không gửi PII/secret trong thông báo. Phải có phê duyệt trước khi triển khai guard vào target có các form này hoặc chủ động tạm dừng/sửa form.
4. Người vận hành được ủy quyền mới thực hiện thay đổi dữ liệu theo từng ID/transaction sau backup, kiểm tra FK/danh mục và ghi audit old/new. Repo hiện không thêm API vượt scope hoặc màn hình gán chương trình tự động. Form null không thể được chữa bằng API cập nhật thường vì API cố ý fail closed. Nếu cần UI tự phục vụ quản trị, đó là phần triển khai riêng có phân quyền/audit, không giả định đã tồn tại.
5. Giữ nguyên public key, slug, mode và đáp án/snapshot cũ. Không âm thầm chuyển phản hồi/Lead sang chương trình khác. Xung đột lịch sử phải có quyết định xử lý riêng; không mở lại form chỉ vì cột chương trình đã hết null.
6. Sau thay đổi chạy lại gate, toàn bộ trang review, kiểm thử scope/link/submit bằng fixture hoặc staging. So sánh định danh/link và số phản hồi trước/sau. Mở nhận trở lại chỉ sau xác nhận của chủ form; rollback theo danh sách ID đã duyệt, không chạy UPDATE diện rộng.

## Hành vi cách ly hiện có

Form thiếu chương trình không có public config (404); POST submit/webhook trả 403 trước lưu receipt/Lead. List/detail quản trị thông thường không hiển thị form ngoài chương trình; DBA có thể tìm trong review chỉ đọc. Không tự sửa `status` trong DB để cách ly, nên giữ được identity/lịch sử khi xử lý sau này. Không hứa đã gửi thông báo hoặc có phê duyệt chỉ vì guard kỹ thuật hoạt động.

## Điều kiện rollout và NOT NULL

- [x] Contract V1 và fixture kỹ thuật G0/G1 có trong repo, nghiệm thu cục bộ.
- [x] Database cục bộ 15/10/2026 sau cleanup: 2 form/2 assigned, 0 missing/backfillable/unresolved/liveMissing/campaignMismatch, 0 mapping mâu thuẫn; 8 option string, 2 lead_form còn mode legacy. Không có form cục bộ cần thông báo/tạm dừng, không chuyển mode hoặc sửa form thật trong phiên.
- [ ] Chạy dry-run trên đúng target triển khai, lưu báo cáo trong nơi có quyền và xác nhận compatibility với dữ liệu live/backup có khả năng phục hồi.
- [ ] Chủ hệ thống/chủ form duyệt rollout; nếu có ngoại lệ legacy, duyệt danh sách xử lý và thông báo/tạm dừng. Không dùng kết quả local để duyệt thay production.
- [ ] Thực hiện thay đổi được duyệt, chạy gate và đối chiếu sau rollout. Phiên này không triển khai ra môi trường ngoài.

`NOT NULL` không bắt buộc để kết thúc expand phase cục bộ: giữ nullable có chủ đích cho môi trường còn legacy. Chỉ lập migration contract riêng sau khi mọi form target được xác nhận, không còn ngoại lệ/mismatch, các đường tạo/import đã được kiểm tra và phương án rollback được duyệt. Phiên này không tạo/apply migration contract; không coi checklist local là giấy phép ép ràng buộc.

## Lệnh tái kiểm tra

```powershell
npm run test:integration:marketing-form-baseline --workspace apps/api
npm run test:integration:marketing-form-program-scope --workspace apps/api
npm run test:integration:marketing-forms --workspace apps/api
npm run test:integration:marketing-form-submission-policy --workspace apps/api
npm run test:marketing-form-config --workspace apps/api
npm run test:marketing-form-submission-policy --workspace apps/api
npm run typecheck --workspace apps/api
npm run test:marketing-form-scope --workspace apps/web
npm run test:marketing-form-leave --workspace apps/web
```

Integration tạo fixture ID riêng và dọn dữ liệu do test tạo; cần môi trường local/staging được phép kiểm thử. Ma trận hai Sale dùng user fixture không có phiên đăng nhập/role mới; `AuthUser` truyền trực tiếp vào service. HTTP JWT thật được kiểm tra riêng ở management fixture. Không thay roles/permissions/membership người dùng thật. Không chạy integration tạo dữ liệu thử trên production để thay thế kiểm kê chỉ đọc.
