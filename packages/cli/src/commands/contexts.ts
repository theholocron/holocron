/**
 * Every command's **execution context** — the single source of truth for
 * how much of a repo a command needs around it to do its job.
 *
 * `npm i -g @theholocron/cli` gives you the binary and nothing else: no
 * `holocron.config`, no plugin packages. A large slice of the command
 * surface is fine with that; the rest needs a repo, and a few need the
 * provider plugins resolvable as well. Tagging each command lets the CLI
 *
 *   1. fail a `workspace` command **gracefully** when the plugins can't be
 *      resolved (see {@link ../plugin/workspace.js}), instead of leaking a
 *      raw `Cannot find package '@theholocron/holocron-plugin-*'`, and
 *   2. group `holocron --help` / the docs by what a bare global install
 *      actually gets you.
 *
 * Spec: `docs/wiki/specifications/tech-cli-execution-contexts.spec.md`
 * (theholocron/holocron#576). Shared with the interactive-menu registry
 * (theholocron/holocron#438).
 */

export type ExecutionContext = "global" | "repo-aware" | "workspace";

/**
 * Command → context. Keys are the command name as it lands in yargs'
 * `argv._` — the full path for sub-commands (`"auth set"`, `"upgrade
 * node"`), the bare verb otherwise.
 *
 * - **`global`** — needs nothing but the CLI binary. Works anywhere.
 * - **`repo-aware`** — reads `./holocron.config` + `./package.json`
 *   relative to cwd, but never touches the plugin loader.
 * - **`workspace`** — needs the configured providers' plugin packages to
 *   resolve (devDeps in a repo, or `pnpm exec`).
 */
export const COMMAND_CONTEXTS = {
	version: "global",
	clone: "global",
	new: "global",
	"upgrade node": "global",
	"upgrade deps": "global",
	"plugin create": "global",
	"auth set": "global",
	"auth unset": "global",
	"auth list": "global",
	// `auth check` loads a plugin to verify, but degrades to "token present,
	// verification skipped" when the plugin isn't resolvable — so it's usable
	// from a global install. See `runAuthCheck`.
	"auth check": "global",
	"bump-versions": "global",
	publish: "global",
	"skills install": "global",
	"skills remove": "global",
	"skills update": "global",

	run: "repo-aware",
	ci: "repo-aware",
	"config show": "repo-aware",
	// Writes README + package.json metadata from config; never loads a plugin.
	"sync-readme": "repo-aware",

	doctor: "workspace",
	setup: "workspace",
	"secret set": "workspace",
	"secrets sync": "workspace",
	deploy: "workspace",
	"cleanup-preview": "workspace",
	sync: "workspace",
	// Pushes generated templates to theholocron/.github — needs the holocron
	// monorepo checkout (not plugins), so only ever run with `pnpm exec`.
	"sync-github": "workspace",
} as const satisfies Record<string, ExecutionContext>;

/**
 * The context for a command name from `argv._`. Falls back to the leading
 * verb (`"auth foo"` → `"auth"`) and finally `undefined` for a name the
 * map doesn't know — callers treat unknown as "don't guard".
 */
export function contextForCommand(name: string): ExecutionContext | undefined {
	const map = COMMAND_CONTEXTS as Record<string, ExecutionContext>;
	if (map[name]) return map[name];
	const verb = name.split(" ")[0] ?? "";
	return map[verb];
}

/** Command names in a given context, in registration order. */
export function commandsInContext(context: ExecutionContext): string[] {
	return Object.entries(COMMAND_CONTEXTS)
		.filter(([, c]) => c === context)
		.map(([name]) => name);
}
