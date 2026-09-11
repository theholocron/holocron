/**
 * The interactive fallback — replaces every "run --help to see commands"
 * dead end with a prompt. Three layers, all driven by {@link COMMAND_REGISTRY}:
 *
 *   1. `holocron` with no command      → searchable picker over every command
 *   2. a parent command with no sub    → `select()` over that group's commands
 *   3. a leaf command missing a        → `input()` / `select()` per positional
 *      required positional
 *
 * Layers 1–2 are driven from `cli.ts`'s `$0` handlers via {@link launchMenu}:
 * pick a command, prompt for its required positionals, then **spawn a fresh
 * `holocron <command> …` child process** (`stdio: "inherit"`) rather than
 * re-entering yargs' own parse pipeline — see the spec's "spawn vs re-parse"
 * section (theholocron/holocron#438) for why. Layer 3 is driven directly from
 * each leaf command's own handler in `cli.ts`, calling
 * {@link promptForPositionals} for just that one command — no spawn needed,
 * the handler already has everything else it needs.
 *
 * Every prompt is preceded by a `process.stdin.isTTY` check. A non-TTY run
 * (CI, a script, a pipe) throws {@link NonInteractiveError} instead of
 * hanging on `@inquirer/prompts` (which otherwise throws its own
 * `ExitPromptError` the moment stdin closes) — `cli.ts`'s `USER_FACING_ERRORS`
 * catch prints its message cleanly, restoring the old demandCommand-style
 * hard failure for non-interactive callers.
 */

import { spawn } from "node:child_process";

import { input, select } from "@inquirer/prompts";
import search from "@inquirer/search";

import { listStoredProviders } from "./auth/keyring.js";

/** Raised when a prompt is needed but stdin isn't a TTY — see the module doc. */
export class NonInteractiveError extends Error {
	override name = "NonInteractiveError";
}

export interface PositionalPrompt {
	/** The yargs positional's camelCased argv key (e.g. `"newVersion"`). */
	key: string;
	/**
	 * The literal token in the command string, when it differs from `key`
	 * (yargs positionals are kebab-case there — `<new-version>` — but
	 * camelCased in argv). Shown in the non-interactive fallback message.
	 * Defaults to `key`.
	 */
	cliArg?: string;
	/** Label shown to the user. */
	message: string;
	type: "input" | "select";
	/**
	 * Required when `type === "select"`. A plain list for a fixed set, or a
	 * thunk for a set resolved at prompt time (e.g. `auth unset`'s provider
	 * choices are whatever currently has a stored token — there's no fixed
	 * provider list, providers are open-ended plugin packages).
	 */
	choices?: string[] | (() => string[]);
	/** Optional `input()` validation — e.g. numeric positionals. */
	validate?: (value: string) => boolean | string;
}

export interface CommandEntry {
	/** Full command name as typed at the CLI, e.g. `"auth set"`. */
	name: string;
	/** One-liner, matches the yargs registration's description. */
	description: string;
	/** Required positionals only, in order. Empty when the command needs none. */
	positionals: PositionalPrompt[];
	/** Parent command, for Layer 2 grouping: `"auth" | "skills" | "upgrade"`. */
	group?: string;
}

const numeric = (value: string): boolean | string => (/^\d+$/.test(value) ? true : "enter a number");

/**
 * The full command surface, hand-maintained in parallel with `cli.ts`'s
 * yargs registrations (this module does not introspect yargs at runtime).
 * `run <task>` is deliberately excluded — it's CI/scripting-oriented, and an
 * interactive prompt in front of it would work against that.
 */
