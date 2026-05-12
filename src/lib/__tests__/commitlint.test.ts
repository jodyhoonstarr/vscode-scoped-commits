/**
 * @since 2024-06-25 18:53
 * @author vivaxy
 */
import { expect, test, vi } from 'vitest';
import * as path from 'path';
import commitlint from '../commitlint';

vi.mock('../output', function () {
  return {
    info: vi.fn(),
    error: console.error,
    warning: console.warn,
  };
});

const fixtureRootPath = path.join(__dirname, 'fixtures');

test('should load commitlint@v17.8.1', async function () {
  await commitlint.loadRuleConfigs(
    path.join(fixtureRootPath, 'should-load-commitlint@v17.8.1'),
  );
  expect(commitlint.getTypeEnum()).toStrictEqual(['foo']);
});

test('should load commitlint@v19.3.1', async function () {
  await commitlint.loadRuleConfigs(
    path.join(fixtureRootPath, 'should-load-commitlint@v19.2.2'),
  );
  expect(commitlint.getTypeEnum()).toStrictEqual(['bar']);
});

// Regression tests for issue #391: cosmiconfig v9 lazy-requires parse-json and
// js-yaml. These must be bundled by webpack, not redirected to __non_webpack_require__.
test('should load JSON config (exercises cosmiconfig parse-json)', async function () {
  await commitlint.loadRuleConfigs(
    path.join(fixtureRootPath, 'should-load-json-config'),
  );
  expect(commitlint.getTypeEnum()).toStrictEqual(['json-type']);
});

test('should load YAML config (exercises cosmiconfig js-yaml)', async function () {
  await commitlint.loadRuleConfigs(
    path.join(fixtureRootPath, 'should-load-yaml-config'),
  );
  expect(commitlint.getTypeEnum()).toStrictEqual(['yaml-type']);
});
