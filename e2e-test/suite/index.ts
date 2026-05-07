import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

/**
 * Mocha entrypoint that VS Code's `@vscode/test-electron` loads inside the
 * extension host (via `extensionTestsPath`). The host calls `run()` and waits
 * on the returned promise. We resolve when the suite finishes (failures > 0
 * surfaces as a rejection so the launcher exits non-zero).
 */
export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 60000,
  });

  // `__dirname` here is the compiled `out-e2e/suite/` directory, so we glob
  // for sibling compiled `*.test.js` files (not `*.test.ts`).
  const testsRoot = __dirname;
  const files = await glob('**/*.test.js', { cwd: testsRoot });

  for (const file of files) {
    mocha.addFile(path.resolve(testsRoot, file));
  }

  await new Promise<void>((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} test(s) failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
