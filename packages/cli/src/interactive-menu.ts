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
 * For a command whose handler honours `--dry-run` ({@link
 * CommandEntry.supportsDryRun}), `launchMenu` always previews it first — a
 * dry run doesn't mutate anything, so there's nothing to ask permission
 * for — then, once that preview comes back clean and found something to
 * do, asks the one real decision: "proceed with the real run?". A preview
 * that finds nothing to do skips that question too. `--skip-dry-run` opts
 * a top-level invocation out of the preview entirely, straight to the
 * real run, for when you already know what you want.
 *
 * Every prompt is preceded by a `process.stdin.isTTY` check. A non-TTY run
 * (CI, a script, a pipe) throws {@link NonInteractiveError} instead of
 * hanging on `@inquirer/prompts` (which otherwise throws its own
 * `ExitPromptError` the moment stdin closes) — `cli.ts`'s `USER_FACING_ERRORS`
 * catch prints its message cleanly, restoring the old demandCommand-style
 * hard failure for non-interactive callers.
 */

import { spawn } from "node:child_process";

import { confirm, input, select } from "@inquirer/prompts";
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
	/**
	 * Whether this command's handler honours the global `--dry-run` flag.
	 * Drives `launchMenu`'s dry-run offer: a menu-launched command with this
	 * set gets asked "run a dry run first?" (skipped if `--dry-run` was
	 * already passed at the top level) and, after a successful dry run,
	 * "proceed with the real run?". Hand-maintained in parallel with each
	 * handler's own `dryRun: argv.dryRun` usage in `cli.ts`.
	 */
	supportsDryRun?: boolean;
}

const numeric = (value: string): boolean | string => (/^\d+$/.test(value) ? true : "enter a number");

/**
 * The full command surface, hand-maintained in parallel with `cli.ts`'s
 * yargs registrations (this module does not introspect yargs at runtime).
 * `run <task>` is deliberately excluded — it's CI/scripting-oriented, and an
 * interactive prompt in front of it would work against that. (`run ci` is a
 * concrete, prompt-free entry, so it stays.) `run lint commit-msg <file>` is
 * excluded for the same reason: it's invoked exclusively from
 * `.husky/commit-msg "$1"`, never typed by a human.
 */
export const COMMAND_REGISTRY: CommandEntry[] = [
	{
		name: "clone",
		description: "Clone a single repo (org/repo) or every repo in an org (org)",
		positionals: [
			{
				key: "target",
				message: "org/repo to clone (or a bare org to clone every repo in it):",
				type: "input",
				validate: (v) => v.trim().length > 0 || "org/repo or org is required",
			},
		],
		supportsDryRun: true,
	},
	{
		name: "doctor",
		description: "Load the config and run a smoke check against every provider",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "repo setup",
		description: "Apply infra setup actions across every configured capability",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "secrets set",
		description: "Set a single secret via the configured `secrets` capability",
		positionals: [{ key: "name", message: "Secret name:", type: "input" }],
		supportsDryRun: true,
	},
	{
		name: "secrets sync",
		description: "Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars",
		positionals: [{ key: "environmentId", message: "Vault environment id:", type: "input" }],
		supportsDryRun: true,
	},
	{
		name: "deploy",
		description: "Trigger a deployment via the configured `deployment` capability",
		positionals: [{ key: "branch", message: "Branch to deploy:", type: "input" }],
		supportsDryRun: true,
	},
	{
		name: "deploy cleanup-preview",
		description: "List and delete Cloudflare Pages preview deployments for a GitHub PR",
		positionals: [{ key: "pr", message: "PR number:", type: "input", validate: numeric }],
		supportsDryRun: true,
	},
	{
		name: "deploy on-release",
		description: "Deploy every workspace package whose delivery.deploy task is `on: release`",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "package bump-versions",
		description: "Bump all non-private package versions in lockstep (semantic-release prepareCmd)",
		positionals: [{ key: "newVersion", cliArg: "new-version", message: "New version:", type: "input" }],
		supportsDryRun: true,
	},
	{
		name: "package publish",
		description: "Publish @theholocron/* packages to npm",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "repo sync",
		description:
			"Sync state from config to the provider and local files (labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki)",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "run ci",
		description: "Run the merge-gating checks locally, in CI order — 'will CI pass?'",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "sync github",
		description: "Sync workflow templates and composite actions to theholocron/.github",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "repo sync readme",
		description: "Sync the Installation + Usage block in README.md from package.json",
		positionals: [],
		supportsDryRun: true,
	},
	{ name: "config show", description: "Print the resolved holocron config", positionals: [] },
	{
		name: "new repo",
		description: "Scaffold a new repo from a GitHub template (e.g. cli, react, nextjs, node, monorepo, base)",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "new plugin",
		description: "Scaffold a new @theholocron/holocron-plugin-<slug> package",
		positionals: [
			{ key: "slug", message: "Package slug (kebab-case):", type: "input" },
			{ key: "vendor", message: "Vendor display name (PascalCase):", type: "input" },
		],
		supportsDryRun: true,
	},
	{
		name: "skills install",
		description: "Copy skills from @theholocron/skills into .agents/ with agent symlinks",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "skills remove",
		description: "Remove installed skills via npx skills remove",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "skills update",
		description: "Update installed skills to their latest upstream versions via npx skills update",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "repo upgrade node",
		description: "Scan the repo and update every Node.js version pin to a new major",
		positionals: [{ key: "to", message: "Target Node.js major version:", type: "input", validate: numeric }],
		supportsDryRun: true,
	},
	{
		name: "repo upgrade deps",
		description: "Bump every @theholocron/* pin to latest and migrate holocron.config.ts to the current preset API",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "auth set",
		description: "Verify + store a bootstrap token for a provider",
		positionals: [{ key: "provider", message: "Provider name:", type: "input" }],
	},
	{
		name: "auth unset",
		description: "Remove a stored bootstrap token",
		positionals: [{ key: "provider", message: "Provider:", type: "select", choices: listStoredProviders }],
	},
	{
		name: "auth check",
		description: "Re-verify a stored bootstrap token",
		positionals: [{ key: "provider", message: "Provider:", type: "select", choices: listStoredProviders }],
	},
	{
		name: "auth list",
		description: "List every provider with a stored bootstrap token",
		positionals: [],
	},
];

