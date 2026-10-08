# Kế hoạch mở rộng node Chia Lead tự động theo tương tác của Sale

## Mục tiêu

Mở rộng node `action_assign_pool` để có thể theo dõi từng lần phân công, cảnh báo Sale chưa tương tác và tự động thu hồi/chia lại Lead mà không chuyển nhầm người, không lặp vô hạn và không vượt khỏi chương trình làm việc.

Phạm vi V1 ưu tiên tiêu chí **Sale không mở bản ghi kể từ thời điểm gán**. Các tiêu chí “không ghi chú/chăm sóc” và “không cập nhật dữ liệu” được giữ trong thiết kế nhưng triển khai sau khi luồng assignment-aware ổn định.

## Trải nghiệm cấu hình

Node Chia Lead tự động gồm các nhóm:

1. **Nguồn phân công**
   - Chiến lược: chia vòng hoặc ít Lead nhất.
   - Team/phòng ban.
   - Danh sách nhân viên.
2. **Thu hồi Sale không tương tác**
   - Checkbox bật/tắt chính sách.
   - Tiêu chí tương tác dạng radio:
     - Không mở bản ghi kể từ thời điểm gán (V1).
     - Không ghi chú/chăm sóc kể từ thời điểm gán (giai đoạn sau).
     - Không cập nhật dữ liệu kể từ thời điểm gán (giai đoạn sau).
   - Khoảng thời gian và đơn vị Phút/Giờ/Ngày.
3. **Chính sách chia lại**
   - Gán cho nhân viên khác sau khi thu hồi.
   - Luôn loại Sale hiện tại khỏi lần chọn tiếp theo.
   - Số lần gán lại tối đa cho một Lead.
   - Cho phép quay lại danh sách khi đã thử hết Sale.
   - Số vòng quay lại tối đa.
4. **Cảnh báo**
   - Cảnh báo CRM lần một trước hạn thu hồi.
   - Nội dung hỗ trợ template token.
   - Cảnh báo lần hai và email là phần mở rộng sau V1.
   - Thông báo cho Sale khi Lead bị thu hồi.

Các trường con chỉ xuất hiện khi checkbox cha được bật. Form phải có nhãn hiển thị, mô tả ngắn, lỗi cạnh trường, điều khiển bàn phím và trạng thái disabled rõ ràng. Panel cấu hình mở rộng trên desktop và dùng bố cục phù hợp màn hình nhỏ.

## Hợp đồng cấu hình

Chính sách được lưu trong `automation_rules.graph_data` tại node:

```ts
type AutomationReassignmentPolicy = {
  enabled: boolean;
  interactionCriterion: "not_opened_since_assignment";
  timeoutMinutes: number;
  assignToAnotherSale: boolean;
  excludeCurrentAssignee: true;
  maxReassignments: number;
  recyclePool: boolean;
  maxPoolCycles: number;
  warningEnabled: boolean;
  warningBeforeMinutes: number;
  warningContent: string;
  notifyOnRemoval: boolean;
};
```

Giới hạn phía server:

- `timeoutMinutes`: 1–43.200 phút.
- `warningBeforeMinutes`: từ 1 và nhỏ hơn `timeoutMinutes`.
- `maxReassignments`: 1–100.
- `maxPoolCycles`: 1–100 khi bật quay vòng.
- `excludeCurrentAssignee` luôn là `true` trong V1.

## Mô hình dữ liệu

### `lead_assignments`

Thêm:

```prisma
first_opened_at DateTime? @db.Timestamp(6)
```

Mỗi lần phân công tạo một assignment mới nên thời điểm mở được đặt lại tự nhiên. Chỉ chính Sale đang được phân công mới có thể ghi nhận `first_opened_at`.

### Theo dõi chính sách Automation

Thêm bảng trạng thái bền vững, định danh theo `rule_id + node_id + assignment_id`, chứa:

- Lead và assignment hiện tại.
- Sale hiện tại.
- Thời điểm cảnh báo/thu hồi.
- Số lần gán lại và vòng pool.
- Danh sách Sale đã thử trong vòng hiện tại.
- Trạng thái pending/warned/reassigned/cancelled/completed/failed.
- Snapshot cấu hình cần thiết để worker không phụ thuộc vào state frontend.

Unique key phải theo assignment, không chỉ theo Lead, để một Lead có thể được theo dõi lại sau mỗi lần phân công.

## Luồng runtime V1

1. Node `action_assign_pool` chọn Sale và tạo assignment trong transaction.
2. Cùng transaction, tạo bản ghi monitor cho assignment mới và hoàn thành action node.
3. Sau commit, enqueue job cảnh báo và job kiểm tra hết hạn bằng BullMQ.
4. Job cảnh báo kiểm tra assignment vẫn là owner hiện tại và `first_opened_at IS NULL` trước khi gửi notification.
5. Job hết hạn khóa bản ghi monitor/assignment, kiểm tra lại điều kiện và giới hạn vòng.
6. Nếu Sale đã mở hoặc assignment không còn hiện hành, monitor được kết thúc mà không chuyển.
7. Nếu vẫn chưa mở, chọn Sale mới sau khi loại Sale hiện tại và lịch sử vòng; gọi use case phân công hiện có để tạo assignment/activity/audit/notification.
8. Tạo monitor tiếp theo cho assignment mới nếu chưa đạt giới hạn.