export const COMMAND_REGISTRY: CommandEntry[] = [
	{ name: "version", description: "Print the CLI version", positionals: [] },
	{
		name: "clone",
		description: "Clone all repos in a GitHub org as siblings under a single directory",
		positionals: [],
	},
	{ name: "doctor", description: "Load the config and run a smoke check against every provider", positionals: [] },
	{ name: "setup", description: "Apply infra setup actions across every configured capability", positionals: [] },
	{
		name: "secret set",
		description: "Set a single secret via the configured `secrets` capability",
		positionals: [{ key: "name", message: "Secret name:", type: "input" }],
	},
	{
		name: "secrets sync",
		description: "Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars",
		positionals: [{ key: "environmentId", message: "Vault environment id:", type: "input" }],
	},
	{
		name: "deploy",
		description: "Trigger a deployment via the configured `deployment` capability",
		positionals: [{ key: "branch", message: "Branch to deploy:", type: "input" }],
	},
	{
		name: "cleanup-preview",
		description: "List and delete Cloudflare Pages preview deployments for a GitHub PR",
		positionals: [{ key: "pr", message: "PR number:", type: "input", validate: numeric }],
	},
	{
		name: "bump-versions",
		description: "Bump all non-private package versions in lockstep (semantic-release prepareCmd)",
		positionals: [{ key: "newVersion", cliArg: "new-version", message: "New version:", type: "input" }],
	},
	{
		name: "publish",
		description: "Publish @theholocron/* packages to npm",
		positionals: [],
	},
	{
		name: "sync",
		description:
			"Sync state from config to the provider and local files (labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki)",
		positionals: [],
	},
	{ name: "ci", description: "Run the merge-gating checks locally, in CI order — 'will CI pass?'", positionals: [] },
	{
		name: "sync-github",
		description: "Sync workflow templates and composite actions to theholocron/.github",
		positionals: [],
	},
	{
		name: "sync-readme",
		description: "Sync the Installation + Usage block in README.md from package.json",
		positionals: [],
	},
	{ name: "config show", description: "Print the resolved holocron config", positionals: [] },
	{
		name: "new",
		description: "Scaffold a new repo from a GitHub template (e.g. cli, react, nextjs, node, monorepo, base)",
		positionals: [],
	},
	{
		name: "plugin create",
		description: "Scaffold a new @theholocron/holocron-plugin-<slug> package",
		positionals: [
			{ key: "slug", message: "Package slug (kebab-case):", type: "input" },
			{ key: "vendor", message: "Vendor display name (PascalCase):", type: "input" },
		],
	},
	{
		name: "skills install",
		description: "Copy skills from @theholocron/skills into .agents/ with agent symlinks",
		positionals: [],
		group: "skills",
	},
	{
		name: "skills remove",
		description: "Remove installed skills via npx skills remove",
		positionals: [],
		group: "skills",
	},
	{
		name: "skills update",
		description: "Update installed skills to their latest upstream versions via npx skills update",
		positionals: [],
		group: "skills",
	},
	{
		name: "upgrade node",
		description: "Scan the repo and update every Node.js version pin to a new major",
		positionals: [{ key: "to", message: "Target Node.js major version:", type: "input", validate: numeric }],
		group: "upgrade",
	},
	{
		name: "upgrade deps",
		description: "Bump every @theholocron/* pin to latest and migrate holocron.config.ts to the current preset API",
		positionals: [],
		group: "upgrade",
	},
	{
		name: "auth set",
		description: "Verify + store a bootstrap token for a provider",
		positionals: [{ key: "provider", message: "Provider name:", type: "input" }],
		group: "auth",
	},
	{
		name: "auth unset",
		description: "Remove a stored bootstrap token",
		positionals: [{ key: "provider", message: "Provider:", type: "select", choices: listStoredProviders }],
		group: "auth",
	},
	{
		name: "auth check",
		description: "Re-verify a stored bootstrap token",
		positionals: [{ key: "provider", message: "Provider:", type: "select", choices: listStoredProviders }],
		group: "auth",
	},
	{
		name: "auth list",
		description: "List every provider with a stored bootstrap token",
		positionals: [],
		group: "auth",
	},
];

/** Look up a {@link CommandEntry} by its full name — for Layer 3 call sites in `cli.ts`. */
export function getEntry(name: string): CommandEntry {
	const entry = COMMAND_REGISTRY.find((e) => e.name === name);
	if (!entry) throw new Error(`interactive-menu: no COMMAND_REGISTRY entry named "${name}"`);
	return entry;
}

/**
 * Searchable autocomplete over `entries` — the Layer 1 top-level picker, and
 * (passed a `group`-filtered subset) the Layer 2 parent-command picker.
 * `select()` would work too at these list sizes, but `search()` degrades
 * gracefully as the surface grows and costs nothing when it doesn't.
 */
export async function pickCommand(
	entries: CommandEntry[],
	message = "What would you like to do?"
): Promise<CommandEntry> {
	const byName = new Map(entries.map((e) => [e.name, e]));
	const picked = await search<string>({
		message,
		source: (term) => searchChoices(entries, term),
	});
	// `source` only ever returns names drawn from `entries`, so this is always defined.
	return byName.get(picked)!;
}

/**
 * `@inquirer/search`'s `source` callback, factored out as a plain function —
 * unit-testable directly instead of only through a mocked `search()` call.
 * Empty/undefined `term` (nothing typed yet) returns every entry.
 */