/** Look up a {@link CommandEntry} by its full name — for Layer 3 call sites in `cli.ts`. */
export function getEntry(name: string): CommandEntry {
	const entry = COMMAND_REGISTRY.find((e) => e.name === name);
	if (!entry) throw new Error(`interactive-menu: no COMMAND_REGISTRY entry named "${name}"`);
	return entry;
}

/** A row in one level of the nested menu: a command to run, a group to open, or "back". */
export interface MenuItem {
	name: string;
	/** A command name, `group:<path>` to open a submenu, or {@link BACK}. */
	value: string;
	description: string;
	/** Lower-cased text the search box matches against (a group includes everything under it). */
	haystack: string;
}

const GROUP = "group:";
/** The "← back" item's value; only offered below the first level. */
export const BACK = "back";

/**
 * One level of the menu, derived from the registered command names: the next word
 * of every entry under `path` (`[]` is the top). A word is
 *
 * - a **command** when nothing is nested under it (`doctor`);
 * - a **group** when commands are nested under it (`repo` → `repo setup`, `repo sync`, …),
 *   which can nest as deep as the names go (`repo upgrade` → `repo upgrade node`);
 *
 * Every row is a single word, never a "<command> <subcommand>" path: `config show` is
 * `config ›` then `show`, even when a group holds just one command.
 *
 * A path that is itself runnable (`repo sync`, `deploy`) gets a leading "<word> (run it)" item.
 * Registration order is kept.
 */
export function menuItems(entries: CommandEntry[], path: string[] = []): MenuItem[] {
	const prefix = path.join(" ");
	const own = prefix ? entries.find((e) => e.name === prefix) : undefined;
	const under = prefix ? entries.filter((e) => e.name.startsWith(`${prefix} `)) : entries;
	const haystackOf = (list: CommandEntry[]): string =>
		list.map((e) => `${e.name} ${e.description}`.toLowerCase()).join(" ");

	const items: MenuItem[] = [];
	if (own) {
		items.push({
			name: `${path[path.length - 1]!} (run it)`,
			value: own.name,
			description: own.description,
			haystack: haystackOf([own]),
		});
	}
	const words = [...new Set(under.map((e) => e.name.split(" ")[path.length]!))];
	for (const word of words) {
		const full = [...path, word].join(" ");
		const family = under.filter((e) => e.name === full || e.name.startsWith(`${full} `));
		const self = family.find((e) => e.name === full);
		const nested = family.filter((e) => e.name !== full);
		if (nested.length === 0 && self) {
			items.push({ name: word, value: full, description: self.description, haystack: haystackOf([self]) });
		} else {
			const children = [...new Set(nested.map((e) => e.name.split(" ")[path.length + 1]!))];
			items.push({
				name: `${word} ›`,
				value: `${GROUP}${full}`,
				description: children.join(", "),
				haystack: haystackOf(family),
			});
		}
	}
	return items;
}

