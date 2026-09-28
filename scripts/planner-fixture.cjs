// Load the legacy populated plan for regression flows without changing what
// first-time users see. Node strips the type-only TypeScript in this module.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = JSON.parse(execFileSync('node', ['--experimental-strip-types', '--input-type=module', '-e',
  "import { defaultData } from './src/domain/defaults.ts'; process.stdout.write(JSON.stringify(defaultData));",
], { cwd: path.join(__dirname, '..'), encoding: 'utf8', windowsHide: true }));
