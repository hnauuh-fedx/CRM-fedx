// Runs only after CI tests and both image builds succeed. Never reads application secrets.
const required = name => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
const url = new URL(required('CONTROL_URL'));
if (url.protocol !== 'https:') throw new Error('CI registration requires HTTPS.');
const response = await fetch(new URL('/v1/releases', url), {
  method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
  headers: { Authorization: `Bearer ${required('CONTROL_CI_TOKEN')}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    commit: required('GITHUB_SHA'), version: `build-${required('GITHUB_RUN_NUMBER')}`,
    notes: process.env.RELEASE_NOTES ?? '', apiImage: required('API_IMAGE'), webImage: required('WEB_IMAGE'),
    schemaGeneration: required('RELEASE_SCHEMA_GENERATION'),
    buildUrl: `${required('GITHUB_SERVER_URL')}/${required('GITHUB_REPOSITORY')}/actions/runs/${required('GITHUB_RUN_ID')}`,
  }),
});
if (!response.ok) throw new Error(`Release registration failed (${response.status}). Retry registration using the same manifest.`);
console.log('Release registered. Select deployment in CRM.');
