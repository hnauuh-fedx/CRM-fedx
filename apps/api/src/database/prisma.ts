import { PrismaPg } from "@prisma/adapter-pg";

import { historyData } from "./history-source";
import { databaseConnectionOptions } from "../config/postgres";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg(databaseConnectionOptions);

// Query-only extension preserves the public client and transaction contract.
export const prisma: PrismaClient = new PrismaClient({ adapter }).$extends({
  name: "history-execution-source",
  query: {
    lead_activities: {
      create({ args, query }) {
        args.data = historyData(args.data, "metadata");
        return query(args);
      },
    },
    audit_logs: {
      create({ args, query }) {
        args.data = historyData(args.data, "new_data");
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;
