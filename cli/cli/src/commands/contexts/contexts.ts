import type { ExecutionContext } from "./contexts.type.js";

/**
 * Command → context. Keys are the full command path as it lands in
 * yargs' `argv._` (`"auth set"`, `"repo upgrade node"`), the bare verb
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
	"repo upgrade node": "global",
	"repo upgrade deps": "global",
	"auth set": "global",
	"auth unset": "global",
	"auth list": "global",
	// `auth export` asks the configured plugins for the tokens they take, so their packages must be resolvable.
	"auth export": "workspace",
	// `github-app create` talks to GitHub through the browser and a one-shot local server: no plugin is involved.
	"github-app create": "global",
	// `auth check` loads a plugin to verify, but degrades to "token present,
	// verification skipped" when the plugin isn't resolvable — so it's usable
	// from a global install. See `runAuthCheck`.
	"auth check": "global",
	"package bump-versions": "global",
	"package move-tag": "global",
	"package publish": "global",
	"skills install": "global",
	"skills remove": "global",
	"skills update": "global",
	// The `.husky/commit-msg` hook: works from a bare install, no holocron.config.
	"run lint commit-msg": "global",

	run: "repo-aware",
	"run ci": "repo-aware",
	// Reads each package's `holocron.config` and runs `pnpm --filter <pkg> delivery.deploy`
	// — no plugins of its own (the package's deploy script resolves them).
	"deploy on-release": "repo-aware",
	// Copies a built package and pins its dependency versions; loads no plugin.
	"deploy stage": "repo-aware",
	"config show": "repo-aware",
	// Writes README + package.json metadata from config; never loads a plugin.
	"repo sync readme": "repo-aware",

	doctor: "workspace",
	"repo setup": "workspace",
	"secrets list": "workspace",
	"secrets set": "workspace",
	"secrets sync": "workspace",
	// `tunnel up` calls the `tunnels` and `dns` providers, so their packages must be resolvable.
	"tunnel up": "workspace",
	// `project` subcommands call the `projects` provider, so its package must be resolvable.
	"project list": "workspace",
	"project create": "workspace",
	"project close": "workspace",
	"project setup": "workspace",
	// `dev` calls the `vault`, `tunnels` and `dns` providers, so their packages must be resolvable.
	dev: "workspace",
	// Loads the config and the handler it names; calls no provider (the vault's variables arrive in the environment).
	"dev serve": "repo-aware",
	"notifications channel add": "workspace",
	"notifications setup": "workspace",
	"notifications link": "workspace",
	"notifications create-server": "workspace",
	"notifications sync-roles": "workspace",
	// Loads the notifications provider to keep a discussion post per ADR and spec.
	"specs sync": "workspace",
	// Reads a board's items and sets statuses through the `projects` provider.
	"project reconcile": "workspace",
	"doctor all": "workspace",
	"doctor notifications": "workspace",
	"doctor environments": "workspace",
	"doctor credentials": "workspace",
	"doctor project": "workspace",
	// `project move` calls the `projects` provider, so its package must be resolvable.
	"project move": "workspace",
	// Reads and extends an organization property through the `source` provider.
	"repo properties apply": "workspace",
	"doctor dns": "workspace",
	"doctor repo": "workspace",
	"doctor secrets": "workspace",
	"doctor tokens": "workspace",
	"doctor monitoring": "workspace",
	"doctor variables": "workspace",
	// Reads `./holocron.config` and `.github/workflows`, no plugins.
	"doctor ci": "repo-aware",
	// Loads the configured plugins and runs the probes they offer.
	probe: "workspace",
	deploy: "workspace",
	"deploy cleanup-preview": "workspace",
	"monitoring check": "workspace",
	"monitoring resolve-checks": "workspace",
	// Reads an already-resolved checks file + a plain URL — no
	// holocron.config.ts, no plugins at all (holocron#1030/#1032's
	// delivery.previewCheck split).
	"monitoring run-resolved": "global",
	"repo sync": "workspace",
	"repo cleanup branches": "workspace",
	// Pushes generated templates to theholocron/.github — needs the holocron
	// monorepo checkout (not plugins), so only ever run with `pnpm exec`.
	"sync github": "workspace",
} as const satisfies Record<string, ExecutionContext>;

/**
 * The context for a command name from `argv._`. Falls back to the leading
 * verb (`"auth foo"` → `"auth"`) and finally `undefined` for a name the
 * map doesn't know — callers treat unknown as "don't guard".
 */
export function contextForCommand(name: string): ExecutionContext | undefined {
	const map = COMMAND_CONTEXTS as Record<string, ExecutionContext>;
	const tokens = name.split(" ").filter(Boolean);
	// Longest prefix wins: `repo sync labels` → `repo sync`, `run lint commit-msg` stays exact.
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
