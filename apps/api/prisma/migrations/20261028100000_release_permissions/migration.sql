-- Global infrastructure permissions. Assign explicitly with ALL scope after operator review.
INSERT INTO permissions(code, name, module, is_active) VALUES
('release.view', 'Xem phiên bản hệ thống', 'system', true),
('release.deploy', 'Triển khai và khôi phục phiên bản hệ thống', 'system', true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true;
