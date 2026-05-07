import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

import { createMockRepo, cleanupMockRepo } from './mock-repo';

async function main(): Promise<void> {
  // Repo root = two levels up from this compiled file (e2e-test/out/runTest.js).
  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
  // Mocha entrypoint VS Code's test-electron loads inside the host.
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');

  const mock = createMockRepo();
  // Fresh, isolated VS Code user-data dir so the host has none of the
  // developer's profile state (settings, recent quick-pick history,
  // workspace trust decisions) bleeding into the stubbed prompt flow.
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'vscode-conventional-commits-e2e-userdata-'),
  );

  try {
    const exitCode = await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        mock.repoPath,
        '--disable-extensions',
        '--disable-workspace-trust',
        `--user-data-dir=${userDataDir}`,
      ],
      extensionTestsEnv: {
        MOCK_REPO_PATH: mock.repoPath,
      },
    });

    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } catch (err) {
    console.error('Failed to run e2e tests:', err);
    process.exitCode = 1;
  } finally {
    cleanupMockRepo(mock.repoPath);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main();
