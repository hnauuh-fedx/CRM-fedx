// The configured CRM database is never migrated or modified by this test runner.
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { Client } = require('pg');
require('dotenv').config({ quiet: true });

async function main() {
  const base = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Tests require local PostgreSQL.');
  const database = `crm_assignment_report_test_${Date.now()}`;
  const adminUrl = new URL(base); adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  const target = new URL(base); target.pathname = `/${database}`;
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: target.toString(), DATABASE_DIRECT_URL: target.toString(),
    DATABASE_SSL_MODE: 'url', DATABASE_SSL_CA: '', DISABLE_REDIS: 'true', DISABLE_AUTOMATION_WORKER: 'true', WEBHOOK_QUEUE_ENABLED: 'false' };
  function run(script, args) {
    const result = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8', timeout: 180000 });
    process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
    if (result.status !== 0) throw new Error(`Test command failed (${result.status}).`);
  }
  try {
    run(require.resolve('prisma/build/index.js'), ['db', 'push']);
    const client = new Client({ connectionString: target.toString() });
    await client.connect();
    try {
      // Verify the real migration creates its tables and installs its transactional capture functions.
      await client.query('DROP TABLE lead_assignment_report_events,lead_assignment_report_coverage');
      await client.query(readFileSync('prisma/migrations/20261105120000_assignment_reporting/migration.sql', 'utf8'));
    } finally { await client.end(); }
    run(require.resolve('tsx/cli'), ['src/integration/assignment-report.integration.ts']);
  } finally {
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
    await admin.query(`DROP DATABASE "${database}"`);
    await admin.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
