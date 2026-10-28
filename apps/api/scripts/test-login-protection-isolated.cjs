const path = require('node:path');
process.env.AUTOMATION_TEST_ARTIFACT_DIR = path.resolve(__dirname, '../../../artifacts/login-protection');
process.argv.push('login-protection', 'auth-session');
require('./test-manual-unassignment-isolated.cjs');
