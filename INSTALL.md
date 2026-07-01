# Scoped Commits — Build & Install

## Quick install (VSIX already built)

The file `vscode-scoped-commits-1.0.0.vsix` is ready to install right now.

```bash
code --install-extension vscode-scoped-commits-1.0.0.vsix
```

Or inside VS Code:

1. `Ctrl+Shift+P` → **Extensions: Install from VSIX…**
2. Navigate to `vscode-scoped-commits-1.0.0.vsix`
3. Click **Install**
4. Reload VS Code when prompted

---

## Build from source

### Prerequisites

- Node.js ≥ 18
- npm (comes with Node) — or yarn if you prefer

### Steps

```bash
# 1. Enter the repo
cd vscode-conventional-commits   # (or wherever you cloned it)

# 2. Install dependencies
npm install

# 3. Download the gitmoji list (needed even if you leave gitmoji disabled)
node prepare.js

# 4. Package the VSIX
npx @vscode/vsce package --no-yarn
```

This produces `vscode-scoped-commits-1.0.0.vsix` in the repo root.

```bash
# 5. Install it
code --install-extension vscode-scoped-commits-1.0.0.vsix
```

---

## Using the extension

Once installed, trigger it two ways:

- **Command Palette**: `Ctrl+Shift+P` → **Scoped Commits**
- **Source Control panel**: click the Scoped Commits icon in the SCM title bar

### Prompt flow

```
1. Scope   ← required; pick saved, add new, or type once
2. Subject ← required; short description of the change
3. Body    ← optional (disable with scopedCommits.promptBody: false)
4. Footer  ← optional (disable with scopedCommits.promptFooter: false)
```

Output format: `scope: description`

### Pre-defining your scopes (recommended)

Add to `.vscode/settings.json` or your user `settings.json`:

```json
{
  "scopedCommits.scopes": ["auth", "api", "ui", "db", "docs", "ci"]
}
```

Or let the extension build the list for you: the first time you type a new scope
and choose **New scope** (not "only use once"), it is saved automatically.

### Key settings

| Setting                             | Default | Description                                           |
| ----------------------------------- | ------- | ----------------------------------------------------- |
| `scopedCommits.scopes`              | `[]`    | Pre-defined scope list                                |
| `scopedCommits.promptBody`          | `true`  | Prompt for commit body                                |
| `scopedCommits.promptFooter`        | `true`  | Prompt for commit footer                              |
| `scopedCommits.gitmoji`             | `false` | Enable gitmoji picker                                 |
| `scopedCommits.autoCommit`          | `true`  | Commit automatically after filling the message        |
| `scopedCommits.storeScopesGlobally` | `false` | Save new scopes to user settings instead of workspace |

### commitlint integration

If your project has a `.commitlintrc.*` that defines `scope-enum`, those scopes
are loaded automatically and presented as the only choices in step 1.

Example `.commitlintrc.json`:

```json
{
  "rules": {
    "scope-enum": [2, "always", ["auth", "api", "ui", "db"]]
  }
}
```

---

## Run unit tests

```bash
npm run test
```

28 tests covering `CommitMessage` serialization and commitlint config loading.

---

## Uninstall

```bash
code --uninstall-extension scoped-commits.vscode-scoped-commits
```
