# Nghiệm thu cấu hình hiển thị — 16/10/2026

## Sửa dropdown phòng ban — 28/10/2026

Đã tái hiện hai lỗi bằng kiểm thử trước khi sửa: phòng ban chưa có Sale bị loại khỏi danh sách chủ sở hữu; tra cứu Sale/phòng ban và tính phạm vi ảnh hưởng còn đọc bảng gán vai trò cũ. Đã tách mục đích chọn chủ sở hữu khỏi điều kiện áp dụng mẫu và chuyển truy vấn sang `user_program_roles`.

Các file chính: `display-layout-owner-picker.tsx`, `grouped-field-picker.tsx`, `display-layout-editor.tsx`, service web và router/service API của display-layout. Thêm kiểm thử API và trình duyệt riêng cho dropdown; cập nhật fixture tích hợp theo mô hình vai trò hiện hành.

| Kiểm tra đợt sửa | Kết quả |
| --- | --- |
| `test:integration:display-layout-owner` (API) | PASS: phòng ban chưa có Sale, phạm vi, quyền, chủ sở hữu không tồn tại, giữ điều kiện áp dụng mẫu |
| `test:integration:display-layout` (API/PostgreSQL/HTTP) | PASS sau khi cập nhật fixture dùng vai trò theo chương trình |
| `test:display-layout-owner-browser` (Web) | PASS: dropdown, thử lại khi lỗi, phân trang, tìm kiếm, chọn bằng bàn phím, giữ nhãn đã chọn, không có kết quả, màn hình 390 px |
| TypeScript API và Web | PASS |
| Vite production build | PASS; log `build-owner-dropdown.log` |
| React Doctor diff | 100/100, không có chẩn đoán |
| React Doctor toàn frontend hiện tại | 82/100; 33 chẩn đoán ở các phần khác, không thuộc dropdown vừa sửa |
| Smoke test danh sách cũ `test:display-layout-browser` | Chưa đạt: fixture còn giả định offset cột thao tác 104 px (thực tế 70 px); thử kiểm tra tiếp gặp selector bộ lọc `#lead-search` không còn hiện trong fixture. Không sửa các giả định ngoài phạm vi này. |
| `git diff --check` | PASS |

Ảnh kiểm tra: [dropdown ở màn hình nhỏ](owner-dropdown-mobile.png). Các kết quả bên dưới là lịch sử nghiệm thu ngày 16/10, không thay thế kết quả hiện tại ở bảng này.

Đường dẫn: `/quan-ly/cau-hinh-hien-thi`. Phạm vi: bảng danh sách lead CRM Sale.

Đã hoàn thành phần tiếp theo: ghim cột, độ rộng và giao diện cá nhân theo chính sách của mẫu quản lý. Người quản lý bật từng thao tác trong mẫu rồi lưu/áp dụng; Sale dùng nút **Giao diện cá nhân** trong danh sách lead.

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript API | PASS |
| TypeScript Web | PASS |
| Vite production build | PASS; còn cảnh báo chunk chung lớn hơn 500 kB |
| Unit test quy tắc | 7/7 PASS: gồm giới hạn ghim/độ rộng và từng quyền tùy chỉnh cá nhân |
| PostgreSQL integration | PASS: nháp, ưu tiên mẫu, phạm vi, chương trình, ảnh hưởng, gán thay thế, xung đột đồng thời, khôi phục, audit, thay đổi phòng ban |
| Tùy chỉnh cá nhân PostgreSQL | PASS: chỉ tài khoản hiện tại, cột nằm trong mẫu được giao, từng thao tác theo chính sách, READ_ONLY bị chặn, reset, hết hiệu lực khi đổi phiên bản, khôi phục không làm sống lại cấu hình cũ, hai yêu cầu ghi cùng revision chỉ một thành công |
| HTTP với phiên đăng nhập thật | PASS: 401 chưa đăng nhập, 403 thiếu quyền, 403 chương trình khác, 200 cấu hình hiệu lực, 400 khi cố gửi userId của người khác, lưu/reset cá nhân bằng phiên Sale thành công |
| Chrome headless | PASS: kéo thả native, Lên/Xuống, tìm kiếm, bảo vệ chưa lưu, lưu nháp, xem trước/áp dụng, thứ tự cột, độ rộng đúng px, ghim đứng yên khi cuộn ngang, lưu/reset/bỏ thay đổi cá nhân, mở lại mẫu, điện thoại 390 px, bàn phím |
| React Doctor diff | 100/100, không có chẩn đoán |
| React Doctor toàn frontend | 100/100, 290 file, không có chẩn đoán |
| git diff --check | PASS |

