# Kế hoạch sửa TypeScript và public survey G4

Ngày lập: 15/10/2026.

**Trạng thái: hoàn thành sửa và nghiệm thu local ngày 15/10/2026.** Typecheck frontend/API đạt; G4 đầy đủ qua 3 lượt liên tiếp ở 375/768/1440px; auth regression đạt. Nguyên nhân focus chạy muộn, danh sách thay đổi và bằng chứng trước/sau nằm tại [báo cáo kết quả](bao-cao-fix-typecheck-va-survey-g4.md). Nội dung kế hoạch/baseline bên dưới được giữ để đối chiếu.

## Mục tiêu và phạm vi

- Đưa typecheck toàn frontend về 0 lỗi, xử lý 24 diagnostics hiện tại tại 12 file.
- Xác định và sửa nguyên nhân khiến public survey thất bại trong suite G4 đầy đủ.
- Giữ nguyên kết quả của cơ chế phiên đăng nhập, giữ nội dung builder và quy tắc dữ liệu survey.
- Không đổi framework, không thêm infrastructure hoặc migration cho việc sửa các lỗi frontend này.

Các lỗi TypeScript được xác nhận bằng `npx tsc --noEmit -p apps/web/tsconfig.json`. Hai lần chạy G4 trước thất bại tại các bước khác nhau trong `fillSurvey()`: không tìm thấy input ghi chú cuối sau quay lại chỉnh sửa; hoặc timeout chờ lựa chọn “Khác” khi giao diện vẫn ở trang đầu với lỗi bắt buộc nhập chi tiết. Chưa xác định lỗi nằm ở sản phẩm, driver kiểm thử hay sự kết hợp của cả hai. Không khẳng định các lỗi đã tồn tại trước thay đổi auth khi chưa có baseline đối chứng.

## Nguyên tắc thực hiện

- Ghi nhận `git status` và diff trước khi sửa; giữ toàn bộ thay đổi Form & Survey đang có trong workspace.
- Đọc code qua CodeGraph trước, sau đó đọc chính xác phần chưa được công cụ trả về. Kiểm tra contract API/types hiện tại trước khi đổi kiểu dữ liệu.
- Giải quyết nguyên nhân theo nhóm, không sửa từng diagnostic bằng ép kiểu. Không thêm `any`, `@ts-ignore`, non-null assertion thiếu chứng cứ hoặc giảm cấu hình TypeScript để vượt kiểm tra.
- Giữ copy tiếng Việt, keyboard/focus và responsive. Không nới validation hoặc bỏ câu trả lời ẩn khỏi các kiểm tra chỉ để test qua.
- Thay đổi frontend trong đúng domain. Nếu cần sửa contract dùng chung, cập nhật tất cả call site liên quan và kiểm tra API; không tự thay đổi nghiệp vụ.
- Không bỏ test public survey khỏi tiêu chí nghiệm thu. Test auth-only chỉ phục vụ hồi quy đăng nhập, không thay cho G4 đầy đủ.

## Bước 0 — Chốt baseline và công cụ tái hiện

1. Chụp trạng thái workspace và lưu output typecheck, build, React Doctor với phạm vi/ref rõ ràng; dùng cùng phạm vi để so trước/sau.
2. Chạy lại G4 đầy đủ, ghi viewport, bước cuối thành công, lỗi validation, DOM liên quan và screenshot khi thất bại. Theo dõi console/page errors và request, không ghi token hoặc dữ liệu thật.
3. Kiểm tra fixture/mock refresh tương thích auth hiện tại; xác nhận bước builder/reauth qua trước khi khảo sát survey.
4. Đọc `CONTEXT.md` và ADR liên quan nếu có. Khi triển khai UI đọc skill domain, UI/UX, shadcn và React Doctor tương ứng.

Đầu ra: danh sách lỗi có thể đối chiếu, log lỗi G4 và lệnh tái hiện. Chưa sửa renderer survey ở bước này.

## Bước 1 — Sửa xử lý custom fields và dữ liệu nullable

Ưu tiên vì có thể ảnh hưởng giá trị hiển thị, dữ liệu được chọn và truy cập đối tượng null.