/**
 * Searchable autocomplete over one menu level's `items`. `select()` would work too
 * at these list sizes, but `search()` degrades gracefully as the surface grows and
 * costs nothing when it doesn't. Resolves to the picked item's `value`.
 */
export async function pickMenuItem(items: MenuItem[], message = "What would you like to do?"): Promise<string> {
	return search<string>({
		message,
		source: (term) => searchChoices(items, term),
	});
}

/**
 * `@inquirer/search`'s `source` callback, factored out as a plain function —
 * unit-testable directly instead of only through a mocked `search()` call.
 * Empty/undefined `term` (nothing typed yet) returns every item.
 */
export function searchChoices(
	items: MenuItem[],
	term: string | undefined
): Array<{ name: string; value: string; description: string }> {
	const needle = term?.toLowerCase();
	const pool = !needle ? items : items.filter((i) => i.haystack.includes(needle));
	// Name-prefix hits, then other name hits, then description-only hits (stable, so
	// registry order holds within each bucket): typing `repo` should land on the `repo`
	// group, not on `clone` whose description says "repo", and `up` on `upgrade`, not `setup`.
	const rank = (i: MenuItem): number => {
		if (!needle) return 0;
		const name = i.name.toLowerCase();
		return name.startsWith(needle) ? 0 : name.includes(needle) ? 1 : 2;
	};
	return [...pool]
		.sort((a, b) => rank(a) - rank(b))
		.map((i) => ({ name: i.name, value: i.value, description: i.description }));
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
 *
 * `dryRunOverride`, when passed, wins over `argv.dryRun` — `launchMenu`'s
 * dry-run offer needs to force `--dry-run` on for the preview spawn and
 * force it back off for the real-run spawn that follows, regardless of
 * what was on the original invocation.
 */
export function forwardedFlags(argv: Record<string, unknown>, dryRunOverride?: boolean): string[] {
	const out: string[] = [];
	const tokens = argv.token as string[] | undefined;
	for (const t of tokens ?? []) out.push("--token", t);
	if (typeof argv.org === "string") out.push("--org", argv.org);
	if (typeof argv.cwd === "string") out.push("--cwd", argv.cwd);
	if (dryRunOverride ?? argv.dryRun === true) out.push("--dry-run");
	return out;
}

/** `entry.name` split into tokens, resolved positionals appended, then forwarded flags. */
export function buildChildArgv(
	entry: CommandEntry,
	positionals: string[],
	parentArgv: Record<string, unknown>,
	dryRunOverride?: boolean
): string[] {
	return [...entry.name.split(" "), ...positionals, ...forwardedFlags(parentArgv, dryRunOverride)];
}

/**
 * Set on a dry-run preview child's env ({@link spawnChild}'s `extraEnv`) so
 * its handler knows this specific `--dry-run` came from `launchMenu`'s own
 * preview-then-ask flow, not a direct `holocron <cmd> --dry-run` invocation.
 * A handler that supports it uses this — never bare `argv.dryRun` — to
 * decide whether to report {@link DRY_RUN_NOOP_EXIT_CODE}: that exit code
 * only has special meaning to `launchMenu` itself, so a direct/scripted
 * `--dry-run` call must never produce it — doing so unconditionally would
 * silently change the public exit-code contract for a successful dry run.
 */
export const DRY_RUN_PREVIEW_ENV_VAR = "HOLOCRON_DRY_RUN_PREVIEW";

/**
 * Reserved exit code a dry-run-capable handler may use — only when {@link
 * DRY_RUN_PREVIEW_ENV_VAR} is set — to report "ran clean, nothing would
 * change." `launchMenu` treats it as success but skips the "proceed with
 * the real run?" question, since there's nothing for the real run to do
 * either.
 */
export const DRY_RUN_NOOP_EXIT_CODE = 2;

/**
 * Spawn `holocron <...args>` inheriting stdio; resolve with its exit code.
 *
 * `NO_UPDATE_NOTIFIER` is forced on in the child's env — the parent's own
 * update-notifier tail still runs after this resolves (see `launchMenu`'s
 * docstring), so without this the freshly-spawned child independently runs
 * its own `checkForUpdates()` too and the notice prints twice: once from
 * the child right after its command output, once more from the parent
 * once the child exits. `extraEnv` layers on top — used only for {@link
 * DRY_RUN_PREVIEW_ENV_VAR} on the dry-run preview spawn.
 */
function spawnChild(args: string[], extraEnv?: Record<string, string>): Promise<number> {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [process.argv[1]!, ...args], {
			stdio: "inherit",
			env: { ...process.env, NO_UPDATE_NOTIFIER: "1", ...extraEnv },
		});
		child.on("exit", (code) => resolve(code ?? 0));
		child.on("error", () => resolve(1));
	});
}