## Dùng chung cho danh sách khách hàng và lead

Mẫu danh sách `LEAD_LIST` hiện áp dụng cho bảng khách hàng Marketing, khách hàng trong từng danh sách đã tạo và bảng lead Sale. Mục chọn màn hình đổi thành **Danh sách khách hàng và lead**. Không cần migration hay thay quyền/API dữ liệu.

- `apps/web/src/modules/leads/pages/leads-list-page.tsx`: bật tải và render cấu hình trên cả Marketing và Sale, gồm ghim, độ rộng, trạng thái mẫu và giao diện cá nhân.
- `packages/shared/src/display-layout.ts`: nhãn màn hình dùng chung.
- `apps/web/tests/display-layout-smoke.tsx`, `display-layout.browser-smoke.mjs`: kiểm tra chuyển giữa ba bảng, cột ẩn/thứ tự, giá trị dữ liệu, ghim, độ rộng 180 px, dùng lại mẫu quản lý và endpoint phân trang thành viên danh sách.
- TypeScript Web, Vite build và Chrome smoke: PASS. React Doctor diff: 100/100. Build còn cảnh báo chunk >500 kB như trước; log `build-shared-lists.log`.

Ảnh: [mẫu cá nhân trên danh sách khách hàng](customers-shared-layout.png). Bảng quản lý tên danh sách/bộ lọc giữ cấu trúc riêng; cấu hình này áp dụng cho các hàng dữ liệu khách hàng.

## Cải tiến giao diện theo ảnh tham chiếu

Editor chuyển sang kho trường bên trái, bố cục đang hiển thị bên phải; tìm kiếm không dấu, lọc nhóm, chọn nhiều, đánh số thứ tự, khóa trường bắt buộc và tô vùng thả. Có xem thử trực tiếp, thanh lưu bám cuối viewport desktop và thu gọn phần chọn mẫu khi đang chỉnh. Mobile dùng hai tab, mở trường đang hiển thị trước. Giao diện cá nhân dùng chung editor mới, giữ chính sách thao tác đã được cấp.

Các file cập nhật: `display-field-editor.tsx`, `display-layout-editor.tsx`, `pages/display-layouts-page.tsx`; bổ sung `display-field-model.ts`, `display-field-row.tsx` trong `apps/web/src/modules/management/display-layout/`. Kiểm thử bổ sung trong `apps/web/tests/display-layout.browser-smoke.mjs`.

| Kiểm tra giao diện | Kết quả |
| --- | --- |
| TypeScript Web | PASS |
| Vite build | PASS; cảnh báo chunk chung >500 kB như trước, log `build-editor-ux.log` |
| Chrome native drag / drop | PASS, thứ tự chèn đúng và không trùng trường |
| Lọc nhóm, tìm không dấu, thêm/ẩn hàng loạt | PASS |
| Preview tức thời và thanh lưu desktop | PASS |
| Lưu/áp dụng, bảo vệ chưa lưu, giao diện cá nhân, ba bảng dữ liệu | PASS |
| Hai tab mobile, bàn phím và theme | PASS, không tràn ngang ở 390 px |
| React Doctor diff và toàn frontend | 100/100, không có chẩn đoán; toàn frontend 299 file |

