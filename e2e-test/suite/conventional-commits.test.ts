/**
 * End-to-end test for the `extension.scopedCommits` command.
 *
 * Runs inside the VS Code extension host launched by `@vscode/test-electron`.
 * Drives the prompt machine with stubbed answers, executes the command
 * against the mock git repository provisioned by the launcher, and asserts
 * that:
 *   1. the extension activated,
 *   2. the command is registered with VS Code,
 *   3. `repository.inputBox.value` was set to the expected serialized
 *      scoped-commits message at the time the prompt machine resolved,
 *   4. `git log -1 --pretty=%B` on the mock repo shows a real new commit
 *      whose message matches the scoped-commits format (scope: description).
 */

import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { installPromptStubs, PromptStubs } from './stub-prompts';

// --- VS Code Git API surface we touch (typed loosely) ----------------------
interface GitInputBox {
  value: string;
}

interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly inputBox: GitInputBox;
  add(paths: string[]): Promise<void>;
}

interface GitAPI {
  readonly repositories: GitRepository[];
}

interface VscodeGitExports {
  getAPI(version: 1): GitAPI;
}

const EXTENSION_ID = 'scoped-commits.vscode-scoped-commits';
const COMMAND_ID = 'extension.scopedCommits';

/** Sleep helper for polling. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until `predicate()` returns a truthy value or `timeoutMs` elapses.
 */
