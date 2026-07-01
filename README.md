# VSCode Scoped Commits

A VS Code extension for writing scope-first commit messages following the
[Scoped Commits](https://scopedcommits.com/) convention.

Forked from
[vivaxy/vscode-conventional-commits](https://github.com/vivaxy/vscode-conventional-commits).

---

## How this differs from the original

The original extension guides you through
[Conventional Commits](https://www.conventionalcommits.org/), where **type** is
the required first field:

```
feat(auth): add login button
fix(api): handle null response
docs: update readme
```

This fork reorients around [Scoped Commits](https://scopedcommits.com/), where
**scope** is the required first field and there is no type prefix:

```
auth: add login button
api: handle null response
docs: update readme
```

The premise, from scopedcommits.com: the _scope_ (what area of the codebase
changed) is the most useful piece of information when scanning a commit log.
Type prefixes like `feat` and `fix` describe intent, but scope tells you
immediately whether a commit is relevant to the area you care about.

### Specific changes from the original

|                 | vscode-conventional-commits   | vscode-scoped-commits                 |
| --------------- | ----------------------------- | ------------------------------------- |
| First prompt    | Type (`feat`, `fix`, `docs`…) | **Scope** (`auth`, `api`, `ui`…)      |
| Scope required? | No — skippable                | **Yes — always prompted**             |
| Output format   | `type(scope): description`    | `scope: description`                  |
| Gitmoji default | On                            | **Off** (still available via setting) |
| Setting prefix  | `conventionalCommits.*`       | `scopedCommits.*`                     |

The scope prompt works the same way as before: pick from a saved list, add a new
one (saved for next time), or type one off without saving. If your project has a
`.commitlintrc` with `scope-enum` defined, those values are loaded automatically
and presented as the only choices.

---

## Usage

Trigger the extension two ways:

1. `Ctrl+Shift+P` → **Scoped Commits**
2. Click the icon in the Source Control panel title bar

### Prompt flow

```
1. Scope   ← required
2. Subject ← required
3. Body    ← optional (disable: scopedCommits.promptBody: false)
4. Footer  ← optional (disable: scopedCommits.promptFooter: false)
```

### Pre-defining scopes

Add to `.vscode/settings.json` or user `settings.json`:

```json
{
  "scopedCommits.scopes": ["auth", "api", "ui", "db", "docs", "ci"]
}
```

Or let the extension build the list incrementally: choosing **New scope** (not
"only use once") saves it automatically.

### Enforcing scopes with commitlint

Define `scope-enum` in `.commitlintrc.json` to restrict which scopes are valid:

```json
{
  "rules": {
    "scope-enum": [2, "always", ["auth", "api", "ui", "db"]]
  }
}
```

The extension reads this and presents only those scopes in the picker.

---

## Configuration

| Setting                              | Default | Description                                              |
| ------------------------------------ | ------- | -------------------------------------------------------- |
| `scopedCommits.scopes`               | `[]`    | Pre-defined scope list                                   |
| `scopedCommits.autoCommit`           | `true`  | Commit automatically after forming the message           |
| `scopedCommits.promptBody`           | `true`  | Prompt for commit body                                   |
| `scopedCommits.promptFooter`         | `true`  | Prompt for commit footer                                 |
| `scopedCommits.promptCI`             | `false` | Prompt for `[skip ci]`                                   |
| `scopedCommits.promptTag`            | `false` | Prompt for a header tag (e.g. `[release]`)               |
| `scopedCommits.tags`                 | `[]`    | Pre-defined tag list                                     |
| `scopedCommits.gitmoji`              | `false` | Enable gitmoji picker                                    |
| `scopedCommits.emojiFormat`          | `code`  | Show gitmoji as `:code:` or emoji character              |
| `scopedCommits.lineBreak`            | `""`    | Word treated as a line break in the body                 |
| `scopedCommits.showEditor`           | `false` | Show full message in a separate editor tab               |
| `scopedCommits.silentAutoCommit`     | `false` | Auto-commit without focusing the SCM panel               |
| `scopedCommits.storeScopesGlobally`  | `false` | Save new scopes to user settings instead of workspace    |
| `scopedCommits.storeTagsGlobally`    | `false` | Save new tags to user settings instead of workspace      |
| `scopedCommits.showNewVersionNotes`  | `true`  | Show a notification on new versions                      |
| `scopedCommits.editor.keepAfterSave` | `false` | Keep the editor tab open after saving the commit message |

### Configuring `autoCommit`

When `autoCommit` is enabled (the default), the extension stages, commits, and
pushes for you:

1. Enable `git.enableSmartCommit` and set `git.smartCommitChanges` to `all` so
   all working-tree changes are committed when nothing is staged.
2. Set `git.postCommitCommand` to `sync` to push after each commit.

To use the extension only as a message formatter (filling in the SCM input box
without committing), set `scopedCommits.autoCommit: false`.

---

## Supported commitlint rules

The following rules from `.commitlintrc` are respected during input validation:

- `scope-enum` · `scope-case` · `scope-empty` · `scope-max-length` ·
  `scope-min-length`
- `subject-case` · `subject-empty` · `subject-full-stop` · `subject-max-length`
  · `subject-min-length`
- `header-case` · `header-full-stop` · `header-max-length` · `header-min-length`
- `body-full-stop` · `body-max-length` · `body-min-length`
- `footer-max-length` · `footer-min-length`

Type-related rules (`type-enum`, `type-case`, etc.) are no longer applicable and
are ignored.

---

## Build & install

See [INSTALL.md](./INSTALL.md) for full instructions. Quick version:

```bash
pnpm install
node prepare.js
pnpm run build
code --install-extension vscode-scoped-commits-1.0.0.vsix
```

### Tests

```bash
pnpm test          # unit tests (vitest)
pnpm run test:e2e  # end-to-end tests in a real VS Code host
```

---

## Troubleshooting

Open the VS Code **Output** panel and select **Scoped Commits** to see the
extension's diagnostic log.

---

## Credits

Built on top of
[vivaxy/vscode-conventional-commits](https://github.com/vivaxy/vscode-conventional-commits)
by vivaxy and yi_Xu. Original license: MIT.
