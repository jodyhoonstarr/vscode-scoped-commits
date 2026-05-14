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

  // Regression test for issue #395: jiti/lib/jiti.mjs and jiti/lib/jiti.cjs
  // both call into node:module to obtain `createRequire`. Without the
  // string-replace-loader patches in webpack.config.js, webpack either drops
  // the ESM import (leaving createRequire undefined) or bundles node:module as
  // an empty stub. Either way `createJiti` receives createRequire: undefined
  // and cosmiconfig-typescript-loader throws
  // `TypeError: i.createRequire is not a function` for TypeScript commitlint configs.
  //
  // The fix patches both jiti entries to use __non_webpack_require__("node:module"),
  // which webpack emits as `require("node:module")` resolved via the
  // "node:module" external entry — i.e. `module.exports = require("node:module")`.
  // The correct signal is therefore that "node:module" IS present as a webpack
  // external, and that createRequire is not undefined in createJiti's call.
  test('dist/extension.js externalises node:module and passes createRequire to createJiti (issue #395 regression)', () => {
    const source = fs.readFileSync(bundlePath, 'utf8');

    // 1. node:module must be present as a webpack external so that
    //    require("node:module") resolves to the real Node built-in at runtime.
    assert.ok(
      source.includes('!*** external "node:module" ***!'),
      `dist/extension.js must contain a webpack external for "node:module" — ` +
        `without it, require("node:module") resolves to an empty stub and ` +
        `createRequire is undefined (issue #395).`,
    );

    // 2. createJiti must not receive `createRequire: undefined`. After patching,
    //    the jiti.mjs module passes the variable `createRequire` (obtained from
    //    node:module) rather than the literal `undefined`.
    assert.ok(
      !source.includes('/* createRequire */ undefined'),
      `dist/extension.js must not contain \`/* createRequire */ undefined\` — ` +
        `this indicates the import { createRequire } from "node:module" in jiti.mjs ` +
        `was dropped by webpack and the string-replace-loader patch is missing (issue #395).`,
    );
  });
});
