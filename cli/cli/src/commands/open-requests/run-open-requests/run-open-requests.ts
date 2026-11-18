/**
 * `holocron open requests` — opens the request tool's workspace with its secrets filled in from the layer's vault
 * Environment, so nobody pastes a signing secret by hand.
 *
 * The `tooling` provider (Bruno's) says which values the workspace reads (`Tooling.open`: each secret variable is a
 * reference to a named entry, written by `sync requests`) and how to start the tool. This command takes exactly those
 * entries from the Environment, in memory, writes them to a private file in `.holocron/.private/` (mode 0600, git-ignored,
 * never printed), links the file to where the tool reads it (`<collection>/.env`) and runs the tool in the foreground.
 * The file, the links and the lock are removed when the tool quits, on an error, and on SIGINT, SIGTERM, SIGHUP and exit;
 * nothing can run on SIGKILL or a crash, so the file starts with a marker line and a later run removes its own leftover
 * and refuses anything without the marker. A tool that is already running is never touched: it would not see the values.
 * Names and paths are printed, never a value. `--dry-run` lists them and starts nothing.
 */

import { dirname, relative, resolve } from "node:path";

import { confirm } from "@inquirer/prompts";
import { dotenvLine } from "@theholocron/kyber/secrets";
import {
	type CheckRow,
	describeError,
	NonInteractiveError,
	printCheckRows,
	printCheckSummary,
	style,
	summariseChecks,
} from "@theholocron/kyber/ui";

import type { ResolvedTuple } from "../../../config/index.js";
import { assertPluginsResolvable, PluginLoader, type Tooling, type ToolingOpenPlan } from "../../../plugin/index.js";
import { ignoreAdvice, PRIVATE_DIR } from "../../../private-dir/index.js";
import { ownerEnvironments } from "../../owner-environments/index.js";
import { OPEN_LAYERS, type OpenLayer, parseOpenLayers } from "../parse-open-layers/index.js";
import { readEntryValues } from "../read-entry-values/index.js";
import { defaultDeps } from "./default-deps/index.js";
import type { OpenRequestsDeps, OpenRequestsReport, RunOpenRequestsInput } from "./run-open-requests.type.js";

/** The first line of the file this command writes; a file that starts with it is this command's own leftover. */
export const MARKER = "# written by `holocron open requests` for one session and removed when it ends";

/** The file the values go to, in the private directory. */
const SECRETS_FILE = `${PRIVATE_DIR}/requests.env`;
/** The lock a launch holds, in the private directory. */
const LOCK_FILE = `${PRIVATE_DIR}/open-requests.lock`;

const row = (id: string, status: CheckRow["status"], detail: string, problems: string[] = []): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems,
});

/** Whether a link or file at `link` is something this command wrote: a link to the values file, or a marked file. */
function isOurs(state: ReturnType<OpenRequestsDeps["inspect"]>, link: string, secrets: string): boolean {
	if (state.kind === "symlink") return resolve(dirname(link), state.to) === secrets;
	return state.kind === "file" && state.firstLine === MARKER;
}

