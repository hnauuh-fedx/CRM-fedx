# Cấu hình hiển thị lead

## Chọn phòng ban sở hữu mẫu — 28/10/2026

Khi tạo mẫu mới, bấm **Phòng ban sở hữu mẫu** để mở dropdown, tìm theo tên và chọn phòng ban. Tìm kiếm và phân trang nằm ngay trong dropdown; có trạng thái tải, không có kết quả và nút thử lại khi lỗi. Người có phạm vi toàn bộ có thể chọn **Toàn bộ chương trình (mẫu chung)**.

Danh sách chủ sở hữu trả về phòng ban trong phạm vi quản lý, kể cả phòng ban chưa có Sale. API dùng `purpose=OWNER` riêng cho lựa chọn này; danh sách đối tượng áp dụng vẫn dùng điều kiện Sale hợp lệ trong chương trình. Tra cứu quyền theo chương trình và tính phạm vi ảnh hưởng dùng bảng `user_program_roles` hiện hành. Không thay đổi schema.

## Sử dụng

Mở **Quản trị → Cấu hình hiển thị** (`/quan-ly/cau-hinh-hien-thi`).

Có thể bấm **Chỉnh sửa giao diện** ngay ở đầu **Danh sách khách hàng**, **Danh sách lead** hoặc bảng khách hàng trong từng danh sách. Nút mở **popup ngay trên trang**, đúng loại danh sách đang xem; giữ nguyên tìm kiếm, bộ lọc và phân trang phía sau. Người có phạm vi toàn bộ được mở mẫu đang áp dụng nếu có; quản lý phòng ban chọn mẫu trong phạm vi quản lý của mình. Có thể chọn mẫu khác hoặc tạo mẫu mới ngay trong popup. Nút cần `system.manage` và phạm vi `ALL` hoặc `DEPARTMENT` có phòng ban hợp lệ; tài khoản chỉ đọc không thấy nút.

1. Ở trang cấu hình, chọn **Màn hình áp dụng**: **Danh sách khách hàng**, **Danh sách lead**, **Chi tiết lead** hoặc **Tạo và sửa lead**. Trong popup, loại màn hình đã được cố định theo trang mở popup. Tạo hoặc chọn mẫu trong chương trình đang làm việc. Mỗi loại màn hình có mẫu và phân bổ độc lập.
2. Đổi tên, kéo các cột giữa **Đang hiển thị** và **Chưa hiển thị**. Thứ tự từ trên xuống là thứ tự cột từ trái sang phải. Có tìm kiếm, chọn nhiều, nút Hiện/Ẩn và Lên/Xuống; sắp xếp tạm khóa khi tìm kiếm để tránh nhầm vị trí.
3. Chọn mẫu chung, phòng ban hoặc Sale; danh sách đối tượng tìm kiếm và phân trang tại máy chủ.
   Trong **Ghim và độ rộng cột**, mở **Điều chỉnh các cột đang hiển thị**, chọn tối đa 3 cột ghim bên trái và nhập độ rộng từ 120–600 px (mặc định 220 px). Cột chọn và xem chi tiết luôn đứng trước các cột ghim. Khi màn hình nhỏ hoặc không đủ chỗ cho phần dữ liệu còn lại, chỉ hai cột thao tác được cố định; cột dữ liệu cuộn bình thường.
   Trong **Cho phép Sale tùy chỉnh cá nhân**, bật riêng từng thao tác: ẩn/hiện, thứ tự, ghim, độ rộng. Mặc định cả bốn đều tắt.
4. **Lưu nháp**, sau đó **Xem trước và áp dụng**. Xem số nhân viên thực sự bị ảnh hưởng, số giữ mẫu riêng, tên các mẫu bị thay thế rồi bấm **Áp dụng**.
5. Sau khi áp dụng trong popup, bảng đang xem tải lại cấu hình hiệu lực ngay. Các phiên khác nhận cấu hình khi mở lại hoặc tải lại màn hình tương ứng. Cấu hình được lưu trên máy chủ, dùng chung giữa các thiết bị.

**Danh sách khách hàng** (`CUSTOMER_LIST`) áp dụng cho **CRM Marketing → Danh sách khách hàng** và bảng khách hàng bên trong từng danh sách đã tạo. **Danh sách lead** (`LEAD_LIST`) áp dụng riêng cho **CRM Sale → Danh sách lead**. Thứ tự, ẩn/hiện, ghim, độ rộng, phân bổ theo phòng ban/Sale và tùy chỉnh cá nhân độc lập giữa hai loại; đổi một bên không làm đổi bên còn lại. Dữ liệu từng bảng vẫn do API và phạm vi truy cập hiện có quyết định. Bảng quản lý tên danh sách khách hàng (tên danh sách, số lượng, bộ lọc) giữ cấu trúc riêng.

