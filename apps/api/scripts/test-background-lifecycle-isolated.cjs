// Reuse the guarded empty-database runner and keep this feature's artifacts separate.
const path = require('node:path');
process.env.AUTOMATION_TEST_ARTIFACT_DIR = path.resolve(__dirname, '../../../artifacts/background-workers');
process.argv.push('background-lifecycle');
require('./test-manual-unassignment-isolated.cjs');