/**
 * Whether `launchMenu` should auto-preview a picked command before running
 * it for real — only when the command's handler actually honours
 * `--dry-run` ({@link CommandEntry.supportsDryRun}) and the top-level
 * invocation didn't pass `--skip-dry-run` to opt out of the preview
 * entirely (an escape hatch for "I already know what I want, skip
 * straight to the real run").
 */
export function shouldPreviewDryRun(entry: CommandEntry, parentArgv: Record<string, unknown>): boolean {
	return Boolean(entry.supportsDryRun) && parentArgv.skipDryRun !== true;
}

/**
 * Layers 1 and 2: walk the nested menu over `entries` (starting at `startPath`,
 * `[]` for the top), prompt for the picked command's required positionals, spawn
 * it as a fresh `holocron` invocation, and set `process.exitCode` from the child —
 * the caller (a `$0` handler in `cli.ts`) returns normally afterward so the
 * parent's own telemetry flush / update-notifier tail still runs. The parent's
 * own `command_completed` event fires with command name "unknown" (the middleware
 * ran before any command was picked) — left as-is rather than suppressed; it's a
 * real, useful signal ("the menu got used").
 *
 * Picking a group opens its submenu, which has a "← back" item; a command ends
 * the walk. See {@link menuItems} for how a level is built.
 *
 * For a command that honours `--dry-run` ({@link CommandEntry.supportsDryRun})
 * and wasn't opted out via `--skip-dry-run` ({@link shouldPreviewDryRun}),
 * this always previews first — a dry run doesn't mutate anything, so
 * there's nothing to ask permission for. A preview that exits non-zero
 * stops here; one that reports {@link DRY_RUN_NOOP_EXIT_CODE} (nothing
 * would change) stops here too, skipping the follow-up question since the
 * real run would have nothing to do either. Otherwise it asks "proceed
 * with the real run?" before the real spawn — the one actual decision
 * left to make, since this one does mutate something.
 */
export async function launchMenu(
	entries: CommandEntry[],
	parentArgv: Record<string, unknown>,
	pickMessage?: string,
	nonInteractiveMessage = "Run `holocron --help` to see available commands.",
	startPath: string[] = []
): Promise<void> {
	if (!process.stdin.isTTY) {
		throw new NonInteractiveError(nonInteractiveMessage);
	}
	const stack: string[][] = [startPath];
	let picked: CommandEntry | undefined;
	while (!picked) {
		const path = stack[stack.length - 1]!;
		const items = menuItems(entries, path);
		if (stack.length > 1) {
			items.push({ name: "← back", value: BACK, description: "Return to the previous menu", haystack: "back" });
		}
		const message = stack.length === 1 ? pickMessage : `${path.join(" ")} — choose a subcommand:`;
		const value = await pickMenuItem(items, message);
		if (value === BACK) {
			stack.pop();
		} else if (value.startsWith(GROUP)) {
			stack.push(value.slice(GROUP.length).split(" "));
		} else {
			// `value` is drawn from `items`, which are built from `entries`, so this is always defined.
			picked = entries.find((e) => e.name === value);
		}
	}
	const positionals = await promptForPositionals(picked, {});

	if (shouldPreviewDryRun(picked, parentArgv)) {
		const dryExit = await spawnChild(buildChildArgv(picked, positionals, parentArgv, true), {
			[DRY_RUN_PREVIEW_ENV_VAR]: "1",
		});
		if (dryExit === DRY_RUN_NOOP_EXIT_CODE) {
			process.exitCode = 0;
			return;
		}
		if (dryExit !== 0) {
			process.exitCode = dryExit;
			return;
		}
		const proceed = await confirm({ message: "Dry run complete — proceed with the real run?", default: false });
		if (!proceed) {
			process.exitCode = 0;
			return;
		}
		process.exitCode = await spawnChild(buildChildArgv(picked, positionals, parentArgv, false));
		return;
	}

	process.exitCode = await spawnChild(buildChildArgv(picked, positionals, parentArgv));
}