Popup chặn đóng hoặc đổi mẫu khi đang lưu; có xác nhận bỏ thay đổi nếu nhấn Đóng, Escape, bấm ngoài cửa sổ hoặc chọn mẫu khác khi chưa lưu. **Ở lại** giữ nguyên bản đang chỉnh. Lưu nháp không thay đổi bảng đang dùng; cần xem phạm vi ảnh hưởng và áp dụng. Quyền, kiểm tra revision, lịch sử, khôi phục và audit dùng cùng API với trang cấu hình.

### Trình chỉnh sửa bố cục

- Trên desktop, **Chưa hiển thị** ở bên trái, **Đang hiển thị** ở bên phải và rộng hơn. Kéo trường từ trái sang phải để thêm; thả lên một trường để chèn trước trường đó, hoặc thả vào khoảng trống để đặt cuối.
- Tìm tên trường có hoặc không dấu, ví dụ `noi cap`; lọc kho trường theo nhóm thông tin cơ bản, học vấn, địa chỉ, người thân, tuyển sinh hoặc chăm sóc. **Xóa bộ lọc trường** đưa cả hai bên về trạng thái đầy đủ. Đang lọc thì dùng nút Hiện/Ẩn; kéo thả và sắp xếp tạm khóa để tránh nhầm vị trí.
- Chọn các ô cạnh tên trường rồi dùng **Hiện/Ẩn N trường đã chọn** để thao tác nhiều trường. Số thứ tự, nhóm trường và nhãn **Bắt buộc** giúp nhận biết vị trí và trường không được ẩn.
- **Xem thử bố cục đang chỉnh** cập nhật ngay bằng dữ liệu minh họa, có thể mở trước khi lưu. **Xem trước và áp dụng** vẫn cần lưu nháp và kiểm tra phạm vi ảnh hưởng.
- Thanh **Lưu nháp / Xem trước và áp dụng** ở cuối editor giữ trong tầm nhìn khi cuộn trên desktop; hiển thị trạng thái chưa lưu, số trường và số đối tượng áp dụng. Khu chọn màn hình/mẫu được thu gọn khi đã mở mẫu để dành chỗ chỉnh bố cục.
- Trên điện thoại và màn hình nhỏ, hai cột thành hai tab, mặc định mở **Đang hiển thị**. Dùng nút Hiện/Ẩn và mũi tên để thao tác; các nút vẫn dùng được bằng bàn phím.

Ảnh giao diện: [desktop](../artifacts/display-layout/editor-desktop.png), [điện thoại](../artifacts/display-layout/editor-mobile.png).

### Chi tiết và biểu mẫu tạo/sửa

Mẫu **Chi tiết lead** áp dụng cho khối thông tin ứng viên trên trang chi tiết và cửa sổ chi tiết trong danh sách Sale. Thứ tự trường từ trên xuống trong trình chỉnh sửa trở thành thứ tự đọc từ trái sang phải, từ trên xuống trên giao diện. Các giá trị nguồn, Sale, ngành và chương trình hiển thị tên thay vì mã định danh.

Mẫu **Tạo và sửa lead** áp dụng khi thêm ứng viên, sửa tại trang chi tiết và sửa trong cửa sổ chi tiết đã áp dụng mẫu. Họ tên, số điện thoại, nguồn và chương trình luôn hiển thị. Trường được cấu hình bắt buộc trong chương trình cũng tự hiện; trường ẩn có lỗi validation được hiện lại và nhận focus khi lưu. Ẩn trường không xóa giá trị cũ. Chương trình chỉ đọc; phân công Sale vẫn cần quyền hiện có, thay đổi tiến trình vẫn qua bước ghi chú nghiệp vụ.

Khi chưa có mẫu được áp dụng hoặc tải mẫu lỗi, hệ thống dùng giao diện hiện có. Lúc tải mẫu lần đầu, biểu mẫu chờ bố cục trước khi cho lưu. Không tự tải lại mẫu khi đang nhập do chuyển tab hoặc kết nối lại. Mẫu chi tiết và biểu mẫu hỗ trợ thứ tự/ẩn-hiện; ghim, độ rộng và tùy chỉnh cá nhân dành cho danh sách.

Danh mục kéo thả hiện gồm các trường hệ thống có renderer. Trường động tiếp tục hiển thị trong nhóm riêng theo quyền xem/sửa và quy tắc bắt buộc hiện có; chưa đưa trường động vào hai danh sách kéo thả. Nhật ký, tệp, chăm sóc và thao tác phân công/xóa được giữ trong các khối nghiệp vụ riêng.

