INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), role.id, permission.id
FROM "roles" AS role
JOIN "permissions" AS permission ON permission.code IN ('integration.view', 'integration.log.view')
WHERE role.code = 'DIRECTOR'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), role.id, permission.id
FROM "roles" AS role
JOIN "permissions" AS permission ON permission.code = 'integration.view'
WHERE role.code = 'MARKETING_STAFF'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
