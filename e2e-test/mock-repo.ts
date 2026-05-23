/**
 * Mock-repo helpers for the e2e harness.
 *
 * Provisions a throwaway git repository under `os.tmpdir()` so the VS Code
 * test-electron host can open it as a workspace and the conventional-commits
 * command can land a real commit on `HEAD`. Cleaned up by `cleanupMockRepo`
 * in the launcher's `finally` block.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface MockRepo {
  repoPath: string;
  trackedFile: string;
}

function git(repoPath: string, args: string[]): void {
  execFileSync('git', args, {
    cwd: repoPath,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

export function createMockRepo(): MockRepo {
  const repoPath = fs.mkdtempSync(
    // Keep spaces in the workspace path so the extension-host e2e suite
    // exercises the same file://-URL encoding path that triggered issue #401
    // on Windows when commitlint tried to load extended configs.
    path.join(os.tmpdir(), 'vscode conventional commits e2e '),
  );
  const trackedFile = path.join(repoPath, 'README.md');
  // When compiled, `__dirname` is `e2e-test/out`, so repo root is two levels up.
  const workspaceNodeModulesPath = path.resolve(
    __dirname,
    '..',
    '..',
    'node_modules',
  );

  git(repoPath, ['init', '-b', 'main']);
  git(repoPath, ['config', 'user.name', 'E2E Test']);
  git(repoPath, ['config', 'user.email', 'e2e@example.com']);
  // Keep commit signing off in the mock repo even if the developer has
  // `commit.gpgsign=true` globally — the test runs unattended.
  git(repoPath, ['config', 'commit.gpgsign', 'false']);

  fs.writeFileSync(trackedFile, '# E2E mock repo\n', 'utf8');

  // Mirror a real user workspace that has its own node_modules available for
  // commitlint to resolve shareable configs from (for example
  // @commitlint/config-conventional in issue #401). Symlink instead of copy so
  // the mock repo stays cheap to create.
  fs.symlinkSync(workspaceNodeModulesPath, path.join(repoPath, 'node_modules'));

  git(repoPath, ['add', 'README.md']);
  git(repoPath, ['commit', '-m', 'chore: initial']);

  return { repoPath, trackedFile };
}

export function cleanupMockRepo(repoPath: string): void {
  if (!repoPath) {
    return;
  }
  fs.rmSync(repoPath, { recursive: true, force: true });
}