Đã xem ảnh [editor desktop](editor-desktop.png) và [editor mobile](editor-mobile.png). Không đổi API, schema hoặc quyền dữ liệu trong đợt cải tiến UI này.

## Nút chỉnh sửa giao diện ngay trên danh sách

- Thêm nút outline có biểu tượng **Chỉnh sửa giao diện** trong header của bảng lead Sale, khách hàng Marketing và khách hàng trong từng danh sách; độc lập với quyền tạo/import lead.
- Mở cấu hình `screen=LEAD_LIST`; phạm vi toàn bộ mở mẫu hiệu lực, quản lý phòng ban chọn mẫu thuộc phạm vi được quản lý. Chỉ hiện khi có `system.manage` cùng phạm vi ghi phù hợp; thiếu quyền hoặc `READ_ONLY` thì ẩn. Link cấu hình cũ trong dòng trạng thái được chuyển thành nút header này.
- File thay đổi: `apps/web/src/modules/leads/components/lead-display-layout-status.tsx`, `pages/leads-list-page.tsx`, smoke test và tài liệu.
- Chrome smoke PASS: nút hiện trong cả ba bảng, bấm mở đúng mẫu và ẩn với tài khoản thiếu quyền/READ_ONLY. TypeScript Web PASS; React Doctor diff và toàn frontend 100/100.

## Tách hai loại danh sách và mở popup — thay thế cơ chế dùng chung/chuyển trang ở trên

**Danh sách khách hàng** dùng `CUSTOMER_LIST`, **Danh sách lead** dùng `LEAD_LIST`. Bảng khách hàng trong từng danh sách đã tạo dùng `CUSTOMER_LIST`. Mỗi loại có mẫu, phân bổ, lịch sử và tùy chỉnh cá nhân riêng. Các mục nghiệm thu dùng chung ở trên ghi nhận giai đoạn trước.

Nút **Chỉnh sửa giao diện** mở popup tại trang hiện tại, cố định đúng loại danh sách. Popup dùng lại editor quản lý; chọn/tạo mẫu trong phạm vi, lưu nháp, xem ảnh hưởng, áp dụng và khôi phục. Đóng/Escape/bấm ngoài/đổi mẫu có xác nhận khi chưa lưu; đang lưu thì chặn đóng. Sau áp dụng, cấu hình bảng hiện tại được tải lại, tìm kiếm và trang đang xem giữ nguyên. Tiêu đề và nút đóng giữ trong viewport khi cuộn nội dung.

Migration `20261016120000_customer_list_layouts` đã áp dụng và ghi nhận riêng trên localhost. Mẫu dùng chung cũ được sao chép thành mẫu khách hàng có ID riêng; phiên bản, gán mẫu và tùy chỉnh cá nhân được sao chép/ánh xạ để bảo toàn bố cục ban đầu. Không áp dụng các migration không liên quan.

File chính:

- `packages/shared/src/display-layout.ts`: hai loại màn hình danh sách và danh mục dùng chung.
- API display-layouts: phân loại validation, hiệu lực mẫu, lưu/reset cá nhân theo màn hình.
- `apps/web/src/modules/leads/components/list-display-layout-dialog.tsx`: popup, chọn/tạo mẫu và bảo vệ đóng/đổi mẫu.
- Editor/hook quản lý: tái sử dụng nội dung editor và callback áp dụng; hook bảng, status, service và cá nhân tách cache theo màn hình.
- `customer-layout-checks.ts`, `customer-layout-migration-checks.ts`, HTTP integration và browser smoke: kiểm thử tách dữ liệu, migration và popup.

