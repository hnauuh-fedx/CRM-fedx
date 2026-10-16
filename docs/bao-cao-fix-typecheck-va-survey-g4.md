# Kết quả sửa TypeScript và survey G4

Ngày thực hiện: 15/10/2026. Theo kế hoạch `ke-hoach-fix-typecheck-va-survey-g4.md`.

## TypeScript

Đã xử lý 24 diagnostics tại 12 file. Typecheck toàn frontend và API đều chạy thành công; không hạ strictness, không thêm `any`, `@ts-ignore` hoặc bỏ file khỏi kiểm tra.

| Nhóm/file | Thay đổi |
| --- | --- |
| `src/modules/leads/lead-custom-field.helpers.ts` | Guard file kiểm tra đầy đủ metadata; phân biệt mảng mã lựa chọn và mảng file trước format. Không đưa object file vào lookup chuỗi. |
| `src/modules/leads/components/dynamic-field-renderer.tsx` | Dùng chung guard file và guard mảng chuỗi; validation multi-select chỉ nhận mảng chuỗi và vẫn kiểm tra mã hợp lệ/trùng lặp. |
| `src/lib/vietnam-provinces.ts` | Map được khai báo key/value là chuỗi để lookup mã từ dữ liệu; mã không biết vẫn giữ fallback hiện có. |
| `src/components/shared/business-records-page.tsx` | Kiểm tra lại sort key trong callback trước dispatch; không gửi undefined. |
| `src/modules/sale/pages/lead-assignments-page.tsx` | Chụp đối tượng lead đã kiểm tra null để callback dùng đúng lead của hàng hiện tại. |
| `src/modules/admissions/pages/admission-documents-page.tsx` | Điều kiện render lỗi là boolean, nội dung qua helper thông báo có sẵn. |
| `src/modules/admissions/pages/admission-fees-page.tsx` | Điều kiện lỗi boolean; nút tải lại lịch sử thu phí gọi đúng `historyQuery.refetch`. |
| `src/modules/admissions/pages/admission-statuses-page.tsx` | Điều kiện lỗi boolean, giữ thông báo và validation hiện tại. |
| `src/modules/admissions/pages/admissions-list-page.tsx` | Điều kiện lỗi boolean tại các dialog/form. |
| `src/modules/automations/pages/automation-monitoring-page.tsx` | Thu hẹp tường minh nhánh rollback trước đọc rule/version. |
| `src/modules/leads/pages/leads-list-page.tsx` | Chỉ đọc preset trong nhánh RELATIVE; nhánh CUSTOM tiếp tục dùng khoảng ngày. |
| `src/modules/marketing/pages/meta-connection-page.tsx` | Mutation async trả Promise chứa union kết quả; giữ nguyên payload test connection/disconnect và thông tin `ok`. Không gọi Meta thật để kiểm tra. |
| `src/modules/dashboard/pages/director-dashboard-page.tsx` | Bỏ import không sử dụng. |

Các đường dẫn `src/...` ở bảng thuộc `apps/web`. Phần lớn thay đổi giữ nguyên hành vi, sửa cách thu hẹp kiểu. Guard file/selection có ba unit tests cho metadata, dữ liệu không hợp lệ và mã tỉnh/thành cũ. Không thêm test chỉ để kiểm tra import hoặc lặp lại biểu thức JSX.

## Nguyên nhân survey và bản sửa

Baseline G4 đầy đủ tái hiện timeout chờ lựa chọn “Khác” khi giao diện vẫn ở trang đầu có lỗi bắt buộc nhập chi tiết. Sau đó tái hiện lỗi bàn phím: đã chọn sao 5 nhưng ArrowLeft không chọn lại sao 4. Hai tình huống survey rút gọn ban đầu đều qua; do đó không kết luận visibility tự xóa dữ liệu chỉ từ lỗi thiếu input.

Đã thu được trace thực trong luồng G4 thất bại:

1. Focus vào radio rating 4.
2. ArrowRight chuyển focus và giá trị tới rating 5.
3. Focus chuyển sang tiêu đề trang (`data-page-heading`).
4. ArrowLeft chạy trên tiêu đề, không còn chạy trên radio.

