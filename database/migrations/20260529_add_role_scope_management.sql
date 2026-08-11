CREATE TABLE IF NOT EXISTS access_scopes (
  code varchar(50) PRIMARY KEY,
  name varchar(150) NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT access_scopes_code_check CHECK (code IN ('ALL', 'DEPARTMENT', 'ASSIGNED_ONLY', 'OWNED_ONLY', 'READ_ONLY'))
);

INSERT INTO access_scopes (code, name, description)
VALUES
  ('ALL', 'Toàn hệ thống', 'Xem dữ liệu trong toàn bộ hệ thống theo permission được cấp.'),
  ('DEPARTMENT', 'Theo phòng ban', 'Giới hạn dữ liệu theo phòng ban của người dùng.'),
  ('ASSIGNED_ONLY', 'Dữ liệu được giao', 'Chỉ xem dữ liệu được phân công trực tiếp.'),
  ('OWNED_ONLY', 'Dữ liệu tự tạo', 'Chỉ xem dữ liệu do chính người dùng tạo hoặc sở hữu.'),
  ('READ_ONLY', 'Chỉ xem', 'Chỉ đọc dashboard và báo cáo, không thao tác nghiệp vụ.')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS role_access_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  scope_code varchar(50) NOT NULL REFERENCES access_scopes(code) ON DELETE RESTRICT,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT role_access_scopes_role_id_unique UNIQUE (role_id)
);

CREATE INDEX IF NOT EXISTS idx_role_access_scopes_scope_code ON role_access_scopes(scope_code);
