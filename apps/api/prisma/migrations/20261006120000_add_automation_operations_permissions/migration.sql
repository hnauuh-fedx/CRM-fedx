INSERT INTO "permissions" ("name", "code", "module", "description", "is_active")
VALUES
  ('Xem vận hành Rule Automation', 'automation.view', 'system', 'Xem danh sách rule và chỉ số vận hành trong phạm vi được cấp.', TRUE),
  ('Xem nhật ký Rule Automation', 'automation.view_logs', 'system', 'Xem lịch sử execution và node trong phạm vi được cấp.', TRUE),
  ('Cập nhật Rule Automation', 'automation.update', 'system', 'Cập nhật và khôi phục phiên bản rule trong phạm vi được cấp.', TRUE),
  ('Chạy lại Rule Automation', 'automation.retry', 'system', 'Retry hoặc replay execution automation trong phạm vi được cấp.', TRUE),
  ('Chuyển người phụ trách Rule Automation', 'automation.transfer_owner', 'system', 'Chuyển quyền sở hữu rule cho người dùng hợp lệ trong cùng phạm vi.', TRUE)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "is_active" = TRUE;
