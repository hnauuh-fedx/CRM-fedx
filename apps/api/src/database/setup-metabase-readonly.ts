import fs from "node:fs";
import path from "node:path";

import { parse } from "dotenv";
import { Client } from "pg";

const apiEnv = parse(fs.readFileSync(path.resolve(process.cwd(), ".env")));
const metabaseEnv = parse(
  fs.readFileSync(path.resolve(process.cwd(), "../metabase/.env")),
);

const databaseUrl = apiEnv.DATABASE_URL;
const reportingPassword = metabaseEnv.METABASE_REPORTING_DB_PASSWORD;

if (!databaseUrl) {
  throw new Error("Thiếu DATABASE_URL trong apps/api/.env.");
}

if (!reportingPassword || reportingPassword.length < 24) {
  throw new Error(
    "METABASE_REPORTING_DB_PASSWORD phải có ít nhất 24 ký tự trong apps/metabase/.env.",
  );
}

const loginRole = "crm_reporting_metabase";

async function configureMetabaseReadonlyLogin() {
  const administrator = new Client({ connectionString: databaseUrl });
  await administrator.connect();

  try {
    const existingRole = await administrator.query(
      "SELECT 1 FROM pg_roles WHERE rolname = $1",
      [loginRole],
    );

    if (existingRole.rowCount === 0) {
      await administrator.query(`CREATE ROLE ${loginRole} LOGIN`);
    }

    // PostgreSQL utility statements do not accept a password bind parameter.
    // Let PostgreSQL quote the secret, then execute the resulting statement without logging it.
    const passwordStatement = await administrator.query<{ sql: string }>(
      `SELECT format('ALTER ROLE ${loginRole} WITH LOGIN PASSWORD %L', $1::text) AS sql`,
      [reportingPassword],
    );
    await administrator.query(passwordStatement.rows[0].sql);
    await administrator.query(`GRANT crm_reporting_reader TO ${loginRole}`);

    const role = await administrator.query<{
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
    }>(
      `SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb
       FROM pg_roles
       WHERE rolname = $1`,
      [loginRole],
    );

    const target = new URL(databaseUrl);
    target.username = loginRole;
    target.password = reportingPassword;

    const reader = new Client({ connectionString: target.toString() });
    await reader.connect();

    try {
      const reportingRows = await reader.query<{ dataset: string; count: number }>(
        `SELECT 'leads' AS dataset, count(*)::int AS count FROM reporting.sale_pipeline_scope_fact
         UNION ALL SELECT 'admission_candidates', count(*)::int FROM reporting.admission_candidate_scope_fact
         UNION ALL SELECT 'students', count(*)::int FROM reporting.student_scope_fact`,
      );
      let publicUsersDenied = false;

      try {
        await reader.query("SELECT 1 FROM public.users LIMIT 1");
      } catch (error) {
        publicUsersDenied =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "42501";
      }

      if (!publicUsersDenied) {
        throw new Error(
          "Kiểm tra bảo mật thất bại: login reporting vẫn đọc được public.users.",
        );
      }

      console.log(
        JSON.stringify({
          loginReady: role.rows[0].rolcanlogin,
          superuser: role.rows[0].rolsuper,
          createRole: role.rows[0].rolcreaterole,
          createDatabase: role.rows[0].rolcreatedb,
          reportingViewReadable: true,
          reportingRows: Object.fromEntries(reportingRows.rows.map((row) => [row.dataset, row.count])),
          publicUsersDenied,
        }),
      );
    } finally {
      await reader.end();
    }
  } finally {
    await administrator.end();
  }
}

configureMetabaseReadonlyLogin().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
