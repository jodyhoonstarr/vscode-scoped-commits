/**
 * Regression test for issue #383: Windows activation crash caused by bare
 * `import.meta.url` references surviving into `dist/extension.js` after the
 * @commitlint/load v20 ESM migration.
 *
 * The `yarn test:e2e` script runs `yarn webpack` before launching the VS Code
 * host, so `dist/extension.js` is already built when this test executes.
 * We simply read the bundle and assert that no `import.meta.url` occurrences
 * remain — any surviving occurrence would crash the extension on Windows where
 * CommonJS bundles do not support `import.meta`.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// `__dirname` resolves to the compiled `e2e-test/out/suite/` directory.
// Three levels up (suite → out → e2e-test → repo root) lands at the repo root;
// `dist/extension.js` is a direct child of that root.
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const bundlePath = path.join(repoRoot, 'dist', 'extension.js');

suite('bundle sanity checks', () => {
  test('dist/extension.js contains no import.meta.url (issue #383 regression)', () => {
    const source = fs.readFileSync(bundlePath, 'utf8');
    const matches = source.match(/import\.meta\.url/g);
    assert.strictEqual(
      matches === null ? 0 : matches.length,
      0,
      `dist/extension.js must not contain any 'import.meta.url' occurrences ` +
        `(issue #383 — Windows activation crash). ` +
        `Found ${matches ? matches.length : 0} occurrence(s). ` +
        `Check that all string-replace-loader rules in webpack.config.js ` +
        `still match the current shape of the patched files.`,
    );
  });
});
