# .humans

Everything a person needs to work on this repo on a fresh clone. It is the counterpart of [`.agents`](../.agents/), which
holds what a coding agent needs.

```bash
./.humans/setup.sh           # set everything up (safe to run again)
./.humans/setup.sh doctor    # change nothing, report what is missing
```

| File                     | What it is                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------- |
| [`setup.sh`](./setup.sh) | The setup script. Bash, because Node may not exist yet; it runs on macOS's bash 3.2 |
| [`Brewfile`](./Brewfile) | The one list of the tools the repo needs besides Node and pnpm                      |

## What the script does

It runs these steps in order, prints a line for each, and ends with a list of what failed (exit 1) and what only you can
do. Running it again only changes what is missing.

1. **Installs the tools in the Brewfile** that are not already on your `PATH` (see below).
2. **Checks Node** against the strictest `engines.node` in the workspace, and turns pnpm on through corepack.
3. **Checks your git identity.**
4. **Checks `gh` and `op` are signed in.** It reports; it never signs in for you.
5. **Runs `pnpm install` and `pnpm build`.**

`doctor` does the same checks and installs, enables and builds nothing.

## Why each tool

### Needed to run things

| Tool            | Command       | Why                                                                                                                                                                                                                                                                                       |
| --------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflared`   | `cloudflared` | The connector for a Cloudflare named tunnel. `holocron dev` and `holocron new tunnel` run it so GitHub can reach a webhook server on your laptop at a stable hostname (`sentinel-dev.theholocron.dev`). The tunnel's token is handed to it in its environment, never on its command line. |
| `1password-cli` | `op`          | The `vault` and `credentials` providers read **1Password Environments** through it, so tokens and app secrets are not kept in files on disk or in your shell profile. It needs the 1Password desktop app's CLI integration, which is what lets you unlock with Touch ID.                  |
| `gh`            | `gh`          | GitHub's own CLI. `holocron new` and the `probe` commands use it, and it is the quickest way to open and check pull requests and to get a token for `holocron repo setup` (`GITHUB_TOKEN=$(gh auth token)`).                                                                              |

### Needed to run `holocron run ci` locally

`holocron run ci` runs exactly the checks that gate a pull request, in CI order, and the pre-push hook runs it in strict
repos. These four are the linters it shells out to; without one, that check is reported as skipped locally and left to CI,
which is a round trip you would rather not spend.

| Tool                   | Command                | Check               | Why                                                          |
| ---------------------- | ---------------------- | ------------------- | ------------------------------------------------------------ |
| `actionlint`           | `actionlint`           | `lint:code`         | Finds mistakes in GitHub Actions workflow files              |
| `gitleaks`             | `gitleaks`             | `scan:secrets`      | Fails if a secret is about to be committed                   |
| `yamllint`             | `yamllint`             | `lint:data`         | Keeps YAML (workflows, configs) valid and consistent         |
| `editorconfig-checker` | `editorconfig-checker` | `lint:editorconfig` | Enforces `.editorconfig` (tabs, line endings, final newline) |

## Why the script checks what it does

- **Node.** The workspace needs a Node at least as new as the strictest `engines.node` in any `package.json`. A shell on an
  older Node does not fail noticeably: dependencies resolve differently and a typecheck fails in a package you never touched.
  The script reads the minimum from the manifests, so the version is never written down twice. Install Node yourself
  (with `n`, `nvm` or `fnm`): the script does not, because a second Node from Homebrew would combat the one you already
  manage.
- **pnpm.** The repo pins its pnpm version in `packageManager`; corepack installs exactly that one. Never use `npm` or
  `yarn` here.
- **Git identity.** Every commit is signed off (`git commit -s`, the DCO check), and the trailer comes from
  `user.name` and `user.email`.
- **`pnpm install`.** It also installs the git hooks (husky): `commit-msg` checks the commit message and `pre-push`
  runs the checks above.
- **`pnpm build`.** The `holocron` CLI is built from this repo, so on a fresh clone the command does not exist until the
  build has run. After it, `pnpm exec holocron --help` works.

## Why it installs only what is missing

`brew bundle` installs every line of a Brewfile, even a tool you already have from somewhere else (the 1Password
installer, an older Homebrew prefix), which leaves two copies and an unclear winner on your `PATH`. The script instead
looks for each tool's command and runs `brew install` only for the ones it cannot find. A line in the Brewfile names its
command when that differs from the package: `cask "1password-cli" # bin: op`. `brew bundle --file .humans/Brewfile` still
works on its own if you prefer it.

## What it will not do

| Not done                          | Why                                                                                            | What to do                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Install Homebrew                  | Running a script downloaded from the internet in your shell is your decision, not a setup step | Install it from <https://brew.sh>, then run the script again                                                |
| Install the 1Password app         | It is a large app most people already have, and a second copy breaks the CLI integration       | Install it, then turn on **Settings, Developer, Integrate with 1Password CLI**, then check with `op whoami` |
| Sign in to GitHub                 | It is interactive                                                                              | `gh auth login`                                                                                             |
| Install tools on Linux or Windows | The Brewfile is Homebrew's                                                                     | The script prints which tools are missing; install them with your package manager                           |

When both accounts are signed in, `pnpm exec holocron doctor` checks the rest (providers, tokens, the config).

## Adding a tool

If a command, a check or a workflow needs a tool that is not Node or a package from the workspace, add it to the Brewfile
in one line, and add `# bin: <command>` when the command is not the package name. Do not leave it as an install hint in an
error message or a README alone: this is the one list, and the script and this page read from it. Then add a row to the
table above saying what needs it.

## When something fails

| You see                                                                   | Cause and fix                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node X is older than the Y the workspace needs`                          | Upgrade Node (`n Y`, for example) and open a new shell.                                                                                                                                                                                                                                          |
| `git user.name and user.email are not set`                                | `git config --global user.name "…"` and `git config --global user.email "…"`                                                                                                                                                                                                                     |
| `op` shows as not signed in                                               | Turn on the 1Password CLI integration (above), unlock the app, and run `op whoami`                                                                                                                                                                                                               |
| The `pre-push` hook fails on something unrelated to your change           | Run `./.humans/setup.sh doctor` first: an old Node or a missing linter is the usual cause. `git push --no-verify` skips one push, so use it only once you know the cause                                                                                                                         |
| `node_modules lacks the hoisted link that astro-config's typecheck needs` | A `typecheck` failing in `astro-config` on `Cannot find module '@astrojs/markdown-remark'`, with CI green. An install made before the lockfile listed that package keeps no link to it, and `pnpm install` finds nothing to do. Run `pnpm install --force` (or `./.humans/setup.sh`, which does) |
| `brew install` fails                                                      | Run `brew doctor`, fix what it reports, and run the script again                                                                                                                                                                                                                                 |