| File | Lỗi | Hướng xử lý dự kiến |
| --- | --- | --- |
| `apps/web/src/modules/leads/lead-custom-field.helpers.ts` | 4 diagnostics, dòng 12/16/17/24 | Kiểm tra cách tra mã tỉnh/thành; tách nhánh chuỗi, mảng chuỗi và file. Tái sử dụng guard hiện có nếu phù hợp; type predicate phải mô tả đúng `LeadCustomFieldFileValue`, không chỉ `{ name }`. |
| `apps/web/src/modules/leads/components/dynamic-field-renderer.tsx` | 2 diagnostics, dòng 133 | Thu hẹp mảng chuỗi trước xử lý multi-select; giữ file trong nhánh file. Không tự chuyển object file thành chuỗi hoặc làm mất metadata để thỏa `Set<string>`. |
| `apps/web/src/modules/sale/pages/lead-assignments-page.tsx` | 1 diagnostic, dòng 199 | Xử lý rõ trường hợp `item.lead === null` bằng trạng thái tiếng Việt, không mở link/hành động cần lead khi không còn đối tượng. |

Kiểm chứng:

- Focused tests cho formatter/normalizer ở đúng đầu vào hiện tại: null, chuỗi, multi-select, file đầy đủ metadata và dữ liệu không hợp lệ.
- Kiểm tra giữ các lựa chọn multi-select và hiển thị tên file đúng; không đưa dữ liệu file vào nhánh lựa chọn.
- Kiểm tra bản ghi assignment không còn lead hiển thị được mà không phát sinh lỗi runtime.
- Chạy typecheck, xác nhận nhóm diagnostic được xử lý và không phát sinh diagnostic mới.

## Bước 2 — Sửa danh sách dùng chung và trạng thái lỗi Admission

| File | Lỗi | Hướng xử lý dự kiến |
| --- | --- | --- |
| `apps/web/src/components/shared/business-records-page.tsx` | 1 diagnostic, dòng 241 | Đối chiếu contract sort; chỉ gửi giá trị `TSort` hợp lệ hoặc dùng sort mặc định có trong cấu hình. Không ép `undefined` thành `TSort` hoặc tự dùng chuỗi rỗng. |
| `apps/web/src/modules/admissions/pages/admission-documents-page.tsx` | 2 diagnostics, dòng 414/445 | Thu hẹp trạng thái lỗi trước render; dùng thông báo lỗi đã chuẩn hóa thay vì đưa giá trị `unknown` vào JSX. |
| `apps/web/src/modules/admissions/pages/admission-fees-page.tsx` | 3 diagnostics, dòng 353/397/421 | Xử lý lỗi tương tự; cung cấp `onReload` thực sự gọi lại query liên quan cho `ErrorState`. |
| `apps/web/src/modules/admissions/pages/admission-statuses-page.tsx` | 2 diagnostics, dòng 440/467 | Chuẩn hóa điều kiện và nội dung hiển thị lỗi; tái sử dụng helper hiện có nếu có. |
| `apps/web/src/modules/admissions/pages/admissions-list-page.tsx` | 4 diagnostics, dòng 555/595/622/659 | Sửa các vị trí render lỗi theo cùng quy tắc, giữ nội dung nhập và trạng thái submit. |

Kiểm chứng:

- Sắp xếp mặc định, đổi cột/chiều và trạng thái không có lựa chọn vẫn tạo tham số API hợp lệ; giữ phân trang server.
- Giả lập query/mutation lỗi: thông báo tiếng Việt, không render object lỗi; nút tải lại gọi đúng query và phục hồi giao diện.
- Không thêm test chỉ để kiểm tra import hoặc sao chép biểu thức JSX; tập trung vào hành vi lỗi/retry và sort có rủi ro.

## Bước 3 — Sửa discriminated unions và contract mutation

