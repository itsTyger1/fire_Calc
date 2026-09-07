// Remove reproducible output only; keep source, dependencies, and the current installer.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { version } = require('../package.json');
const remove = (relative) => {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error(`Unsafe cleanup path: ${target}`);
  fs.rmSync(target, { recursive: true, force: true });
};
for (const generated of ['dist', 'artifacts', 'smoke-profile', 'node_modules/.cache', 'tsconfig.app.tsbuildinfo', 'tsconfig.node.tsbuildinfo']) remove(generated);
for (const name of fs.readdirSync(root)) if (/^(ui-test|smoke-).*\.log$/.test(name)) remove(name);
const releases = path.join(root, 'release');
if (fs.existsSync(releases)) {
  for (const name of fs.readdirSync(releases)) {
    if (name !== `FIRE-Projector-Setup-${version}.exe`) remove(path.join('release', name));
  }
}
console.log(`Cleaned generated files; retained FIRE-Projector-Setup-${version}.exe if present.`);
