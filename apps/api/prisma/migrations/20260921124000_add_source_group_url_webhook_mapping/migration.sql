INSERT INTO webhook_field_mappings (
    webhook_id,
    incoming_key,
    crm_field,
    is_required,
    default_value
)
SELECT
    w.id,
    'utm_url',
    'sourceGroupUrl',
    FALSE,
    NULL
FROM webhooks w
WHERE NOT EXISTS (
    SELECT 1
    FROM webhook_field_mappings m
    WHERE m.webhook_id = w.id
      AND (m.incoming_key = 'utm_url' OR m.crm_field = 'sourceGroupUrl')
);