| File | Lỗi | Hướng xử lý dự kiến |
| --- | --- | --- |
| `apps/web/src/modules/automations/pages/automation-monitoring-page.tsx` | 2 diagnostics, dòng 374 | Thu hẹp đúng nhánh `rollback` trước đọc `ruleId`/`version`, kể cả bên trong callback; dùng đối tượng đã narrow hoặc snapshot có kiểu rõ ràng. |
| `apps/web/src/modules/leads/pages/leads-list-page.tsx` | 1 diagnostic, dòng 1296 | Phân biệt nhánh preset và `CUSTOM` theo discriminator thực tế; serialize đúng `fromDate`/`toDate` cho ngày tùy chọn. |
| `apps/web/src/modules/marketing/pages/meta-connection-page.tsx` | 1 diagnostic, dòng 43 | Kiểm tra response service/API cho test connection và disconnect; chuẩn hóa kết quả tại tầng gọi phù hợp hoặc khai báo union và narrow rõ trong success handler. Giữ `ok`/message nếu giao diện cần, không bỏ thông tin lỗi. |
| `apps/web/src/modules/dashboard/pages/director-dashboard-page.tsx` | 1 diagnostic, dòng 9 | Bỏ import `CardDescription` nếu không dùng; không thay đổi layout chỉ để sử dụng import. |

Kiểm chứng:

- Retry/replay dùng execution ID; rollback dùng đúng rule/version; đổi hoặc đóng dialog không làm callback chạy nhầm dữ liệu.
- Bộ lọc thời gian preset và custom tạo request đúng; không mất khoảng ngày đã chọn.
- Test connection và disconnect đều xử lý đúng trạng thái thành công/thất bại bằng mock; không kết nối hoặc ngắt tài khoản Meta thật.
- Typecheck toàn frontend phải về 0 lỗi sau bước 1–3. Nếu xuất hiện lỗi mới, ghi riêng nguyên nhân trước khi mở rộng phạm vi sửa.

## Bước 4 — Chẩn đoán và sửa public survey G4

### 4.1 Tạo tình huống tối thiểu có thể thất bại

Tách hai kịch bản từ fixture hiện có, chạy bằng browser không cần người thao tác:

1. Điền ghi chú cuối → mở màn hình xác nhận → quay lại chỉnh sửa → ghi chú vẫn tồn tại và giữ giá trị.
2. Chọn Có → nhập chi tiết → sang trang sau, chọn “Khác” và nhập nội dung → quay lại chọn Không → sang trang sau xác nhận câu trả lời ẩn đã bị loại bỏ → quay lại chọn Có → nhập lại chi tiết → tiếp tục và chọn “Khác”.

Ghi trạng thái ở các mốc: trang hiện tại, câu hỏi đang hiển thị, giá trị input, lỗi validation và nút đang thực sự được bấm. Chạy đến khi xác định được bước chuyển trạng thái gây thất bại hoặc đạt tần suất tái hiện đủ cao. Không chỉ khẳng định “không crash”.

### 4.2 Kiểm chứng nguyên nhân

Sau khi có repro tối thiểu, lập 3–5 giả thuyết xếp hạng, mỗi giả thuyết có dự đoán kiểm chứng được. Các vùng cần khảo sát gồm:

- Driver nhập liệu có cập nhật đúng giá trị React Hook Form trước khi bấm tiếp tục không.
- Tính visibility và dọn câu trả lời ẩn có vô tình xóa câu vừa nhập lại không.
- Validation, chuyển trang và chế độ xác nhận có đồng bộ đúng không.
- Selector có chọn nhầm input/nút giữa preview dialog và public form không.
- Query refetch hoặc thay đổi provider có làm remount form không.

Đây là danh sách vùng điều tra, chưa phải kết luận nguyên nhân. Thử từng biến, chỉ thêm instrumentation có mục tiêu và xóa sau chẩn đoán.

### 4.3 Sửa đúng tầng

- Nếu là lỗi renderer/state: sửa tại `marketing-form-fill.tsx`, model/helper liên quan hoặc contract visibility hiện có sau khi chứng minh; giữ chung hành vi preview và public.
- Nếu là lỗi harness: sửa selector theo đúng form/dialog và chờ trạng thái DOM/giá trị được xác nhận. Không thêm sleep tùy ý, tăng timeout đơn thuần hoặc bỏ assertion để che lỗi.
- Nếu có cả hai: tách thay đổi renderer và harness để đánh giá riêng.
- Viết regression test từ repro trước bản sửa; test phải thất bại trên tình huống lỗi, sau đó qua với bản sửa.