export async function runOpenRequests(input: RunOpenRequestsInput): Promise<OpenRequestsReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const deps: OpenRequestsDeps = { ...defaultDeps(), ...input.deps };
	const dryRun = Boolean(input.context.dryRun);
	const layers = parseOpenLayers(input.environments);
	const { repoRoot } = input.context;
	const rows: CheckRow[] = [];
	const say = (next: CheckRow) => {
		rows.push(next);
		printCheckRows([next], print);
	};
	const finish = (status?: OpenRequestsReport["status"]): OpenRequestsReport => {
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: status ?? (summary.fail > 0 ? "fail" : "ok"), rows };
	};
	print(style.header(`Holocron open requests${dryRun ? " (dry-run)" : ""}`));
	print("");

	const entry = input.loaded.resolved.providers.tooling;
	// `tooling` is a many-cardinality capability, so its entry is always a list.
	const tuples: ResolvedTuple[] = entry?.cardinality === "many" ? entry.tuples : [];
	const chosen = input.to === undefined ? tuples : tuples.filter((t) => t.provider === input.to);
	if (chosen.length === 0) {
		say(
			row(
				input.to ?? "tooling",
				"fail",
				input.to === undefined
					? "the config has no `tooling` provider to open"
					: `not a \`tooling\` provider of this config (${tuples.map((t) => t.provider).join(", ")})`
			)
		);
		return finish();
	}

	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	/* v8 ignore stop */
	await loader.load();
	assertPluginsResolvable(loader, "open requests");
	const tools = (loader.has("tooling") ? loader.get("tooling") : []).filter((t) =>
		chosen.some((tuple) => tuple.provider === t.providerName)
	);
	const openable = tools.filter((t): t is Tooling & Required<Pick<Tooling, "open">> => t.open !== undefined);
	if (openable.length !== 1) {
		say(
			row(
				"tooling",
				"fail",
				openable.length === 0
					? "no `tooling` provider can open its workspace"
					: `more than one \`tooling\` provider can open its workspace (${openable.map((t) => t.providerName).join(", ")}); name one with --to`
			)
		);
		return finish();
	}
	const tool = openable[0];
	const tuple = chosen.find((t) => t.provider === tool.providerName) as ResolvedTuple;
	const list = (value: unknown): string[] =>
		Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

	let plan: ToolingOpenPlan;
	try {
		plan = await tool.open({
			collectionFiles: list(tuple.options.collectionFiles),
			envFiles: list(tuple.options.envFiles),
			repoRoot,
		});
	} catch (err) {
		say(row(tool.providerName, "fail", describeError(err)));
		return finish();
	}
	// Only the layers asked for are filled; a want of another layer is named, never read.
	const loaded = plan.wants.filter((want) => layers.includes(want.layer as OpenLayer));
	const notLoaded = plan.wants.filter((want) => !layers.includes(want.layer as OpenLayer));
	const names = [...new Set(loaded.map((want) => want.name))].sort();
	if (plan.unfilled.length > 0) {
		say(
			row(
				"unfilled",
				"skip",
				`${plan.unfilled.length} secret variable(s) refer to no entry, so nobody fills them`,
				plan.unfilled
			)
		);
	}

	say(
		row(
			"layers",
			notLoaded.length > 0 ? "skip" : "ok",
			`loaded: ${layers.join(", ")}; not loaded: ${OPEN_LAYERS.filter((layer) => !layers.includes(layer)).join(", ") || "none"}`,
			notLoaded.map(
				(want) =>
					`${want.collection}: ${want.variable} is a ${want.layer} secret (${want.name}); start with --environment ${want.layer} to load it`
			)
		)
	);

	if (dryRun) {
		for (const want of loaded) {
			say(
				row(
					want.variable,
					"ok",
					`would fill ${want.collection}'s ${want.variable} from ${want.entry} of ${want.layer} as ${want.name}`
				)
			);
		}
		if (names.length === 0) say(row("secrets", "ok", "nothing to fill: no variable refers to an entry"));
		else
			say(
				row(
					"secrets",
					"ok",
					`would write ${names.length} value(s) to ${SECRETS_FILE} and link it from ${plan.targets.length} collection(s)`
				)
			);
		say(row(plan.app, "ok", `would start ${plan.launch.command} in the foreground`));
		return finish();
	}
	if (deps.platform === "win32" && names.length > 0) {
		say(
			row(
				plan.app,
				"fail",
				"cannot make the values file private on Windows: its mode bits are not enforced, and a link needs rights it may lack"
			)
		);
		return finish();
	}

	// A running tool would not see the values, or would see another layer's: stop here, never kill it.
	let running: string;
	try {
		running = await deps.processes();
	} catch (err) {
		say(row(plan.app, "fail", `could not tell whether ${plan.app} is running: ${describeError(err)}`));
		return finish();
	}
	if (running.split("\n").some((line) => line.includes(plan.running))) {
		say(
			row(
				plan.app,
				"fail",
				`${plan.app} is already running; quit it and run this again (it would not see the values)`
			)
		);
		return finish();
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`open requests\` writes ${names.length} secret value(s) to a private file and starts ${plan.app}; pass --yes to run it without asking, or --dry-run to preview`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			names.length === 0
				? `Start ${plan.app} (nothing to fill)?`
				: `Read ${names.length} value(s) from ${layers.join(", ")} and start ${plan.app} with them?`
		);
		if (!proceed) {
			print(`  ${style.skip("cancelled; nothing was read or written")}`);
			return finish("cancelled");
		}
	}

	const values = new Map<string, string>();
	if (names.length > 0) {
		const vault = loader.has("vault") ? loader.get("vault") : undefined;
		if (!vault?.readEnvironmentEntries) {
			say(
				row(
					"vault",
					"fail",
					vault
						? `${vault.providerName} cannot read an Environment's entries`
						: "needs a `vault` provider in holocron.config.ts (1password)"
				)
			);
			return finish();
		}
		// Fail closed: a half-loaded set would sign with nothing, so any layer that cannot give every entry stops the run.
		let failed = false;
		for (const layer of layers) {
			const wanted = loaded.filter((want) => want.layer === layer);
			if (wanted.length === 0) continue;
			let read;
			try {
				read = await readEntryValues({
					vault: vault,
					environment: layer,
					configured: ownerEnvironments(input.loaded.resolved).names,
					repoRoot,
					names: [...new Set(wanted.map((want) => want.entry))].sort(),
				});
			} catch (err) {
				say(row(`vault ${layer}`, "fail", describeError(err)));
				failed = true;
				continue;
			}
			for (const entry of read.missing) {
				say(row(`${layer} ${entry}`, "fail", `${read.environmentId} holds no value for ${entry}`));
				failed = true;
			}
			if (read.missing.length > 0) continue;
			for (const want of wanted) values.set(want.name, read.values.get(want.entry) as string);
			say(
				row(
					`vault ${read.environmentId}`,
					"ok",
					`${wanted.length} value(s) read: ${[...new Set(wanted.map((want) => want.name))].join(", ")}`
				)
			);
		}
		if (failed) return finish();
	}

	const secrets = resolve(repoRoot, SECRETS_FILE);
	const lock = resolve(repoRoot, LOCK_FILE);
	const created: string[] = [];
	let cleaned = false;
	// Idempotent: runs from `finally`, from a signal and from `exit`, whichever comes first.
	const cleanup = () => {
		if (cleaned) return;
		cleaned = true;
		for (const link of plan.targets) {
			const state = deps.inspect(link);
			if (created.includes(link) && isOurs(state, link, secrets)) deps.remove(link);
		}
		if (created.includes(secrets)) deps.remove(secrets);
		deps.remove(lock);
	};

	deps.makeDir(dirname(secrets));
	if (!deps.takeLock(lock, deps.pid)) {
		say(
			row(
				plan.app,
				"fail",
				`another \`open requests\` is starting ${plan.app} (${LOCK_FILE} is held); try again when it has`
			)
		);
		return finish();
	}
	const stop = deps.onTerminate(cleanup);
	try {
		if (names.length > 0) {
			const ignored = deps.isIgnored(secrets);
			if (ignored === "tracked" || ignored === "unknown") {
				say(
					row(
						"values file",
						"fail",
						`refusing to write ${SECRETS_FILE}: git ${ignored === "tracked" ? "does not ignore it, so it could be committed" : "could not say whether it ignores it"}`,
						[ignoreAdvice(true, "")]
					)
				);
				return finish();
			}
			// Nothing is made until every place is known to be free or this command's own leftover.
			const stale = deps.inspect(secrets);
			if (stale.kind !== "none" && !(stale.kind === "file" && stale.firstLine === MARKER)) {
				say(row("values file", "fail", `${SECRETS_FILE} is not this command's (no marker line); move it away`));
				return finish();
			}
			for (const link of plan.targets) {
				const state = deps.inspect(link);
				if (state.kind !== "none" && !isOurs(state, link, secrets)) {
					say(
						row(
							"link",
							"fail",
							`${relative(repoRoot, link)} exists and is not this command's (it is not a link to ${SECRETS_FILE}, and has no marker line); move it away`
						)
					);
					return finish();
				}
			}
			const lines: string[] = [MARKER];
			for (const [name, value] of values) {
				const line = dotenvLine(name, value);
				if (line === null) {
					say(
						row(
							name,
							"fail",
							`the value of ${name} cannot be written to a .env file as it is; it was not written`
						)
					);
					return finish();
				}
				lines.push(line);
			}
			for (const link of plan.targets) deps.remove(link);
			deps.remove(secrets);
			deps.createPrivateFile(secrets, `${lines.join("\n")}\n`);
			created.push(secrets);
			for (const link of plan.targets) {
				deps.symlink(relative(dirname(link), secrets), link);
				created.push(link);
			}
			say(
				row(
					"values file",
					"ok",
					`${SECRETS_FILE} (mode 0600, git-ignored) linked from ${plan.targets.map((t) => relative(repoRoot, t)).join(", ")}`
				)
			);
		}
		print("");
		print(
			`starting ${plan.app}${names.length > 0 ? `; the values are removed when it quits (Ctrl-C ends it too)` : ""}`
		);
		let exitCode: number;
		try {
			exitCode = await deps.run(plan.launch);
		} catch (err) {
			say(row(plan.app, "fail", describeError(err)));
			return finish();
		}
		say(row(plan.app, exitCode === 0 ? "ok" : "fail", `ended with ${exitCode}`));
		return finish();
	} finally {
		stop();
		const wrote = created.includes(secrets);
		cleanup();
		if (wrote) print(style.dim(`  removed ${SECRETS_FILE} and its links`));
	}
}
