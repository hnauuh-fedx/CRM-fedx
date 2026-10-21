// Creates only an empty local test database; never migrates the configured CRM database.
const { spawnSync } = require('node:child_process');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ quiet: true });

async function main() {
  const base = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Isolated tests require local PostgreSQL.');
  const database = `crm_manual_unassign_test_${Date.now()}`;
  const adminUrl = new URL(base); adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  const target = new URL(base); target.pathname = `/${database}`;
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: target.toString(), WEBHOOK_QUEUE_ENABLED: 'false' };
  const logs = path.resolve('../../artifacts/manual-unassignment');
  mkdirSync(logs, { recursive: true });
  const run = (label, script, args) => {
    const result = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8', timeout: 180_000 });
    writeFileSync(path.join(logs, `${label}.log`), (result.stdout ?? '') + (result.stderr ?? ''));
    console.log(`${label}: ${result.status === 0 ? 'PASS' : 'FAIL'}`);
    if (result.status !== 0) throw new Error(`${label} failed; see artifacts/manual-unassignment/${label}.log`);
  };
  try {
    const prismaCli = require.resolve('prisma/build/index.js');
    run('schema', prismaCli, ['db', 'push']);
    const client = new Client({ connectionString: target.toString() });
    await client.connect();
    try {
      // Verify the actual additive migration independently of db push.
      await client.query('ALTER TABLE leads DROP COLUMN manual_unassignment_event_id');
      await client.query(readFileSync('prisma/migrations/20261016130000_manual_unassignment_event/migration.sql', 'utf8'));
      for (const scope of ['ALL', 'DEPARTMENT', 'ASSIGNED_ONLY', 'OWNED_ONLY', 'READ_ONLY']) {
        await client.query('INSERT INTO access_scopes(code,name) VALUES($1,$1)', [scope]);
      }
      await client.query("INSERT INTO institution_programs(institution_name,name,code) VALUES('Test','Test A','TEST_A'),('Test','Test B','TEST_B')");
      await client.query("INSERT INTO majors(name,code,institution_program_id) SELECT 'Test major','TEST_MAJOR',id FROM institution_programs");
      await client.query("INSERT INTO custom_field_groups(entity_type,group_key,group_label) VALUES('LEAD','test_lead','Test Lead')");
      await client.query("INSERT INTO pipelines(name,module) VALUES('Test baseline','sale')");
      await client.query("INSERT INTO pipeline_stages(pipeline_id,name,position) SELECT id,'Test L1',1 FROM pipelines UNION ALL SELECT id,'Test L2',2 FROM pipelines");
      await client.query("INSERT INTO lead_sources(name) VALUES('Test baseline')");
      for (const code of ['lead.assign', 'lead.reassign', 'lead.view_department', 'lead.view_assigned', 'lead.update_all', 'lead.view_all', 'automation.manage', 'automation.manage_global', 'automation.view_logs']) {
        await client.query('INSERT INTO permissions(code,name,module) VALUES($1,$1,$2)', [code, code.startsWith('lead.') ? 'lead' : 'system']);
      }
      // Baseline fixtures needed by the existing program-scope regression suite.
      await client.query("INSERT INTO roles(code,name) VALUES('DIRECTOR','Test director')");
      await client.query("INSERT INTO role_access_scopes(role_id,scope_code) SELECT id,'ALL' FROM roles WHERE code='DIRECTOR'");
      await client.query("INSERT INTO role_permissions(role_id,permission_id) SELECT roles.id,permissions.id FROM roles CROSS JOIN permissions WHERE roles.code='DIRECTOR' AND permissions.code NOT IN ('lead.view_department','lead.view_assigned')");
      await client.query("INSERT INTO role_institution_programs(role_id,institution_program_id) SELECT roles.id,institution_programs.id FROM roles CROSS JOIN institution_programs WHERE roles.code='DIRECTOR'");
      await client.query("INSERT INTO users(email,password_hash,full_name) VALUES('director@tvu.edu.vn','test-only','Test director')");
      await client.query("INSERT INTO user_roles(user_id,role_id) SELECT users.id,roles.id FROM users CROSS JOIN roles WHERE users.email='director@tvu.edu.vn' AND roles.code='DIRECTOR'");
    } finally { await client.end(); }
    const tests = process.argv.slice(2);
    const selected = tests.length ? tests : ['manual-unassignment', 'automation-engine', 'automation-program-scope', 'automation-reassignment', 'lead-assignment-open', 'marketing-form-automation-event', 'lead-workflow'];
    if (selected.includes('lead-workflow')) run('seed-sale-access', '--import', ['tsx', 'src/database/seed-sale-access.ts']);
    const failures = [];
    for (const name of selected) {
      if (!/^[a-z-]+$/.test(name)) throw new Error('Invalid test name');
      try { run(name, '--import', ['tsx', `src/integration/${name}.integration.ts`]); }
      catch (error) { failures.push(error.message); }
    }
    if (failures.length) throw new Error(failures.join('\n'));
  } finally {
    // database is generated here and checked again before deletion.
    if (!/^crm_manual_unassign_test_\d+$/.test(database) || target.pathname !== `/${database}`) throw new Error('Unsafe cleanup target');
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
    await admin.query(`DROP DATABASE "${database}"`);
    await admin.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
