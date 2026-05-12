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

  // Regression test for issue #391: cosmiconfig v9 lazy-requires parse-json
  // and js-yaml. These must be bundled by webpack (__webpack_require__), not
  // redirected to __non_webpack_require__ which would fail at runtime because
  // no node_modules/ is shipped inside the vsix.
  test('dist/extension.js bundles parse-json via __webpack_require__ (issue #391 regression)', () => {
    const source = fs.readFileSync(bundlePath, 'utf8');

    // parse-json must appear as a webpack module path, not a bare runtime require.
    assert.ok(
      source.includes('parse-json'),
      'dist/extension.js must contain parse-json (it should be bundled)',
    );
    // The lazy-require call that previously escaped bundling must now resolve
    // through webpack. A bare require('parse-json') with no webpack module id
    // would mean it escaped.
    const bareRequire = /\brequire\(['"]parse-json['"]\)/.test(source);
    assert.strictEqual(
      bareRequire,
      false,
      `dist/extension.js must not contain a bare require('parse-json') — ` +
        `it must be bundled as a __webpack_require__ call instead. ` +
        `Check the cosmiconfig string-replace-loader rule in webpack.config.js.`,
    );
  });

  test('dist/extension.js bundles js-yaml via __webpack_require__ (issue #391 regression)', () => {
    const source = fs.readFileSync(bundlePath, 'utf8');

    assert.ok(
      source.includes('js-yaml'),
      'dist/extension.js must contain js-yaml (it should be bundled)',
    );
    const bareRequire = /\brequire\(['"]js-yaml['"]\)/.test(source);
    assert.strictEqual(
      bareRequire,
      false,
      `dist/extension.js must not contain a bare require('js-yaml') — ` +
        `it must be bundled as a __webpack_require__ call instead. ` +
        `Check the cosmiconfig string-replace-loader rule in webpack.config.js.`,
    );
  });
});
