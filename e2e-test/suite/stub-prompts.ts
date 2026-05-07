import * as vscode from 'vscode';

/**
 * Scripted answer for a single prompt step.
 *
 * - For a `QuickPick` step: the value is matched against `item.label`. The
 *   empty string is treated as "select the noneItem if present, otherwise
 *   fall through to `items[0]`" — which mirrors how a user would skip an
 *   optional step (e.g. `scope`, `gitmoji`) by picking the "none" option.
 * - For an `InputBox` step: the value becomes `input.value` before
 *   `onDidAccept` fires.
 */
export type PromptAnswer = string;

/**
 * Captured state from a single prompt step. Exposed primarily so the e2e
 * test can assert ordering / bookkeeping if needed; the main assertion in
 * iteration 1 is on `repository.inputBox.value`, which is set by the prompt
 * machine after all steps resolve.
 */
export type PromptCapture = {
  kind: 'quickPick' | 'inputBox';
  /** `picker.value` (free-text portion) or `input.value` at accept time. */
  value: string;
  /** Labels of `activeItems` at accept time (always `[]` for input boxes). */
  activeLabels: string[];
  /** Mocha step number reported by the prompt machine, for debugging. */
  step?: number;
};

export type PromptStubs = {
  dispose(): void;
  /** Captures populated as each scripted prompt resolves. */
  captures: PromptCapture[];
  /** Number of scripted answers still queued (useful in assertions). */
  remaining(): number;
};

type AnyDisposable = { dispose(): void };

/**
 * Build a fake `vscode.window`-style `Event<T>` listener registry. The real
 * VS Code API exposes events as functions you call with a listener; we
 * mirror that shape and store the listeners in an array so `show()` can
 * fire them synchronously after the next microtask.
 */
