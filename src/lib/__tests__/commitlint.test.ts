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
const repoRootPath = path.resolve(__dirname, '..', '..', '..');

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

test('should load @commitlint/config-conventional from the repo root config', async function () {
  await commitlint.loadRuleConfigs(repoRootPath);
  expect(commitlint.getTypeEnum()).toStrictEqual([
    'build',
    'chore',
    'ci',
    'docs',
    'feat',
    'fix',
    'perf',
    'refactor',
    'revert',
    'style',
    'test',
  ]);
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

// Regression test for issue #395: jiti.cjs passes createRequire from node:module
// to _createJiti; webpack must not bundle node:module as a stub (TypeError: i.createRequire
// is not a function). Vitest runs un-bundled source, exercising the real jiti.cjs →
// node:module → createRequire chain directly.
test('should load TypeScript config (regression for issue #395 / jiti.cjs createRequire)', async function () {
  await commitlint.loadRuleConfigs(
    path.join(fixtureRootPath, 'should-load-ts-config'),
  );
  expect(commitlint.getTypeEnum()).toStrictEqual(['ts-type']);
});