### 4.4 Tiêu chí hành vi

- Câu trả lời còn hiển thị được giữ khi đổi trang hoặc quay lại từ xác nhận.
- Câu trả lời bị ẩn bị xóa theo contract; khi hiện lại không tự khôi phục câu trả lời đã xóa.
- Chuyển từ “Khác” sang lựa chọn thường loại bỏ phần nội dung “Khác” theo contract hiện có.
- Giá trị chi tiết vừa nhập lại không bị mất trước validation/chuyển trang.
- Trang xác nhận thể hiện đúng đáp án hiện tại; retry sau lỗi mạng gửi cùng payload/idempotency theo contract.
- Preview không gọi API ghi CRM/automation; public chỉ submit sau xác nhận, giữ cơ chế chống trùng hiện có.

## Bước 5 — Hồi quy và bàn giao

Chạy kiểm tra hẹp sau mỗi nhóm. Khi các nhóm qua, chạy toàn bộ vòng nghiệm thu:

```powershell
npx tsc --noEmit -p apps/web/tsconfig.json
npm run build --workspace apps/web
npm run typecheck --workspace apps/api
npm run typecheck:auth --workspace apps/web
npm run test:auth --workspace apps/api
npm run test:integration:auth --workspace apps/api
npm run test:auth-browser --workspace apps/web
npm run test:auth-form-browser --workspace apps/web
npm run test:marketing-form-values --workspace apps/web
npm run test:marketing-form-leave --workspace apps/web
npm run test:marketing-form-g4-browser --workspace apps/web
npx react-doctor@latest --verbose --diff
git diff --check
```

G4 đầy đủ phải chạy qua cả 375/768/1440px ở preview và public; chạy ít nhất 3 lượt liên tiếp vì lỗi đang có biểu hiện không ổn định. Đây là kiểm chứng thêm cho vấn đề timing đã quan sát, không phải thay thế việc tìm nguyên nhân. Nếu sửa logic visibility dùng chung, chạy thêm các test API/shared đang kiểm chứng visibility và payload của survey.

Nghiệm thu hoàn tất khi:

- Typecheck toàn frontend 0 lỗi; API và auth tiếp tục qua.
- Build qua; không phát sinh cảnh báo mới do thay đổi này. Cảnh báo bundle hiện có được báo riêng.
- Hai repro survey và G4 đầy đủ đều qua, không bỏ qua kịch bản hoặc giảm assertion.
- Đăng nhập lại vẫn giữ nội dung builder, không tự replay thao tác ghi; scope/permission không thay đổi ngoài yêu cầu.
- React Doctor cùng phạm vi không có regression do bản sửa; mọi finding mới được kiểm tra bằng code.
- Xóa instrumentation tạm; báo nguyên nhân gốc survey, file đã sửa, lệnh/kết quả kiểm chứng và hạn chế còn lại.
- Cập nhật `docs/auth-session-implementation.md` và phần nghiệm thu liên quan trong `docs/ke-hoach-cai-tien-form-survey-bizcrm.md` để phản ánh trạng thái cuối, không ghi đè lịch sử sai lệch.

## Thứ tự và điểm dừng

Thực hiện: baseline → custom fields/null → sort/error states → unions/contracts → survey → hồi quy tổng thể. Baseline G4 được thu ở đầu để đối chiếu nhưng chỉ thay renderer sau khi repro và nguyên nhân đã rõ. Có thể chia thành các commit nhỏ theo các nhóm trên nếu được yêu cầu commit; kế hoạch này không tự xuất bản issue, commit hay triển khai.

Nếu một nhóm phát hiện cần thay đổi nghiệp vụ hoặc contract ngoài các lỗi đã nêu, ghi rõ tác động và giữ phần chưa phụ thuộc tiếp tục tiến triển. Không tự thay đổi dữ liệu thật, kết nối ngoài hoặc migration để xử lý lỗi kiểm thử frontend.