| Kiểm tra mới | Kết quả |
| --- | --- |
| TypeScript API và Web | PASS |
| Unit rules | 7/7 PASS |
| PostgreSQL tách khách hàng/lead | PASS; áp dụng, lưu/reset cá nhân một bên giữ nguyên bên kia; chặn dùng sai mẫu |
| Migration trên bảng tạm | PASS; giữ mẫu lead, sao chép mẫu khách hàng, lịch sử, gán mẫu, giá trị cá nhân và remap base ID đúng |
| HTTP có phiên thật | PASS; đọc/lưu/reset `CUSTOMER_LIST`, không thay lead; personal screen biểu mẫu bị từ chối |
| Chrome popup | PASS; đúng màn hình, không điều hướng, giữ tìm kiếm, Đóng/Escape/Ở lại/Bỏ thay đổi, lưu nháp/xem trước/áp dụng, bảng cập nhật tại chỗ |
| Chrome cá nhân và dữ liệu | PASS; tùy chỉnh khách hàng và lead độc lập; bảng khách hàng trong danh sách dùng mẫu khách hàng |
| Chrome desktop/mobile | PASS; không tràn ngang 390 px, tiêu đề/nút đóng trong viewport khi cuộn, thao tác bàn phím và quyền nút giữ đúng |
| Hồi quy chi tiết/biểu mẫu | PASS |
| React Doctor diff/toàn frontend | 100/100, không có chẩn đoán; 300 file toàn frontend |

Ảnh đã kiểm tra: [popup desktop](customer-popup-desktop.png), [popup điện thoại](customer-popup-mobile.png). Build log: `build-independent-popups.log` (vẫn có cảnh báo chunk chung >500 kB như trước).

Migration `20261016090000_display_layouts` đã được áp dụng và ghi nhận riêng trên PostgreSQL localhost. Không áp dụng các migration đang chờ khác. Dữ liệu fixture đã được dọn sau kiểm thử.

Migration tiếp theo `20261016100000_display_layout_preferences` cũng đã được áp dụng và ghi nhận riêng trên localhost. Không thay cấu hình đang áp dụng của người dùng thật. Mẫu cũ không có chính sách cá nhân được coi là tắt cả bốn thao tác.

Ảnh đã kiểm tra trực quan: [bảng lead desktop](phase2-desktop.png), [giao diện cá nhân trên điện thoại](phase2-mobile.png). Build thành công; log ở `build-phase2.log`, còn cảnh báo chunk chung lớn hơn 500 kB như trước.

Các nhóm file chính:

