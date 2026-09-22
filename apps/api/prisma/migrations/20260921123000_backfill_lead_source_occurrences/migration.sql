INSERT INTO lead_origins (institution_program_id, name, normalized_name)
SELECT DISTINCT ON (l.institution_program_id, lower(btrim(r.mapped_payload->>'source')))
    l.institution_program_id,
    btrim(r.mapped_payload->>'source'),
    lower(btrim(r.mapped_payload->>'source'))
FROM webhook_requests r
JOIN leads l ON l.id = r.record_id
WHERE r.status IN ('SUCCEEDED', 'SUCCESS')
  AND r.mapped_payload ? 'source'
  AND l.institution_program_id IS NOT NULL
  AND length(btrim(r.mapped_payload->>'source')) BETWEEN 1 AND 150
ORDER BY l.institution_program_id, lower(btrim(r.mapped_payload->>'source')), r.received_at
ON CONFLICT (institution_program_id, normalized_name) DO NOTHING;

INSERT INTO lead_source_occurrences (
    lead_id,
    origin_id,
    webhook_id,
    request_id,
    source_name,
    note,
    details,
    received_at
)
SELECT
    r.record_id,
    o.id,
    r.webhook_id,
    r.request_id,
    w.name,
    NULLIF(btrim(r.mapped_payload->>'note'), ''),
    r.mapped_payload,
    r.received_at
FROM webhook_requests r
JOIN leads l ON l.id = r.record_id
JOIN webhooks w ON w.id = r.webhook_id
JOIN lead_origins o ON o.institution_program_id = l.institution_program_id
                   AND o.normalized_name = lower(btrim(r.mapped_payload->>'source'))
WHERE r.status IN ('SUCCEEDED', 'SUCCESS')
  AND r.mapped_payload ? 'source'
  AND length(btrim(r.mapped_payload->>'source')) BETWEEN 1 AND 150
ON CONFLICT (request_id) DO NOTHING;