function createEvent<T>(): {
  event: vscode.Event<T>;
  fire(payload: T): void;
} {
  const listeners: Array<(payload: T) => unknown> = [];
  const event: vscode.Event<T> = (
    listener,
    thisArgs?: unknown,
    disposables?: AnyDisposable[],
  ): AnyDisposable => {
    const bound = thisArgs
      ? (payload: T) => listener.call(thisArgs, payload)
      : listener;
    listeners.push(bound);
    const subscription: AnyDisposable = {
      dispose() {
        const i = listeners.indexOf(bound);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    if (disposables) disposables.push(subscription);
    return subscription;
  };
  return {
    event,
    fire(payload: T) {
      // Snapshot listeners so a listener that disposes itself does not
      // mutate the array we are iterating.
      for (const l of listeners.slice()) l(payload);
    },
  };
}

/**
 * Resolve which item the scripted answer points at. Mirrors the user's
 * behaviour at the QuickPick UI:
 *   - exact `label` match wins,
 *   - `''` falls back to the first item that looks like a "none" option
 *     (label `'None'`, or any item with `alwaysShow` and an empty
 *     `description`), and finally to `items[0]`.
 */
function resolveActiveItem<T extends vscode.QuickPickItem>(
  items: readonly T[],
  answer: string,
): T | undefined {
  if (items.length === 0) return undefined;
  if (answer !== '') {
    const exact = items.find((it) => it.label === answer);
    if (exact) return exact;
  }
  // Empty answer → prefer a none-style item if present.
  const noneLike = items.find(
    (it) =>
      it.label === 'None' ||
      it.label === 'no' ||
      it.label === 'No' ||
      it.label.toLowerCase() === 'none',
  );
  if (noneLike) return noneLike;
  return items[0];
}

/**
 * Install non-interactive replacements for `vscode.window.createQuickPick`
 * and `vscode.window.createInputBox`. Each call to either factory consumes
 * one entry from `answers` (in queue order). Returns a disposer that
 * restores the originals.
 *
 * The returned `captures` array records the state of each prompt at
 * accept time, in invocation order — this lets a test assert the prompt
 * machine walked the steps it expected.
 */
export function installPromptStubs(answers: PromptAnswer[]): PromptStubs {
  const queue = answers.slice();
  const captures: PromptCapture[] = [];

  const win = vscode.window as unknown as {
    createQuickPick: typeof vscode.window.createQuickPick;
    createInputBox: typeof vscode.window.createInputBox;
  };
  const originalCreateQuickPick = win.createQuickPick;
  const originalCreateInputBox = win.createInputBox;

  function nextAnswer(role: string): string {
    if (queue.length === 0) {
      throw new Error(
        `installPromptStubs: ran out of scripted answers (next requested by ${role}).`,
      );
    }
    return queue.shift() as string;
  }

  function fakeQuickPick<
    T extends vscode.QuickPickItem,
  >(): vscode.QuickPick<T> {
    const acceptEvt = createEvent<void>();
    const buttonEvt = createEvent<vscode.QuickInputButton>();
    const changeValueEvt = createEvent<string>();
    const changeActiveEvt = createEvent<T[]>();
    const changeSelectionEvt = createEvent<T[]>();
    const hideEvt = createEvent<void>();
    let disposed = false;

    const picker: vscode.QuickPick<T> = {
      // ---- options the production code sets ----
      placeholder: undefined,
      matchOnDescription: false,
      matchOnDetail: false,
      ignoreFocusOut: false,
      items: [] as ReadonlyArray<T>,
      activeItems: [] as ReadonlyArray<T>,
      selectedItems: [] as ReadonlyArray<T>,
      value: '',
      step: undefined,
      totalSteps: undefined,
      buttons: [] as ReadonlyArray<vscode.QuickInputButton>,
      title: undefined,
      enabled: true,
      busy: false,
      canSelectMany: false,
      // ---- events ----
      onDidAccept: acceptEvt.event,
      onDidTriggerButton: buttonEvt.event,
      onDidChangeValue: changeValueEvt.event,
      onDidChangeActive: changeActiveEvt.event,
      onDidChangeSelection: changeSelectionEvt.event,
      onDidHide: hideEvt.event,
      // ---- methods ----
      show() {
        // Drive the prompt machine asynchronously so production code has
        // finished wiring `onDidAccept` / `onDidTriggerButton` before we
        // fire. `setImmediate` mirrors VS Code's own UI-thread scheduling
        // closely enough for the tests' purposes.
        setImmediate(() => {
          if (disposed) return;
          const answer = nextAnswer('createQuickPick');
          const items = picker.items as readonly T[];
          const active = resolveActiveItem(items, answer);
          if (active) {
            picker.activeItems = [active] as unknown as readonly T[];
          }
          // The production handler reads `picker.value` for free-text.
          // Most QuickPick steps don't use it, but `CONFIGURABLE_QUICK_PICK`
          // does — leave the default `''` so production behaviour matches
          // a user who selected an item without typing.
          captures.push({
            kind: 'quickPick',
            value: picker.value,
            activeLabels: (picker.activeItems as readonly T[]).map(
              (i) => i.label,
            ),
            step: picker.step,
          });
          acceptEvt.fire();
        });
      },
      hide() {
        hideEvt.fire();
      },
      dispose() {
        disposed = true;
        hideEvt.fire();
      },
    } as vscode.QuickPick<T>;

    return picker;
  }

  function fakeInputBox(): vscode.InputBox {
    const acceptEvt = createEvent<void>();
    const buttonEvt = createEvent<vscode.QuickInputButton>();
    const changeValueEvt = createEvent<string>();
    const hideEvt = createEvent<void>();
    let disposed = false;

    const input: vscode.InputBox = {
      // ---- options ----
      value: '',
      placeholder: undefined,
      password: false,
      prompt: undefined,
      validationMessage: undefined,
      step: undefined,
      totalSteps: undefined,
      buttons: [] as ReadonlyArray<vscode.QuickInputButton>,
      title: undefined,
      enabled: true,
      busy: false,
      ignoreFocusOut: false,
      // ---- events ----
      onDidAccept: acceptEvt.event,
      onDidTriggerButton: buttonEvt.event,
      onDidChangeValue: changeValueEvt.event,
      onDidHide: hideEvt.event,
      // ---- methods ----
      show() {
        setImmediate(() => {
          if (disposed) return;
          const answer = nextAnswer('createInputBox');
          input.value = answer;
          // Production code calls `validate(input.value)` inside
          // `onDidChangeValue`; replay that contract so any validator
          // still sees the new value before accept fires.
          changeValueEvt.fire(input.value);
          captures.push({
            kind: 'inputBox',
            value: input.value,
            activeLabels: [],
            step: input.step,
          });
          acceptEvt.fire();
        });
      },
      hide() {
        hideEvt.fire();
      },
      dispose() {
        disposed = true;
        hideEvt.fire();
      },
    } as vscode.InputBox;

    return input;
  }

  win.createQuickPick = fakeQuickPick as typeof vscode.window.createQuickPick;
  win.createInputBox = fakeInputBox as typeof vscode.window.createInputBox;

  return {
    captures,
    remaining: () => queue.length,
    dispose() {
      win.createQuickPick = originalCreateQuickPick;
      win.createInputBox = originalCreateInputBox;
    },
  };
}
