import type { RequestHandler } from "express";
import { prisma } from "../../database/prisma";
import { hasCustomFieldPermission, customFieldPermissionForms, type CustomFieldPermissionAction } from "./custom-field-permissions";

// Resolve persisted entity types for ID-based operations; never trust a supplied
// entityType to authorize updates to a field belonging to a different form.
export function createCustomFieldPermissionGuard(repository: Pick<typeof prisma, "custom_fields" | "custom_field_groups">) {
 return function requirePermission(...actions: CustomFieldPermissionAction[]): RequestHandler {
  return async (req, res, next) => {
    try {
      let entities: Array<{ entity_type: string | null; program_id?: string | null; is_sensitive?: boolean | null }> = [];
      if (req.params.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(req.params.id))) {
        const groupRoute = req.path.startsWith("/groups/");
        const item = groupRoute
          ? await repository.custom_field_groups.findUnique({ where: { id: String(req.params.id) }, select: { entity_type: true } })
          : await repository.custom_fields.findUnique({ where: { id: String(req.params.id) }, select: { entity_type: true, program_id: true, is_sensitive: true } });
        if (!item) { res.status(404).json({ message: "Không tìm thấy trường hoặc nhóm trường dữ liệu." }); return; }
        entities = [item];
      } else if (req.path === "/reorder" && Array.isArray(req.body?.fieldIds)) {
        const ids = req.body.fieldIds.filter((value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
        entities = await repository.custom_fields.findMany({ where: { id: { in: ids } }, select: { entity_type: true, program_id: true, is_sensitive: true } });
      } else {
        const type = req.path.startsWith("/system/LEAD/") ? "LEAD" : req.params.entityType ?? (req.method === "GET" ? req.query.entityType : req.body?.entityType);
        if (typeof type === "string") entities = [{ entity_type: type }];
      }
      const permissions = req.authUser!.permissions;
      const allowed = (entityType: string) => actions.some((action) => hasCustomFieldPermission(permissions, entityType, action));
      const authorized = entities.length
        ? entities.every((item) => item.entity_type && allowed(item.entity_type)
          && (!item.program_id || req.authUser!.institutionProgramIds.includes(item.program_id)))
        : Object.keys(customFieldPermissionForms).some(allowed);
      if (!authorized) { res.status(403).json({ message: "Bạn không có quyền cấu hình trường dữ liệu của form này." }); return; }
      if (req.method !== "GET" && entities.some((item) => item.is_sensitive && !hasCustomFieldPermission(permissions, item.entity_type ?? "", "edit_sensitive"))) {
        res.status(403).json({ message: "Bạn không có quyền chỉnh sửa cấu hình trường nhạy cảm của form này." }); return;
      }
      next();
    } catch (error) { next(error); }
  };
 };
}
export const requireCustomFieldPermission = createCustomFieldPermissionGuard(prisma);
