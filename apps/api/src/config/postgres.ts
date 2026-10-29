import { postgresConnectionOptions } from "@admission-crm/shared/postgres-config";
import { env } from "./env";

export const databaseConnectionOptions = postgresConnectionOptions(env);
export const sessionDatabaseConnectionOptions = postgresConnectionOptions(env, true);
