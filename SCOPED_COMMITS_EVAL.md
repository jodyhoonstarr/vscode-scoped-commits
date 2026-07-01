# Evaluation: Converting vscode-conventional-commits → Scoped Commits Extension

## Format Comparison

|                 | Conventional Commits          | Scoped Commits                 |
| --------------- | ----------------------------- | ------------------------------ |
| Format          | `type(scope): description`    | `scope: description`           |
| Primary field   | `type` (feat, fix, docs…)     | `scope` (auth, i2c, net/http…) |
| Secondary field | `scope` (optional)            | —                              |
| Mandatory?      | type required, scope optional | scope required                 |

The transformation is philosophically straightforward: **scope becomes the first
field and the only required prefix; type disappears from the output entirely.**

---

## Files That Need Changes

### 1. `src/lib/commit-message.ts` — **Core, highest impact**

`serializeHeader()` currently builds `type(scope): subject`. For scoped commits
it must build `scope: description`.

**Current:**

```typescript
result += partialCommitMessage.type; // "feat"
if (scope) {
  result += `(${scope})`;
} // "(auth)"
result += ': '; // ": "
result += serializeSubject(partialCommitMessage); // "add login"
// → "feat(auth): add login"
```

**New:**

```typescript
result += partialCommitMessage.scope; // "auth"
result += ': '; // ": "
result += partialCommitMessage.subject; // "add login"
// → "auth: add login"
```

The `type` field on `CommitMessage` can be removed entirely, or retained as an
optional/internal field not written to the header (useful if you want to keep
commitlint type-validation compatibility as a linter-only concern). The
`serializeSubject` helper stays intact for gitmoji support if you keep that
feature.

---

### 2. `src/lib/prompts.ts` — **High impact, most user-visible**

The `questions` array currently runs: **type → scope → gitmoji → subject → body
→ footer**.

**Changes needed:**

**a) Reorder to: scope → subject → body → footer** (remove type entirely as a
prompted field):

```typescript
const questions: Prompt[] = [
  getScopePrompt(),    // ← now first, required
  { name: 'subject', ... },
  { name: 'body', ... },
  { name: 'footer', ... },
];
```

**b) Make scope required** — the `noneItem` ("None") in `getScopePrompt()` gives
users an escape hatch. For scoped commits, this should be removed or at minimum
renamed to something that discourages skipping:

```typescript
// Remove noneItem from getScopePrompt(), or change it to a fallback
// like "treewide" / "global" per the scopedcommits.com FAQ
```

**c) Remove the type prompt** — the entire `getTypeItems()` function and the
type `QuickPick` question can be deleted.

**d) Remove `promptScopes` filter condition** — scope is no longer optional at
the config level; this guard disappears:

```typescript
// DELETE this:
if (question.name === 'scope' && !promptScopes) return false;
```

**e) Update `getScopePrompt()` placeholder/description strings** to reflect that
scope is the primary, required field.

---

### 3. `src/lib/configuration.ts` — **Medium impact**

Remove `type`-adjacent config keys from the `Configuration` type. Change
defaults:

```typescript
export type Configuration = {
  autoCommit: boolean;
  silentAutoCommit: boolean;
  gitmoji: boolean; // keep if you want optional gitmoji support
  emojiFormat: EMOJI_FORMAT;
  showEditor: boolean;
  scopes: string[];
  tags: string[];
  lineBreak: string;
  // promptScopes: boolean ← REMOVE (scope is always prompted)
  promptBody: boolean;
  promptFooter: boolean;
  promptCI: boolean;
  promptTag: boolean;
  showNewVersionNotes: boolean;
  'editor.keepAfterSave': boolean;
  storeScopesGlobally: boolean;
  storeTagsGlobally: boolean;
};
```

---

### 4. `package.json` — **Medium impact, required for publishing**

**a) Identity fields:**

```json
{
  "name": "vscode-scoped-commits",
  "displayName": "Scoped Commits",
  "description": "Scope-first commit messages for VSCode"
}
```

**b) Configuration `properties`** — remove or reclassify:

- Remove `conventionalCommits.promptScopes` (always true)
- Change default for `conventionalCommits.gitmoji` to `false`
- Remove any type-specific documentation text

**c) Configuration prefix** — the prefix `conventionalCommits` appears in every
settings key (e.g., `conventionalCommits.scopes`). This should change to
`scopedCommits`. That affects:

- All `package.json` property keys
- `src/configs/keys.ts` (`PREFIX` constant)
- Every `configuration.get<T>('...')` call (those use the constant, so just
  updating `keys.ts` propagates everywhere)

**d) Command IDs** — rename to avoid collisions with the upstream extension if
both are installed:

