const path = require('node:path');
process.env.AUTOMATION_TEST_ARTIFACT_DIR = path.resolve(__dirname, '../../../artifacts/private-files');
process.argv.push('private-files');
require('./test-manual-unassignment-isolated.cjs');