Lịch sử ghi phiên bản, người áp dụng, thời điểm và bố cục. **Xem lại bản này** đưa bố cục cũ vào nháp, giữ đối tượng gán hiện tại; áp dụng nháp tạo phiên bản mới. Nháp đang chỉnh được bảo vệ khi đổi màn hình, đổi mẫu, đổi chương trình hoặc đóng trang. Khi xung đột phiên bản, dùng **Bỏ thay đổi và tải lại mẫu** để lấy bản mới nhất.

### Giao diện cá nhân của Sale

Khi mẫu được giao cho phép ít nhất một thao tác, danh sách khách hàng và danh sách lead có nút **Giao diện cá nhân**. Người dùng chỉ điều chỉnh cột nằm trong danh sách đang hiển thị của mẫu quản lý; không thêm được cột đã bị quản lý loại khỏi mẫu. Những thao tác chưa được cho phép bị khóa, cột Họ và tên luôn được giữ. Lưu hoặc dùng lại mẫu quản lý chỉ tác động loại danh sách hiện tại; tùy chỉnh khách hàng không tác động tùy chỉnh lead.

**Lưu giao diện cá nhân** áp dụng ngay cho tài khoản hiện tại trong chương trình đang chọn và lưu trên máy chủ. **Dùng lại mẫu quản lý** xóa hiệu lực tùy chỉnh cá nhân và trở về cấu hình kế thừa. Đóng cửa sổ khi chưa lưu có xác nhận bỏ thay đổi; rời trang, đổi chương trình hoặc đóng tab cũng được bảo vệ. Nếu có xung đột, dùng **Bỏ thay đổi và tải lại giao diện** để lấy cấu hình mới.

Khi quản lý áp dụng một phiên bản mới, đổi mẫu được gán hoặc người dùng chuyển phòng ban làm thay đổi mẫu hiệu lực, tùy chỉnh cũ không được tự áp dụng lên mẫu mới. Khi mở lại hoặc tải lại danh sách, hệ thống hiển thị thông báo và dùng mẫu quản lý mới nhất. Sale có thể thiết lập lại nếu chính sách mới cho phép. Khôi phục mẫu quản lý cũ cũng tạo phiên bản mới, nên không làm sống lại tùy chỉnh cá nhân từ trước đó.

## Quyền và kế thừa

- Quản lý mẫu cần `system.manage` cùng phạm vi và chương trình hợp lệ. Không cấp quyền theo tên vai trò.
- Phạm vi `ALL` được quản lý mẫu toàn chương trình, gán nhiều phòng ban/Sale và mẫu chung. Phạm vi `DEPARTMENT` chỉ tạo/quản lý mẫu của phòng ban trong phạm vi; không thay thế gán mẫu do phạm vi khác quản lý. Các phạm vi khác không được ghi cấu hình.
- Mẫu phòng ban không gán cho Sale có thành viên ngoài phòng ban đó. Khi Sale rời phòng ban, mẫu riêng do phòng ban cũ quản lý không còn có hiệu lực.
- Ưu tiên: mẫu riêng Sale → mẫu phòng ban → mẫu chung chương trình → mặc định hệ thống.
- Schema hiện chưa có phòng ban chính/đang làm việc. Người thuộc nhiều phòng ban dùng mẫu riêng hoặc mẫu chung, có thông báo rõ, không tự chọn một phòng ban tùy ý.
- Cột Họ và tên, chọn bản ghi và xem chi tiết luôn giữ để nhận diện/thao tác. Các cột khác được ẩn, kể cả trường bắt buộc nhập ở biểu mẫu.
- Cấu hình giao diện không mở rộng quyền truy cập dữ liệu. Các API lead, phân trang, lọc, sắp xếp và serializer hiện có được giữ nguyên.
- Tùy chỉnh cá nhân cần quyền xem lead trong chương trình và chính sách được bật trong mẫu quản lý; phạm vi `READ_ONLY` không được ghi. API chỉ thao tác tài khoản xác thực, không nhận `userId` từ client, không cho Sale sửa mẫu hoặc giao diện người khác.

## Lưu trữ và đồng thời

Migration `20261016090000_display_layouts` thêm bốn bảng: templates, versions, assignments và program_state; không sửa dữ liệu lead.

Migration `20261016100000_display_layout_preferences` thêm bảng `display_layout_preferences`, khóa duy nhất theo chương trình và người dùng, lưu cấu hình cá nhân, revision và mẫu/phiên bản gốc. Lưu/reset cá nhân khóa cùng dòng chương trình với thao tác áp dụng mẫu, kiểm tra lại mẫu và chính sách trong transaction, rồi ghi audit. Hai tab cùng ghi từ một revision chỉ có một yêu cầu thành công. Thay đổi cá nhân không tăng revision gán mẫu của quản lý.