- `packages/shared/src/display-layout.ts`: danh mục cột và hợp đồng cấu hình.
- `apps/api/src/modules/display-layouts/`: validation, API, nghiệp vụ, quyền và unit tests.
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261016090000_display_layouts/`: lưu trữ.
- `apps/web/src/modules/management/pages/display-layouts-page.tsx`, `apps/web/src/modules/management/display-layout/`: trình chỉnh sửa, chọn đối tượng, lịch sử và xem trước.
- `apps/web/src/modules/leads/use-lead-display-layout.ts`, `components/lead-display-layout-status.tsx`, `components/lead-list-columns.tsx`, `pages/leads-list-page.tsx`: áp dụng vào bảng Sale.
- Router, navigation, service và script test trong các package được nối vào feature mới.
- `apps/api/src/integration/display-layout.integration.ts`, `apps/web/tests/display-layout*`: kiểm thử tích hợp và trình duyệt.

File bổ sung/sửa chính trong đợt tiếp theo:

- `packages/shared/src/display-layout.ts`: hợp đồng ghim, độ rộng, chính sách, cấu hình hiệu lực và validation dùng chung.
- `apps/api/src/modules/display-layouts/personal-display-layout.service.ts`: ghi/reset cấu hình riêng, khóa cùng publication, kiểm tra chính sách và revision, audit.
- `display-layout.service.ts`, `display-layout.router.ts`, `display-layout.validation.ts`: effective layout, API cá nhân, snapshot/restore đầy đủ thuộc tính mới.
- `apps/api/prisma/schema.prisma`, migration `20261016100000_display_layout_preferences`: lưu tùy chỉnh theo chương trình và tài khoản.
- `apps/web/src/modules/management/display-layout/display-column-settings.tsx`, `display-layout-sample.tsx`: thiết lập ghim/độ rộng/chính sách và bản xem trước.
- `apps/web/src/modules/leads/components/personal-display-layout-dialog.tsx`, `lead-column-presentation.ts`: giao diện cá nhân, xác nhận bỏ thay đổi, style ghim và kích thước.
- Hook, cột và renderer bảng lead: trạng thái pin/sizing, cột thao tác cố định, chờ cấu hình trước khi render, tự bỏ ghim cột dữ liệu khi không đủ không gian.
- `apps/api/src/integration/display-layout-personal-checks.ts`, unit test và browser smoke: kiểm thử phần tiếp theo.

Hướng dẫn sử dụng, quyền và giới hạn ở `docs/display-layout-implementation.md`. Người thuộc nhiều phòng ban dùng mẫu riêng hoặc mẫu chung khi chưa có phòng ban chính.

## Mở rộng chi tiết và biểu mẫu — 16/10/2026

Đã bổ sung ba loại mẫu độc lập: danh sách, chi tiết, tạo/sửa lead. Cùng một phòng ban hoặc Sale có thể nhận mẫu khác nhau trên mỗi màn hình. Trang chi tiết và cửa sổ chi tiết Sale dùng mẫu chi tiết; các luồng tạo/sửa dùng mẫu biểu mẫu. Khi chưa áp dụng mẫu mới, giữ giao diện hiện có.

- Mẫu biểu mẫu giữ trường bắt buộc, tự bổ sung trường bắt buộc theo chương trình, hiện/focus trường ẩn có lỗi và giữ trường đang sửa để không mất focus khi lỗi vừa được sửa.
- Giá trị trường ẩn được giữ khi cập nhật; phân công vẫn theo quyền, chương trình chỉ đọc, chuyển tiến trình vẫn qua ghi chú.
- Trường động giữ nhóm, renderer, quyền và validation hiện có. Chưa hỗ trợ kéo thả trường động trong cấu hình bố cục.
- Migration `20261016110000_display_layout_screens` đã áp dụng và ghi nhận riêng trên PostgreSQL localhost; các mẫu cũ được gán `LEAD_LIST` tự động.

Các file chính bổ sung:

- `apps/api/src/integration/display-layout-screen-checks.ts`: kiểm thử tách màn hình, trường bắt buộc, khôi phục, quyền chỉ tạo.
- `apps/web/src/modules/leads/components/use-lead-surface-layout.ts`: tải mẫu theo màn hình, tài khoản và chương trình.
- `configured-lead-form-fields.tsx`, `lead-form-surface.tsx`: renderer biểu mẫu dùng RHF và validation nghiệp vụ hiện có.
- `lead-detail-layout.tsx`: renderer chi tiết và chỉnh sửa trong modal.
- `apps/web/tests/display-layout-surfaces*`: kiểm thử Chrome tạo/sửa và chi tiết.
- Shared contracts, Prisma schema/migration, API/service, trang quản lý mẫu và các điểm gọi form được cập nhật tương ứng.

Ảnh nghiệm thu: [chi tiết và biểu mẫu desktop](phase3-desktop.png), [màn hình 390 px](phase3-mobile.png).

| Kiểm tra đợt mở rộng | Kết quả |
| --- | --- |
| TypeScript API và Web | PASS |
| Unit tests bố cục | 7/7 PASS |
| PostgreSQL integration, cá nhân và tách màn hình | PASS; fixture được dọn |
| Chrome hồi quy quản lý mẫu/danh sách/cá nhân | PASS |
| Chrome chi tiết và tạo/sửa | PASS; thứ tự, giữ giá trị ẩn, trường bắt buộc, quyền phân công, hiện/focus lỗi ẩn, giữ focus khi sửa, phạm vi chương trình và responsive |
| React Doctor diff | 100/100, không có chẩn đoán |
| React Doctor toàn frontend | 100/100, 297 file, không có chẩn đoán |
| Vite production build | PASS; vẫn có cảnh báo chunk chung >500 kB, log `build-phase3.log` |
| git diff --check | PASS |
