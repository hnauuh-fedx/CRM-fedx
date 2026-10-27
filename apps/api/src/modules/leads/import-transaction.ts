import type { Prisma } from "../../generated/prisma/client";
import type { prisma } from "../../database/prisma";

class PreviewRollback<T> extends Error {
  constructor(readonly result: T) { super("import_preview_rollback"); }
}

/** Preview runs the real validators/writers and rolls back the entire row, including audit and related tables. */
export async function importTransaction<T>(database: Pick<typeof prisma, "$transaction">, callback: (tx: Prisma.TransactionClient) => Promise<T>, preview = false): Promise<T> {
  try {
    return await database.$transaction(async tx => {
      const result = await callback(tx);
      if (preview) throw new PreviewRollback(result);
      return result;
    });
  } catch (error) {
    if (error instanceof PreviewRollback) return error.result as T;
    throw error;
  }
}
