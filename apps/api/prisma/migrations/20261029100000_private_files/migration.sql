ALTER TABLE files ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE files
  ADD COLUMN storage_provider varchar(20) NOT NULL DEFAULT 'external',
  ADD COLUMN storage_status varchar(20) NOT NULL DEFAULT 'ready',
  ADD COLUMN storage_bucket text,
  ADD COLUMN object_key text,
  ADD COLUMN institution_program_id uuid,
  ADD COLUMN upload_target_id uuid,
  ADD COLUMN upload_domain varchar(20),
  ADD COLUMN document_type varchar(150),
  ADD COLUMN request_id uuid,
  ADD COLUMN request_fingerprint varchar(64),
  ADD COLUMN content_sha256 varchar(64),
  ADD COLUMN operation_token uuid,
  ADD COLUMN lease_until timestamptz;
ALTER TABLE files ADD CONSTRAINT files_storage_provider_check CHECK(storage_provider IN ('external','s3'));
ALTER TABLE files ADD CONSTRAINT files_storage_status_check CHECK(storage_status IN ('pending','ready','failed','deleting','deleted'));
ALTER TABLE files ADD CONSTRAINT files_private_metadata_check CHECK(storage_provider='external' OR (storage_bucket IS NOT NULL AND object_key IS NOT NULL AND institution_program_id IS NOT NULL AND upload_target_id IS NOT NULL AND upload_domain IN ('lead','admission') AND request_id IS NOT NULL AND request_fingerprint IS NOT NULL AND content_sha256 IS NOT NULL AND file_url IS NULL));
CREATE UNIQUE INDEX files_upload_request_key ON files(uploaded_by,request_id);
CREATE UNIQUE INDEX files_storage_object_key ON files(storage_bucket,object_key);
CREATE INDEX idx_files_storage_cleanup ON files(storage_provider,storage_status,lease_until);