async function waitFor<T>(
  predicate: () => T | undefined | Promise<T | undefined>,
  {
    timeoutMs,
    intervalMs = 200,
    description,
  }: { timeoutMs: number; intervalMs?: number; description: string },
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) {
        return value as T;
      }
    } catch (err) {
      lastErr = err;
    }
    await delay(intervalMs);
  }
  const detail = lastErr instanceof Error ? `: ${lastErr.message}` : '';
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${description}${detail}`,
  );
}

suite('extension.scopedCommits e2e', () => {
  let repoPath: string;
  let repository: GitRepository;
  let gitApi: GitAPI;
  let stubs: PromptStubs | undefined;
  const extensionOutputLines: string[] = [];
  const extensionErrorMessages: string[] = [];
  let capturedInputBoxValue: string | undefined;

  suiteSetup(async function () {
    this.timeout(60000);

    const originalCreateOutputChannel = vscode.window.createOutputChannel;
    (
      vscode.window as unknown as {
        createOutputChannel: typeof vscode.window.createOutputChannel;
      }
    ).createOutputChannel = function (
      name: string,
      ...rest: unknown[]
    ): vscode.OutputChannel {
      const channel = (originalCreateOutputChannel as Function).call(
        vscode.window,
        name,
        ...rest,
      ) as vscode.OutputChannel;
      const originalAppendLine = channel.appendLine.bind(channel);
      channel.appendLine = (line: string) => {
        console.log(`[ext-output:${name}] ${line}`);
        extensionOutputLines.push(`[${name}] ${line}`);
        originalAppendLine(line);
      };
      return channel;
    };

    const originalShowErrorMessage = vscode.window.showErrorMessage;
    (
      vscode.window as unknown as {
        showErrorMessage: typeof vscode.window.showErrorMessage;
      }
    ).showErrorMessage = function (
      message: string,
      ...rest: unknown[]
    ): Thenable<string | undefined> {
      console.log(`[ext-error] ${message}`);
      extensionErrorMessages.push(message);
      return (originalShowErrorMessage as Function).call(
        vscode.window,
        message,
        ...rest,
      );
    };

    repoPath = process.env.MOCK_REPO_PATH || '';
    assert.ok(
      repoPath,
      'MOCK_REPO_PATH env var must be set by the e2e launcher',
    );

    const gitExtension =
      vscode.extensions.getExtension<VscodeGitExports>('vscode.git');
    assert.ok(gitExtension, 'vscode.git extension must be available');
    if (!gitExtension.isActive) {
      await gitExtension.activate();
    }

    gitApi = gitExtension.exports.getAPI(1);

    repository = await waitFor<GitRepository>(
      () =>
        gitApi.repositories.find((repo) => repo.rootUri.fsPath === repoPath),
      {
        timeoutMs: 30000,
        description: `git.repositories to contain ${repoPath}`,
      },
    );

    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} must be present`);
    if (!ext.isActive) {
      await ext.activate();
    }
  });

  teardown(() => {
    if (stubs) {
      stubs.dispose();
      stubs = undefined;
    }
    extensionOutputLines.length = 0;
    extensionErrorMessages.length = 0;
  });

  test('runs the full scoped-commit flow', async function () {
    this.timeout(60000);

    // (i) Extension activated.
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} must be present`);
    assert.strictEqual(ext.isActive, true, 'extension should be active');

    // (ii) Command registered.
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes(COMMAND_ID),
      `command ${COMMAND_ID} should be registered`,
    );

    const findOwner = (obj: object | null, prop: string): object | null => {
      let cur: object | null = obj;
      while (cur) {
        if (Object.prototype.hasOwnProperty.call(cur, prop)) return cur;
        cur = Object.getPrototypeOf(cur);
      }
      return null;
    };
    const repoProto = findOwner(repository, 'inputBox') ?? repository;
    const originalInputBoxDescriptor = Object.getOwnPropertyDescriptor(
      repoProto,
      'inputBox',
    );
    const wrapInputBox = (box: GitInputBox): GitInputBox =>
      new Proxy(box, {
        set(target, prop, value, receiver) {
          if (prop === 'value' && typeof value === 'string' && value !== '') {
            capturedInputBoxValue = value;
          }
          return Reflect.set(target, prop, value, receiver);
        },
      });
    if (originalInputBoxDescriptor && originalInputBoxDescriptor.get) {
      const origGet = originalInputBoxDescriptor.get;
      Object.defineProperty(repoProto, 'inputBox', {
        configurable: true,
        enumerable: originalInputBoxDescriptor.enumerable,
        get() {
          return wrapInputBox(origGet.call(this) as GitInputBox);
        },
      });
    } else {
      const inputBoxRef = repository.inputBox as GitInputBox;
      const valueOwner = findOwner(inputBoxRef, 'value') ?? inputBoxRef;
      const valueDescriptor = Object.getOwnPropertyDescriptor(
        valueOwner,
        'value',
      );
      if (valueDescriptor && valueDescriptor.set) {
        const origSet = valueDescriptor.set;
        const origGet = valueDescriptor.get;
        Object.defineProperty(valueOwner, 'value', {
          configurable: true,
          enumerable: valueDescriptor.enumerable,
          get() {
            return origGet ? origGet.call(this) : undefined;
          },
          set(next: string) {
            if (typeof next === 'string' && next !== '') {
              capturedInputBoxValue = next;
            }
            origSet.call(this, next);
          },
        });
      } else {
        let backingValue = inputBoxRef.value;
        Object.defineProperty(inputBoxRef, 'value', {
          configurable: true,
          enumerable: true,
          get() {
            return backingValue;
          },
          set(next: string) {
            backingValue = next;
            if (typeof next === 'string' && next !== '') {
              capturedInputBoxValue = next;
            }
          },
        });
      }
    }
    const originalDescriptor = originalInputBoxDescriptor;

    try {
      // Default config: gitmoji off, promptBody on, promptFooter on,
      // showEditor off, autoCommit on.
      // Prompt order: scope (CONFIGURABLE_QUICK_PICK) → subject → body → footer
      //   1. scope    QuickPick/ConfigurableQuickPick → 'auth' (new scope once)
      //   2. subject  InputBox                       → 'add e2e harness'
      //   3. body     InputBox                       → ''
      //   4. footer   InputBox                       → ''
      stubs = installPromptStubs(['auth', 'add e2e harness', '', '']);

      const trackedFileUri = vscode.Uri.file(path.join(repoPath, 'README.md'));
      const newContents = Buffer.from(
        '# E2E mock repo\n\ne2e edit ' + Date.now() + '\n',
        'utf8',
      );
      await vscode.workspace.fs.writeFile(trackedFileUri, newContents);
      await repository.add([trackedFileUri.fsPath]);

      await vscode.commands.executeCommand(COMMAND_ID, repository.rootUri);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(repoProto, 'inputBox', originalDescriptor);
      }
    }

    console.log(
      '[e2e diagnostic] prompt captures:',
      JSON.stringify(stubs.captures, null, 2),
    );
    console.log(
      '[e2e diagnostic] capturedInputBoxValue:',
      JSON.stringify(capturedInputBoxValue),
    );

    // (iii) inputBox.value matched the expected scoped-commits message.
    const expectedMessage = 'auth: add e2e harness';
    assert.strictEqual(
      capturedInputBoxValue,
      expectedMessage,
      `repository.inputBox.value should have been set to ${JSON.stringify(
        expectedMessage,
      )} during the run`,
    );

    // (iv) A new commit landed on HEAD.
    const headMessage = execFileSync('git', ['log', '-1', '--pretty=%B'], {
      cwd: repoPath,
    })
      .toString()
      .trim();

    assert.match(
      headMessage,
      /^auth: add e2e harness/,
      `HEAD commit message should match the scoped-commits header — got ${JSON.stringify(
        headMessage,
      )}`,
    );

    assert.strictEqual(
      stubs.remaining(),
      0,
      `all scripted prompt answers should have been consumed; remaining=${stubs.remaining()}`,
    );
  });

  // Regression test: cosmiconfig v9 lazy-requires parse-json to load JSON
  // commitlint configs. Verify that a scope-enum defined in a JSON commitlintrc
  // is visible to the prompt machine.
  test('loads scope-enum from a JSON commitlintrc', async function () {
    this.timeout(60000);

    const commitlintrcPath = path.join(repoPath, '.commitlintrc.json');
    const jsonConfig = JSON.stringify({
      rules: {
        'scope-enum': [2, 'always', ['json-scope']],
      },
    });
    fs.writeFileSync(commitlintrcPath, jsonConfig, 'utf8');

    let localCapturedValue: string | undefined;

    try {
      // Prompt order with scope-enum defined: scope (QUICK_PICK showing
      // 'json-scope') → subject → body → footer
      //   1. scope    QuickPick → 'json-scope'
      //   2. subject  InputBox  → 'json commitlintrc loaded'
      //   3. body     InputBox  → ''
      //   4. footer   InputBox  → ''
      stubs = installPromptStubs([
        'json-scope',
        'json commitlintrc loaded',
        '',
        '',
      ]);

      const trackedFileUri = vscode.Uri.file(path.join(repoPath, 'README.md'));
      const newContents = Buffer.from(
        '# E2E mock repo\n\njson-config edit ' + Date.now() + '\n',
        'utf8',
      );
      await vscode.workspace.fs.writeFile(trackedFileUri, newContents);
      await repository.add([trackedFileUri.fsPath]);

      const inputBoxRef = repository.inputBox as { value: string };
      const valueOwner: object = ((): object => {
        let cur: object | null = inputBoxRef;
        while (cur) {
          if (Object.prototype.hasOwnProperty.call(cur, 'value')) return cur;
          cur = Object.getPrototypeOf(cur);
        }
        return inputBoxRef;
      })();
      const origDescriptor = Object.getOwnPropertyDescriptor(
        valueOwner,
        'value',
      );
      if (origDescriptor) {
        const origSet = origDescriptor.set;
        const origGet = origDescriptor.get;
        Object.defineProperty(valueOwner, 'value', {
          configurable: true,
          enumerable: origDescriptor.enumerable,
          get() {
            return origGet ? origGet.call(this) : undefined;
          },
          set(next: string) {
            if (typeof next === 'string' && next !== '') {
              localCapturedValue = next;
            }
            if (origSet) origSet.call(this, next);
          },
        });
      }

      await vscode.commands.executeCommand(COMMAND_ID, repository.rootUri);
    } finally {
      fs.unlinkSync(commitlintrcPath);
    }

    console.log(
      '[e2e diagnostic] json-config capturedInputBoxValue:',
      JSON.stringify(localCapturedValue),
    );

    const expectedMessage = 'json-scope: json commitlintrc loaded';
    assert.strictEqual(
      localCapturedValue,
      expectedMessage,
      `repository.inputBox.value should be ${JSON.stringify(expectedMessage)} ` +
        `— if it does not match, parse-json was not bundled or scope-enum was not parsed`,
    );
  });

  // Regression test for issue #401: when the workspace path contains spaces,
  // commitlint resolves `extends` to an absolute path and converts it to a
  // file:// URL before dynamic import.
  test('loads @commitlint/config-conventional from extends in a repo path with spaces (issue #401 regression)', async function () {
    this.timeout(60000);

    assert.match(
      repoPath,
      /\s/,
      `mock repo path must contain spaces to reproduce issue #401; got ${JSON.stringify(repoPath)}`,
    );

    const commitlintrcPath = path.join(repoPath, '.commitlintrc.json');
    const jsonConfig = JSON.stringify({
      extends: ['@commitlint/config-conventional'],
    });
    fs.writeFileSync(commitlintrcPath, jsonConfig, 'utf8');

    let localCapturedValue: string | undefined;

    try {
      // Prompt order: scope → subject → body → footer
      stubs = installPromptStubs(['auth', 'issue 401 reproduction', '', '']);

      const trackedFileUri = vscode.Uri.file(path.join(repoPath, 'README.md'));
      const newContents = Buffer.from(
        '# E2E mock repo\n\nissue-401 edit ' + Date.now() + '\n',
        'utf8',
      );
      await vscode.workspace.fs.writeFile(trackedFileUri, newContents);
      await repository.add([trackedFileUri.fsPath]);

      const inputBoxRef = repository.inputBox as { value: string };
      const valueOwner: object = ((): object => {
        let cur: object | null = inputBoxRef;
        while (cur) {
          if (Object.prototype.hasOwnProperty.call(cur, 'value')) return cur;
          cur = Object.getPrototypeOf(cur);
        }
        return inputBoxRef;
      })();
      const origDescriptor = Object.getOwnPropertyDescriptor(
        valueOwner,
        'value',
      );
      if (origDescriptor) {
        const origSet = origDescriptor.set;
        const origGet = origDescriptor.get;
        Object.defineProperty(valueOwner, 'value', {
          configurable: true,
          enumerable: origDescriptor.enumerable,
          get() {
            return origGet ? origGet.call(this) : undefined;
          },
          set(next: string) {
            if (typeof next === 'string' && next !== '') {
              localCapturedValue = next;
            }
            if (origSet) origSet.call(this, next);
          },
        });
      }

      await vscode.commands.executeCommand(COMMAND_ID, repository.rootUri);
    } finally {
      fs.unlinkSync(commitlintrcPath);
    }

    console.log(
      '[e2e diagnostic] issue-401 capturedInputBoxValue:',
      JSON.stringify(localCapturedValue),
    );

    const outputText = extensionOutputLines.join('\n');
    const expectedMessage = 'auth: issue 401 reproduction';
    assert.strictEqual(
      localCapturedValue,
      expectedMessage,
      `repository.inputBox.value should be ${JSON.stringify(expectedMessage)} ` +
        `after loading @commitlint/config-conventional from extends`,
    );

    assert.ok(
      outputText.includes('Load commitlint configuration successfully.'),
      `extension output must confirm commitlint config loading; got ${JSON.stringify(
        extensionOutputLines,
      )}`,
    );

    assert.ok(
      outputText.includes('"subject-full-stop"') &&
        outputText.includes('"header-max-length"'),
      `extension output must include rules from @commitlint/config-conventional; got ${JSON.stringify(
        extensionOutputLines,
      )}`,
    );

    const cannotFindFileUrl = extensionOutputLines.find(
      (line) =>
        line.includes("Cannot find module 'file:///") &&
        line.includes('@commitlint/config-conventional/lib/index.js'),
    );
    assert.strictEqual(
      cannotFindFileUrl,
      undefined,
      `extension output must not contain the old file:// module-resolution failure from issue #401; got ${JSON.stringify(
        cannotFindFileUrl,
      )}`,
    );

    assert.ok(
      extensionErrorMessages.every(
        (message) => !message.includes('@commitlint/config-conventional'),
      ),
      `extension UI errors must not mention @commitlint/config-conventional; got ${JSON.stringify(
        extensionErrorMessages,
      )}`,
    );
  });

  // Regression test for issue #395: cosmiconfig-typescript-loader / jiti.
  test('loads scope-enum from a TypeScript commitlintrc (issue #395 regression)', async function () {
    this.timeout(60000);

    const commitlintrcPath = path.join(repoPath, '.commitlintrc.ts');
    fs.writeFileSync(
      commitlintrcPath,
      `export default { rules: { 'scope-enum': [2, 'always', ['ts-scope']] } };\n`,
      'utf8',
    );

    let localCapturedValue: string | undefined;

    try {
      // Prompt order with scope-enum: scope (QUICK_PICK) → subject → body → footer
      stubs = installPromptStubs([
        'ts-scope',
        'ts commitlintrc loaded',
        '',
        '',
      ]);

      const trackedFileUri = vscode.Uri.file(path.join(repoPath, 'README.md'));
      const newContents = Buffer.from(
        '# E2E mock repo\n\nts-config edit ' + Date.now() + '\n',
        'utf8',
      );
      await vscode.workspace.fs.writeFile(trackedFileUri, newContents);
      await repository.add([trackedFileUri.fsPath]);

      const inputBoxRef = repository.inputBox as { value: string };
      const valueOwner: object = ((): object => {
        let cur: object | null = inputBoxRef;
        while (cur) {
          if (Object.prototype.hasOwnProperty.call(cur, 'value')) return cur;
          cur = Object.getPrototypeOf(cur);
        }
        return inputBoxRef;
      })();
      const origDescriptor = Object.getOwnPropertyDescriptor(
        valueOwner,
        'value',
      );
      if (origDescriptor) {
        const origSet = origDescriptor.set;
        const origGet = origDescriptor.get;
        Object.defineProperty(valueOwner, 'value', {
          configurable: true,
          enumerable: origDescriptor.enumerable,
          get() {
            return origGet ? origGet.call(this) : undefined;
          },
          set(next: string) {
            if (typeof next === 'string' && next !== '') {
              localCapturedValue = next;
            }
            if (origSet) origSet.call(this, next);
          },
        });
      }

      await vscode.commands.executeCommand(COMMAND_ID, repository.rootUri);
    } finally {
      fs.unlinkSync(commitlintrcPath);
    }

    console.log(
      '[e2e diagnostic] ts-config capturedInputBoxValue:',
      JSON.stringify(localCapturedValue),
    );

    const expectedMessage = 'ts-scope: ts commitlintrc loaded';
    assert.strictEqual(
      localCapturedValue,
      expectedMessage,
      `repository.inputBox.value should be ${JSON.stringify(expectedMessage)} ` +
        `— if undefined, jiti.cjs threw createRequire is not a function (issue #395)`,
    );
  });
});