Migration `20261016110000_display_layout_screens` thêm `screen` vào templates, assignments và preferences. Dữ liệu trước đó mặc định là `LEAD_LIST`, giữ nguyên hiệu lực. Gán mẫu duy nhất theo chương trình, màn hình và đối tượng; tùy chỉnh cá nhân theo chương trình, màn hình và tài khoản. API kiểm tra danh mục trường theo màn hình, loại màn hình của mẫu không thay đổi sau khi tạo. Người chỉ có quyền tạo lead được đọc mẫu `LEAD_FORM`; đọc mẫu chi tiết/danh sách vẫn cần quyền xem lead.

Migration `20261016120000_customer_list_layouts` bổ sung màn hình `CUSTOMER_LIST`. Mẫu dùng chung trước đây được sao chép một lần thành mẫu khách hàng với ID riêng, kèm lịch sử, phân bổ và tùy chỉnh cá nhân được ánh xạ sang ID mẫu mới. Mẫu lead cũ giữ nguyên. Bố cục ban đầu ở hai bên được bảo toàn, sau đó hoàn toàn độc lập. API lưu/reset cá nhân nhận `screen` chỉ trong hai loại danh sách; cache web cũng tách theo màn hình, tài khoản và chương trình.

Mỗi mẫu có `draft`, `published`, `revision` và `published_version`. Bản nháp không sửa bản đang dùng. Áp dụng cập nhật gán mẫu, phiên bản và audit trong cùng transaction. Revision của chương trình khóa tuần tự việc áp dụng và vô hiệu bản xem trước khi gán mẫu thay đổi; revision của mẫu chống ghi đè nháp.

Danh mục cột nằm trong `packages/shared/src/display-layout.ts`, được dùng chung bởi API và renderer lead. Mẫu lưu danh mục trường đã biết; trường được thêm sau này ở danh sách chưa hiển thị và có nhãn Mới đến lần lưu tiếp theo. Trường ngừng sử dụng được bỏ khỏi cấu hình hiệu lực và cần loại khỏi bản nháp trước khi lưu. Mặc định hệ thống giữ các cột hiện có.

Đã triển khai giai đoạn hai cho bảng lead Sale: ghim, độ rộng và tùy chỉnh cá nhân theo chính sách. Snapshot phiên bản lưu cả ghim, độ rộng và chính sách; khôi phục giữ đối tượng gán hiện tại. Snapshot cũ chưa có các thông tin này dùng mặc định không ghim, độ rộng 220 px, không cho tùy chỉnh cá nhân.

Đã mở rộng mẫu danh sách sang bảng khách hàng Marketing, gồm khách hàng trong từng danh sách; trang chi tiết và biểu mẫu nhập liệu của lead Sale cũng đã triển khai. Kéo thả trường động chưa thuộc phạm vi đã triển khai.

## Kiểm tra

```powershell
npm run test:display-layout --workspace apps/api
npm run test:integration:display-layout --workspace apps/api
npm run test:display-layout-browser --workspace apps/web
npm run test:display-layout-surfaces-browser --workspace apps/web
npm run typecheck --workspace apps/api
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```

Kiểm thử tích hợp tạo chương trình và người dùng fixture riêng rồi dọn dữ liệu fixture; không thay mẫu của người dùng thật. Kiểm thử trình duyệt dùng API giả lập riêng và Chrome/Edge headless: kéo thả thật, sắp xếp, tìm kiếm, bảo vệ thay đổi, lưu nháp, xem trước/áp dụng, cột ghim đứng yên khi cuộn ngang, độ rộng hiển thị đúng px, lưu/reset/bỏ thay đổi cá nhân, mở lại mẫu, màn hình nhỏ, bàn phím và theme. Ảnh nghiệm thu nằm trong `artifacts/display-layout`, gồm `phase2-desktop.png` và `phase2-mobile.png`.

Migration mới đã được áp dụng và ghi nhận riêng trên PostgreSQL localhost của workspace. Không chạy các migration đang chờ khác hoặc triển khai dịch vụ bên ngoài.

Đợt mở rộng có kiểm thử PostgreSQL về tách ba màn hình, giữ giao diện cá nhân danh sách, trường bắt buộc, mã trường sai màn hình, khôi phục và quyền chỉ tạo. Smoke test trình duyệt mới dùng `LeadForm` và renderer chi tiết thật: thứ tự, trường ẩn giữ giá trị, trường bắt buộc động, quyền phân công, hiện/focus lỗi ẩn, tạo/sửa và màn hình 390 px. Ảnh: `artifacts/display-layout/phase3-desktop.png`, `phase3-mobile.png`.
