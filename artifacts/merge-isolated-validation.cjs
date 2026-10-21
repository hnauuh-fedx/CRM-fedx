const {spawnSync}=require('node:child_process');
const {writeFileSync,mkdirSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const api=path.join(root,'.merge-worktrees/update-lead-info/apps/api');
const {Client}=require(path.join(root,'node_modules/pg'));
require(path.join(root,'node_modules/dotenv')).config({path:path.join(root,'apps/api/.env'),quiet:true});
async function main(){
 const base=new URL(process.env.DATABASE_URL);
 if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw Error('Local database required');
 const database='crm_merge_test_'+Date.now();
 const adminUrl=new URL(base);adminUrl.pathname='/postgres';
 const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
 await admin.query(`CREATE DATABASE "${database}"`);
 const target=new URL(base);target.pathname='/'+database;
 const env={...process.env,NODE_ENV:'test',DATABASE_URL:target.toString(),JWT_SECRET:'isolated-merge-test-secret-at-least-32-characters',WEBHOOK_QUEUE_ENABLED:'false',NODE_OPTIONS:'--max-old-space-size=768 --max-semi-space-size=2'};
 const logs=path.join(root,'artifacts/merge-integration');mkdirSync(logs,{recursive:true});
 const run=(label,args)=>{const result=spawnSync(process.execPath,args,{cwd:api,env,encoding:'utf8',timeout:180000});writeFileSync(path.join(logs,label+'.log'),(result.stdout||'')+(result.stderr||'')+(result.error?.message||''));console.log(label+': '+(result.status===0?'PASS':'FAIL'));return result.status===0;};
 try{
  if(!run('schema',[path.join(root,'node_modules/prisma/build/index.js'),'db','push']))throw Error('Schema failed');
  const client=new Client({connectionString:target.toString()});await client.connect();
  try{
   for(const code of ['ALL','DEPARTMENT','ASSIGNED_ONLY','OWNED_ONLY','READ_ONLY'])await client.query('INSERT INTO access_scopes(code,name) VALUES($1,$1)',[code]);
   for(const code of ['user.manage','lead.view_assigned','lead.view_all','lead.view_department','lead.sensitive.view','report.view','lead.assign','lead.reassign'])await client.query('INSERT INTO permissions(code,name,module) VALUES($1,$1,$2)',[code,code.split('.')[0]]);
  }finally{await client.end();}
  const failures=[];
  for(const test of ['auth-session','user-program-roles','effective-access-scope'])if(!run(test,['--import','tsx',`src/integration/${test}.integration.ts`]))failures.push(test);
  if(failures.length)throw Error('Failed: '+failures.join(', '));
 }finally{
  if(!/^crm_merge_test_\d+$/.test(database)||target.pathname!=='/'+database)throw Error('Unsafe cleanup');
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[database]);await admin.query(`DROP DATABASE "${database}"`);await admin.end();
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