Nguyên nhân được chứng minh là `requestAnimationFrame` focus tiêu đề sau chuyển trang chạy muộn và vô điều kiện. Nó giành focus từ ô người dùng vừa chọn. Điều này ảnh hưởng bàn phím và có thể làm thao tác nhập nhanh không đến đúng input, sau đó validation chặn chuyển trang.

Regression test điều khiển animation frame trên renderer thật: giữ callback chuyển trang, chọn radio hoặc ô văn bản, rồi chạy callback muộn. Bản trước sửa thất bại tại assertion giữ focus; bản sau sửa qua ở 375/768/1440px.

Sửa tại `apps/web/src/modules/marketing/marketing-form-fill.tsx`:

- Mỗi yêu cầu focus có số thứ tự; callback cũ không chạy sau yêu cầu mới.
- Mỗi lần cập nhật câu trả lời vô hiệu hóa yêu cầu focus đang chờ.
- Trước khi focus, kiểm tra người dùng có chuyển focus sang phần tử khác hay chưa; không ngắt câu trả lời mới.
- Dùng cùng cơ chế cho focus lỗi validation, chuyển trang và quay lại chỉnh sửa từ xác nhận.

Ở harness, bước quay lại chỉnh sửa chờ input xuất hiện rồi mới kiểm tra giá trị. Đây là chờ trạng thái DOM cụ thể sau cập nhật React, không thêm sleep hoặc tăng timeout để che lỗi. Không thay contract visibility, quy tắc xóa câu trả lời ẩn, nội dung “Khác”, validation bắt buộc hoặc payload gửi API.

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run typecheck --workspace apps/web` | Đạt, 0 lỗi |
| `npm run typecheck --workspace apps/api` | Đạt |
| `npm run typecheck:auth --workspace apps/web` | Đạt |
| `npm run build --workspace apps/web` | Đạt; còn cảnh báo chunk >500KB vốn có |
| `test:lead-custom-field-values` | 3/3 |
| `test:marketing-form-values` | 19/19 |
| `test:marketing-form-leave` | 4/4 |
| `test:survey-focus-browser` | Đạt ở 375/768/1440px, radio + ô văn bản, callback bị cố ý trì hoãn |
| `test:survey-visibility-browser` | Đạt ở 375/768/1440px |
| `test:survey-confirmation-browser` | Đạt ở 375/768/1440px |
| Unit auth và integration auth với PostgreSQL | Đạt |
| `test:auth-browser`, `test:auth-form-browser` | Đạt; giữ nội dung builder, không replay thao tác ghi |
| React Doctor cùng 13 file trước/sau | Giữ 85/100, cùng 21 warnings, không có finding mới |
| React Doctor `--diff` | Đã chạy; phạm vi diff toàn workspace là 32 file, 80/100, hai warning ở toggle/toggle-group. Không so score này với baseline 13 file vì khác phạm vi. |
| `git diff --check` | Đạt; chỉ có cảnh báo LF/CRLF của Windows |

G4 đầy đủ đã đạt **3 lượt liên tiếp**, mỗi lượt đủ **375/768/1440px**, sau khi gỡ instrumentation. Mỗi lượt bao gồm builder save/reload, guard, reauth giữ nội dung, drag/keyboard, preview/public visibility/Khác/rating, xác nhận và retry. Không bỏ assertion hoặc tăng timeout.

Lệnh regression quyết định và tín hiệu trước/sau:

```text
node tests/marketing-form-g4.browser-smoke.mjs --focus-only
Trước sửa: AssertionError: A delayed page-heading focus must not steal focus from an answer the user has selected
Sau sửa: PASS minimal survey late-focus 375px / 768px / 1440px
```

Các script regression mới nằm trong `apps/web/package.json`; kịch bản browser nằm tại `apps/web/tests/marketing-form-g4.browser-smoke.mjs`. Unit tests guard/formatter nằm tại `apps/web/tests/lead-custom-field-values.test.ts`. Trace chẩn đoán tạm đã được gỡ; cơ chế điều khiển frame chỉ tồn tại trong regression test, không có trong sản phẩm.

Không đổi API nghiệp vụ, schema, migration, scope hoặc permission; không deploy, commit hoặc gọi dịch vụ ngoài. Các thay đổi Form & Survey và auth có sẵn trong workspace được giữ nguyên. Các warnings React Doctor vốn có ngoài bản sửa không được suppress hoặc sửa lan trong đợt này.