```json
"extension.scopedCommits"
"extension.scopedCommits.resetGlobalState"
"extension.scopedCommits.showNewVersionNotes"
```

---

### 5. `src/configs/keys.ts` — **Small, but propagates everywhere**

```typescript
export const PREFIX = 'scopedCommits'; // was 'conventionalCommits'
export const ID = 'your-publisher.vscode-scoped-commits';
```

Because all configuration reads go through `configuration.get(key)` which uses
`PREFIX`, this single change renames all settings keys.

---

### 6. `src/extension.ts` — **Small**

Update the three registered command IDs to match the new names from
`package.json`:

```typescript
vscode.commands.registerCommand('extension.scopedCommits', ...)
vscode.commands.registerCommand('extension.scopedCommits.resetGlobalState', ...)
vscode.commands.registerCommand('extension.scopedCommits.showNewVersionNotes', ...)
```

---

### 7. `package.nls.json` (and `*.zh-cn.json`, `*.tr.json`) — **Medium**

String keys to update:

| Key                                              | Change                                         |
| ------------------------------------------------ | ---------------------------------------------- |
| `extension.name`                                 | `"Scoped Commits"`                             |
| `extension.sources.prompt.type.placeholder`      | Remove or repurpose                            |
| `extension.sources.prompt.scope.placeholder`     | `"Enter the scope of this change (required)."` |
| `extension.sources.prompt.scope.noneItem.label`  | Remove or change to `"treewide"`               |
| `extension.sources.prompt.scope.noneItem.detail` | Update accordingly                             |
| `extension.sources.prompt.subject.placeholder`   | Keep (describes the change)                    |
| `extension.configuration.promptScopes.*`         | Remove                                         |

---

### 8. `src/lib/commitlint.ts` — **Low impact**

Commitlint integration currently validates `type-*` rules. For scoped commits:

- `lintType()` and `getTypeEnum()` become unused → can be deleted
- `lintScope()` and `getScopeEnum()` become the primary validators → keep and
  possibly strengthen (e.g., always enforce `scope-empty: [error, never]` to
  require a scope)
- The `lintHeader()` call in the subject validation in `prompts.ts` will need
  updating since it parses `type(scope): subject` format via commitlint's
  conventional-commits parser. If you drop commitlint integration for `header-*`
  rules you can simplify; otherwise you'd need a custom parser that understands
  `scope: subject`

---

### 9. Tests — `src/lib/__tests__/commit-message.test.ts`

All test assertions use `feat(scope): ...` format. Every test that touches
`serializeHeader` or `serialize` needs to be rewritten for `scope: description`
format. The `CommitMessage` whitespace-trimming tests for `type` can be removed.

---

## Optional/Nice-to-Have Changes

### Keep `type` as an optional trailer (not in the header)

If you want to offer type information without making it a required prefix, you
could repurpose it as an optional footer trailer:

```
auth: add login button

type: feat
```

This is non-standard but keeps the data if users want it. More practically: just
drop it.

### Ticket number support (per scopedcommits.com FAQ)

The FAQ suggests including ticket numbers as `scope (PROJ-123): description`.
This could be a dedicated prompt step or handled by allowing the scope field to
include parenthetical suffixes. The current `CONFIGURABLE_QUICK_PICK` +
free-text input already supports this with no code change — users just type
`auth (PROJ-123)` as their scope.

### `"treewide"` / `"all"` as built-in scope suggestions

Instead of a "None" escape hatch, pre-populate the scope list with common
catch-all scopes:

```typescript
const fallbackScopes = ['treewide', 'all', 'global'];
```

---

## Summary of Files to Touch

| File                                       | Change Type                                      | Effort |
| ------------------------------------------ | ------------------------------------------------ | ------ |
| `src/lib/commit-message.ts`                | Rewrite `serializeHeader()`                      | Small  |
| `src/lib/prompts.ts`                       | Remove type prompt, reorder, make scope required | Medium |
| `src/lib/configuration.ts`                 | Remove `promptScopes` from type                  | Small  |
| `src/configs/keys.ts`                      | Rename `PREFIX` and `ID`                         | Tiny   |
| `src/extension.ts`                         | Rename command IDs                               | Tiny   |
| `src/lib/conventional-commits.ts`          | Remove `promptScopes` arg, rename                | Small  |
| `src/lib/commitlint.ts`                    | Remove type linting; scope linting stays         | Small  |
| `package.json`                             | Rename, update config defaults, command IDs      | Medium |
| `package.nls.json` (×3 locales)            | Update display strings                           | Small  |
| `src/lib/__tests__/commit-message.test.ts` | Rewrite header/serialize tests                   | Small  |

Total estimated effort for a working fork: **a few hours of focused editing**,
mostly concentrated in `prompts.ts`, `commit-message.ts`, and `package.json`.
