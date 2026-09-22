INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON permission."code" = 'customer_list.manage'
WHERE role."code" = 'DIRECTOR'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
