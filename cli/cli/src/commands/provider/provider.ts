/**
 * `holocron provider [<name> [setup|doctor]]` — what only one provider has. With nothing it lists the providers that
 * return a `setup` or a `doctor` from `createPlugin`; with a name it lists that provider's; with both it runs one.
 *
 * `doctor` is read-only and fails the run when a row fails. `setup` changes things: `--dry-run` reports what it would
 * change, and without `--dry-run` or `--yes` it asks first (and refuses to run without a terminal). A step that fails is
 * a row, not the end of the run. Whatever the provider prints is scrubbed of the tokens the run was given.
 */

import { confirm } from "@inquirer/prompts";
import {
	describeError,
	NonInteractiveError,
	printCheckRows,
	printCheckSummary,
	sanitizeDetail,
	statusRow,
	stripControl,
	style,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type ProviderActions, type ProviderRow } from "../../plugin/index.js";
import { createScrubber } from "../probe/index.js";
import type { ProviderActionName, ProviderReport, RunProviderInput } from "./provider.type.js";

const ACTIONS: readonly ProviderActionName[] = ["setup", "doctor"];

const fail = (print: (line: string) => void, ...text: string[]): ProviderReport => {
	print(statusRow("fail", text));
	return { status: "fail", rows: [] };
};

/** `linear: setup, doctor` lines for the providers given, sorted by name. */
function listing(groups: ReadonlyMap<string, ProviderActions>): string[] {
	const width = Math.max(0, ...[...groups.keys()].map((name) => name.length));
	return [...groups]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, actions]) => `  ${name.padEnd(width)}  ${ACTIONS.filter((a) => actions[a]).join(", ")}`);
}

export async function runProvider(input: RunProviderInput): Promise<ProviderReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "provider");

	const groups = loader.providerActions();
	if (!input.provider) {
		if (groups.size === 0) print("  no configured provider offers `setup` or `doctor`");
		else {
			print(style.header("Providers with their own setup and doctor"));
			for (const line of listing(groups)) print(line);
		}
		return { status: "listed", rows: [] };
	}
	const actions = groups.get(input.provider);
	if (!actions) {
		return fail(
			print,
			`no configured provider \`${input.provider}\` offers \`setup\` or \`doctor\``,
			groups.size > 0 ? `try: ${[...groups.keys()].sort().join(", ")}` : "none does"
		);
	}
	if (!input.action) {
		for (const line of listing(new Map([[input.provider, actions]]))) print(line);
		return { status: "listed", rows: [] };
	}
	const name = ACTIONS.find((a) => a === input.action);
	const run = name && actions[name];
	if (!name || !run) {
		return fail(
			print,
			`\`${input.provider}\` has no \`${input.action}\``,
			`try: ${ACTIONS.filter((a) => actions[a]).join(", ")}`
		);
	}

	const dryRun = input.context.dryRun ?? false;
	if (name === "setup" && !dryRun && !input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`provider ${input.provider} setup\` changes things on ${input.provider}; pass --yes to run it without asking, or --dry-run to preview`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`provider ${input.provider} setup changes things on ${input.provider}. Continue?`
		);
		if (!proceed) {
			print(`  ${style.skip("cancelled; nothing was changed")}`);
			return { status: "cancelled", rows: [] };
		}
	}

	const scrub = createScrubber(
		[input.context.cliToken, ...Object.values(input.context.cliTokens ?? {})].filter(
			(t): t is string => typeof t === "string"
		)
	);
	const clean = (text: string): string => scrub(sanitizeDetail(stripControl(text)));

	print(style.header(`Holocron provider ${input.provider} ${name}${dryRun ? " (dry-run)" : ""}`));
	print("");
	let rows: ProviderRow[];
	try {
		rows = await run({ dryRun });
	} catch (err) {
		rows = [
			{
				id: `${input.provider}:${name}`,
				title: `${input.provider} ${name}`,
				status: "fail",
				detail: describeError(err),
				problems: [],
			},
		];
	}
	rows = rows.map((row) => ({
		...row,
		title: clean(row.title),
		detail: clean(row.detail),
		problems: row.problems.map(clean),
	}));

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);
	const status = summary.fail > 0 ? "fail" : "ok";
	getLogger().info({ ...summary, status }, `provider ${input.provider} ${name}`);
	return { status, rows };
}
