import type { ExecutionContext } from "./contexts.type.js";

/**
 * Command → context. Keys are the full command path as it lands in
 * yargs' `argv._` (`"new token"`, `"upgrade node"`), the bare verb
 * otherwise; a longer, more specific key wins over its parent.
 *
 * - **`global`** — needs nothing but the CLI binary. Works anywhere.
 * - **`repo-aware`** — reads `./holocron.config` + `./package.json`
 *   relative to cwd, but never touches the plugin loader.
 * - **`workspace`** — needs the configured providers' plugin packages to
 *   resolve (devDeps in a repo, or `pnpm exec`).
 */
export const COMMAND_CONTEXTS = {
	clone: "global",
	"new repo": "global",
	"new plugin": "global",
	"upgrade node": "global",
	"upgrade deps": "global",
	"new token": "global",
	"remove token": "global",
	"list tokens": "global",
	// `export tokens` asks the configured plugins for the tokens they take, so their packages must be resolvable.
	"export tokens": "workspace",
	// `export requests` loads the `tooling` providers to convert the repo's request files, so their packages must be resolvable.
	"export requests": "workspace",
	// `open requests` loads the `tooling` providers to read the workspace and the `vault` to read the Environment, so their packages must be resolvable.
	"open requests": "workspace",
	// `upload coverage` loads the `coverage` provider and calls its `upload`, so its package must be resolvable.
	"upload coverage": "workspace",
	// `new github-app` talks to GitHub through the browser and a one-shot local server: no plugin is involved.
	"new github-app": "global",
	// `check token` loads a plugin to verify, but degrades to "token present,
	// verification skipped" when the plugin isn't resolvable — so it's usable
	// from a global install. See `runAuthCheck`.
	"check token": "global",
	"publish bump-versions": "global",
	"publish tag": "global",
	"publish package": "global",
	"install skills": "global",
	"remove skill": "global",
	"update skills": "global",
	"list skills": "global",
	// The `.husky/commit-msg` hook: works from a bare install, no holocron.config.
	"run lint commit-msg": "global",

	run: "repo-aware",
	"run ci": "repo-aware",
	// Reads each package's `holocron.config` and runs `pnpm --filter <pkg> delivery.deploy`
	// — no plugins of its own (the package's deploy script resolves them).
	"deploy on-release": "repo-aware",
	// Copies a built package and pins its dependency versions; loads no plugin.
	"deploy stage": "repo-aware",
	"show config": "repo-aware",
	// Writes README + package.json metadata from config; never loads a plugin.
	"sync readme": "repo-aware",

	doctor: "workspace",
	setup: "workspace",
	"list secrets": "workspace",
	"new secret": "workspace",
	"sync secrets": "workspace",
	// `new tunnel` calls the `tunnels` and `dns` providers, so their packages must be resolvable.
	"new tunnel": "workspace",
	// `new domain` calls the `dns` provider, so its package must be resolvable.
	"new domain": "workspace",
	// `project` subcommands call the `projects` provider, so its package must be resolvable.
	"list projects": "workspace",
	"new project": "workspace",
	"close project": "workspace",
	"setup project": "workspace",
	// Reads a board's items and sets one status through the `projects` provider.
	"project status": "workspace",
	// `dev` calls the `vault`, `tunnels` and `dns` providers, so their packages must be resolvable.
	dev: "workspace",
	// Loads the config and the handler it names; calls no provider (the vault's variables arrive in the environment).
	"dev serve": "repo-aware",
	"new channel": "workspace",
	"setup notifications": "workspace",
	"link account": "workspace",
	"new server": "workspace",
	"sync roles": "workspace",
	// Loads the notifications provider to list and delete the extra posts of a forum.
	"cleanup posts": "workspace",
	// Loads the notifications provider to keep a discussion post per ADR and spec.
	"sync specs": "workspace",
	// Reads a board's items and sets statuses through the `projects` provider.
	"reconcile project": "workspace",
	"doctor all": "workspace",
	"doctor notifications": "workspace",
	"doctor environments": "workspace",
	"doctor project": "workspace",
	// Reads each dataset through the `logs` provider.
	"doctor logs": "workspace",
	// Reads the wiki's own files and site through the `wiki` provider.
	"doctor wiki": "workspace",
	// Reads the tracker's organization, projects and alert rules through the `errors` provider.
	"doctor errors": "workspace",
	// Reads the declared Workers and deployment projects through the `workers` and `deployment` providers.
	"doctor workers": "workspace",
	// Reads the vault environment that holds each App's id and key, through the `vault` provider.
	"doctor github-app": "workspace",
	// `move issues` calls the `projects` provider, so its package must be resolvable.
	"move issues": "workspace",
	// Reads and extends an organization property through the `source` provider.
	"apply properties": "workspace",
	// `migrate` loads the source and target `issues` providers (and `projects` for a board), so their packages must be resolvable.
	"migrate issue": "workspace",
	"migrate issues": "workspace",
	"migrate project": "workspace",
	"doctor dns": "workspace",
	"doctor repo": "workspace",
	"doctor secrets": "workspace",
	// Reads each layer's Environment through `vault` and runs each plugin's `token` probe against what it holds.
	"doctor tokens": "workspace",
	"doctor monitoring": "workspace",
	// Reads each layer's Environment through the `vault` provider, in memory.
	// Reads `./holocron.config` and `.github/workflows`, no plugins.
	"doctor ci": "repo-aware",
	// Reads git tags and npm's public registry, no plugins.
	"doctor releases": "repo-aware",
	// Loads the configured plugins and runs the probes they offer.
	probe: "workspace",
	// Loads the configured plugins and runs the `setup` or `doctor` a provider offers.
	provider: "workspace",
	deploy: "workspace",
	"deploy cleanup-preview": "workspace",
	"check monitor": "workspace",
	"resolve checks": "workspace",
	// Reads an already-resolved checks file + a plain URL — no
	// holocron.config.ts, no plugins at all (holocron#1030/#1032's
	// delivery.previewCheck split).
	"check resolved": "global",
	sync: "workspace",
	"cleanup branches": "workspace",
	// Pushes generated templates to theholocron/.github — needs the holocron
	// monorepo checkout (not plugins), so only ever run with `pnpm exec`.
	"sync github": "workspace",
	// Loads the source and target `issues` providers, so their packages must be resolvable.
	"sync issues": "workspace",
	// Reads ideas through the `ideas` provider and files each ready one through `issues`, so both packages must be resolvable.
	"sync ideas": "workspace",
	// Calls each `tooling` provider's `sync()`, so those packages (and a `credentials` one for their tokens) must be resolvable.
	"sync tooling": "workspace",
	// `sync requests` loads the `tooling` providers to keep their workspaces equal to the repo's request files.
	"sync requests": "workspace",
	// Reads the issue through the `issues` provider, so its package must be resolvable.
	"new spec": "workspace",
	// Files the issue through the `issues` provider, so its package must be resolvable.
	"new issue": "workspace",
	// Files the issue through `issues` (and reads it back for the spec), so that package must be resolvable.
	"new work": "workspace",
	// Changes the issue through the `issues` provider (and `projects` for `--project`), so their packages must be resolvable.
	"update issue": "workspace",
	// Reads the issue through `issues`, opens the pull request through `source` and runs git, so those packages must resolve.
	"start work": "workspace",
	// Updates the issue (`issues`), finds and updates the pull request (`source`) and sets the board status (`projects`), so those packages must resolve.
	"update work": "workspace",
	// Finds and readies the pull request (`source`), reads blockers and closes the issue (`issues`), withdraws the spec's post (`notifications`) and runs git, so those packages must resolve.
	"close work": "workspace",
} as const satisfies Record<string, ExecutionContext>;

/**
 * The context for a command name from `argv._`. Falls back to the leading
 * verb (`"auth foo"` → `"auth"`) and finally `undefined` for a name the
 * map doesn't know — callers treat unknown as "don't guard".
 */
export function contextForCommand(name: string): ExecutionContext | undefined {
	const map = COMMAND_CONTEXTS as Record<string, ExecutionContext>;
	const tokens = name.split(" ").filter(Boolean);
	// Longest prefix wins: `sync labels` → `sync`, `run lint commit-msg` stays exact.
	for (let n = tokens.length; n > 0; n--) {
		const ctx = map[tokens.slice(0, n).join(" ")];
		if (ctx) return ctx;
	}
	return undefined;
}

/** Command names in a given context, in registration order. */
export function commandsInContext(context: ExecutionContext): string[] {
	return Object.entries(COMMAND_CONTEXTS)
		.filter(([, c]) => c === context)
		.map(([name]) => name);
}
