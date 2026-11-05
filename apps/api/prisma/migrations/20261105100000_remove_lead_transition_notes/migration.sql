-- The "ghi chú theo trạng thái" templates are replaced by the multi-level
-- "Quy trình Telesale/Trạng thái" configuration (lead_stage_detail_options.*).
-- Old templates are intentionally not migrated. Notes and activities created
-- from them earlier stay untouched.
DELETE FROM system_settings WHERE key LIKE 'lead\_transition\_notes.%';