Mọi thao tác phải idempotent và an toàn khi hai worker chạy đồng thời.

## Quyền và phạm vi

- Người cấu hình/actor của rule phải có `lead.assign` hoặc `lead.reassign`.
- Candidate chỉ lấy từ chương trình làm việc của rule và scope hợp lệ.
- Không hardcode role; kiểm tra permission và scope ở API/runtime.
- Manager/Director mở Lead không được tính là Sale phụ trách đã mở.
- Worker phải thực thi bằng actor trong đúng `institution_program_id` của rule.

## Audit và thông báo

Mỗi lần thu hồi/chia lại phải tạo đồng thời:

- `lead_assignments` mới và đóng owner cũ.
- `lead_activities` mô tả lý do tự động chia lại.
- `audit_logs` với rule/node/assignment cũ và Sale cũ/mới.
- Notification cho Sale mới.
- Notification cho Sale bị thu hồi nếu cấu hình bật.

Không dùng browser alert. Email chỉ hiển thị trong cấu hình khi provider email thật sự khả dụng.

## Giai đoạn triển khai

### Giai đoạn A — Assignment-aware foundation

- [x] Migration `lead_assignments.first_opened_at`.
- [x] Endpoint mở Lead ghi nhận lần mở đầu tiên cho assignment hiện hành.
- [x] Assignment mutation trả `assignmentId` và dùng transaction advisory lock để tuần tự hóa phân công theo Lead.
- [x] Unit/integration test cho mở đúng Sale, manager mở, mở lặp và reassignment.

### Giai đoạn B — Contract và UI V1

- [x] Thêm `AutomationReassignmentPolicy` vào API/Web types.
- [x] Mở rộng registry với control checkbox/radio/duration và validation phụ thuộc.
- [ ] Hoàn thiện form progressive disclosure và lỗi cạnh trường; hiện mới có scaffold xem trước bị khóa.
- [ ] Hiển thị bản tóm tắt chính sách bằng tiếng Việt.
- [x] Kiểm tra bàn phím, focus, responsive và React Doctor cho phạm vi đã thay đổi.

### Giai đoạn C — Monitor và chia lại

- [ ] Bảng monitor/migration/index.
- [ ] Job cảnh báo và job hết hạn.
- [ ] Loại Sale hiện tại/lịch sử vòng khỏi candidate pool.
- [ ] Giới hạn số lần gán lại và số vòng.
- [ ] Idempotency, transaction lock và phục hồi job bị thất lạc.

### Giai đoạn D — Thông báo và observability

- [ ] Cảnh báo CRM lần một.
- [ ] Thông báo khi bị thu hồi.
- [ ] Log lý do dừng/chuyển, Sale cũ/mới và thời gian trễ.
- [ ] Metrics pending/warned/reassigned/cancelled/failed theo chương trình.

### Giai đoạn E — Mở rộng tương tác

- [ ] Không ghi chú/chăm sóc kể từ lúc gán.
- [ ] Không cập nhật dữ liệu kể từ lúc gán.
- [ ] Cảnh báo lần hai.
- [ ] Email khi provider thật khả dụng.

## Tiêu chí nghiệm thu V1

- Sale mở trước hạn: không bị chuyển.
- Sale không mở: Lead chỉ được chuyển đúng một lần tại mỗi hạn.
- Manager/Director mở: không hủy SLA của Sale.
- Assignment cũ hết hạn sau khi Lead đã đổi Sale: job cũ không tác động.
- Sale hiện tại không được chọn lại ngay.
- Hết pool: dừng hoặc quay vòng đúng cấu hình.
- Hai worker chạy đồng thời không tạo hai assignment mới.
- Không chia sang Sale của chương trình khác.
- Mỗi lần chuyển có activity, audit và notification đầy đủ.
- Cấu hình sai không thể bật rule và lỗi hiển thị cạnh trường tương ứng.

## Kiểm thử bắt buộc

- Unit test validation policy và lựa chọn candidate.
- Unit test thời điểm cảnh báo/thu hồi.
- Integration test open tracking theo assignment.
- Integration test worker chuyển Sale, stale assignment và idempotency.
- API typecheck, Automation test suite, web build.
- React Doctor không có regression.

## Trạng thái

- Ngày bắt đầu: 08/10/2026.
- Trạng thái hiện tại: đã hoàn tất nền tảng Giai đoạn A và contract/validation nền của Giai đoạn B; UI đang ở bản xem trước bị khóa.
- Migration đã áp dụng vào PostgreSQL cục bộ; integration test open tracking và unit test validation policy đều đã đạt.
- UI policy đang ở chế độ xem trước và chưa cho bật cho đến khi monitor/job Giai đoạn C hoàn tất.
