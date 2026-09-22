WITH historical AS (
    SELECT DISTINCT ON (r.record_id)
        r.record_id AS lead_id,
        l.institution_program_id AS program_id,
        btrim(r.mapped_payload->>'source') AS name
    FROM webhook_requests r
    JOIN leads l ON l.id = r.record_id
    WHERE r.status IN ('SUCCEEDED', 'SUCCESS')
      AND r.mapped_payload ? 'source'
      AND l.institution_program_id IS NOT NULL
      AND l.origin_id IS NULL
      AND length(btrim(r.mapped_payload->>'source')) BETWEEN 1 AND 150
    ORDER BY r.record_id, r.processed_at DESC NULLS LAST, r.id DESC
)
INSERT INTO lead_origins (institution_program_id, name, normalized_name)
SELECT DISTINCT ON (program_id, lower(name)) program_id, name, lower(name)
FROM historical
ORDER BY program_id, lower(name), name
ON CONFLICT (institution_program_id, normalized_name) DO NOTHING;

WITH historical AS (
    SELECT DISTINCT ON (r.record_id)
        r.record_id AS lead_id,
        l.institution_program_id AS program_id,
        lower(btrim(r.mapped_payload->>'source')) AS normalized_name
    FROM webhook_requests r
    JOIN leads l ON l.id = r.record_id
    WHERE r.status IN ('SUCCEEDED', 'SUCCESS')
      AND r.mapped_payload ? 'source'
      AND l.institution_program_id IS NOT NULL
      AND l.origin_id IS NULL
      AND length(btrim(r.mapped_payload->>'source')) BETWEEN 1 AND 150
    ORDER BY r.record_id, r.processed_at DESC NULLS LAST, r.id DESC
)
UPDATE leads l
SET origin_id = o.id
FROM historical h
JOIN lead_origins o ON o.institution_program_id = h.program_id
                   AND o.normalized_name = h.normalized_name
WHERE l.id = h.lead_id AND l.origin_id IS NULL;