export function searchChoices(
	entries: CommandEntry[],
	term: string | undefined
): Array<{ name: string; value: string; description: string }> {
	const pool = !term ? entries : entries.filter((e) => matches(e, term));
	return pool.map((e) => ({ name: e.name, value: e.name, description: e.description }));
}

function matches(entry: CommandEntry, term: string): boolean {
	const needle = term.toLowerCase();
	return entry.name.toLowerCase().includes(needle) || entry.description.toLowerCase().includes(needle);
}

/**
 * For each of `entry.positionals` not already present in `argv`, prompts for
 * it (`input()` or `select()`, per the positional's `type`) and returns the
 * resolved values in positional order — ready to append to a spawned child's
 * argv, or to use directly in the current handler (Layer 3).
 *
 * Throws {@link NonInteractiveError} the first time it would need to prompt
 * on a non-TTY stdin, and again if a `select` positional's choices resolve
 * empty (nothing to pick from — e.g. `auth unset` with no stored tokens).
 */
export async function promptForPositionals(entry: CommandEntry, argv: Record<string, unknown>): Promise<string[]> {
	const out: string[] = [];
	for (const positional of entry.positionals) {
		const existing = argv[positional.key];
		if (existing !== undefined && existing !== "") {
			out.push(String(existing));
			continue;
		}
		if (!process.stdin.isTTY) {
			throw new NonInteractiveError(
				`\`${entry.name}\` needs "${positional.key}" — pass it directly: holocron ${entry.name} <${positional.cliArg ?? positional.key}>`
			);
		}
		if (positional.type === "select") {
			const choices =
				typeof positional.choices === "function" ? positional.choices() : (positional.choices ?? []);
			if (choices.length === 0) {
				throw new NonInteractiveError(
					`\`${entry.name}\`: no ${positional.key} to choose from — nothing stored yet`
				);
			}
			out.push(await select({ message: positional.message, choices: choices.map((c) => ({ value: c })) }));
		} else {
			out.push(
				await input({
					message: positional.message,
					...(positional.validate ? { validate: positional.validate } : {}),
				})
			);
		}
	}
	return out;
}

/**
 * `--token` (repeatable), `--org`, `--cwd`, `--dry-run` — the global flags a
 * menu-launched child should inherit from the parent invocation. Everything
 * else (command-specific options) was never captured by the top-level `$0`
 * handler in the first place, so there's nothing else to forward.
 */
export function forwardedFlags(argv: Record<string, unknown>): string[] {
	const out: string[] = [];
	const tokens = argv.token as string[] | undefined;
	for (const t of tokens ?? []) out.push("--token", t);
	if (typeof argv.org === "string") out.push("--org", argv.org);
	if (typeof argv.cwd === "string") out.push("--cwd", argv.cwd);
	if (argv.dryRun === true) out.push("--dry-run");
	return out;
}

/** `entry.name` split into tokens, resolved positionals appended, then forwarded flags. */
export function buildChildArgv(
	entry: CommandEntry,
	positionals: string[],
	parentArgv: Record<string, unknown>
): string[] {
	return [...entry.name.split(" "), ...positionals, ...forwardedFlags(parentArgv)];
}

/** Spawn `holocron <...args>` inheriting stdio; resolve with its exit code. */
function spawnChild(args: string[]): Promise<number> {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [process.argv[1]!, ...args], { stdio: "inherit" });
		child.on("exit", (code) => resolve(code ?? 0));
		child.on("error", () => resolve(1));
	});
}

/**
 * Layers 1 and 2: pick a command from `entries`, prompt for its required
 * positionals, spawn it as a fresh `holocron` invocation, and set
 * `process.exitCode` from the child — the caller (a `$0` handler in
 * `cli.ts`) returns normally afterward so the parent's own telemetry
 * flush / update-notifier tail still runs. The parent's own
 * `command_completed` event fires with command name "unknown" (the
 * middleware ran before any command was picked) — left as-is rather than
 * suppressed; it's a real, useful signal ("the menu got used").
 */
export async function launchMenu(
	entries: CommandEntry[],
	parentArgv: Record<string, unknown>,
	pickMessage?: string,
	nonInteractiveMessage = "Run `holocron --help` to see available commands."
): Promise<void> {
	if (!process.stdin.isTTY) {
		throw new NonInteractiveError(nonInteractiveMessage);
	}
	const picked = await pickCommand(entries, pickMessage);
	const positionals = await promptForPositionals(picked, {});
	const childArgv = buildChildArgv(picked, positionals, parentArgv);
	process.exitCode = await spawnChild(childArgv);
}
