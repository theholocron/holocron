import type { MenuEntry } from "@theholocron/kyber/menu";
import { describe, expect, it } from "vitest";
import yargs from "yargs";

import { COMMAND_MODULES } from "../../cli/command-modules/index.js";
import type { PluginProbes } from "../../plugin/index.js";
import { buildProbeMenuEntries } from "../probe-menu-entries/index.js";
import { buildRunMenuEntries } from "../run-menu-entries/index.js";
import { COMMAND_REGISTRY } from "./command-catalog.js";

/**
 * The options every command shares: the binary's own (declared in `cli.ts`) and yargs' built-ins. The menu forwards some
 * of them itself and the rest are not a command's own choice, so none of them is a menu decision per command.
 */
const GLOBAL_OPTIONS = new Set([
	"help",
	"version",
	"dry-run",
	"token",
	"cwd",
	"org",
	"skip-dry-run",
	"verbose",
	"debug",
	"quiet",
	"log",
]);

/** The `--long` names in the `Options:` block of a command's `--help`, as yargs prints them. */
async function helpOptions(command: string): Promise<string[]> {
	const output = await new Promise<string>((resolve) => {
		yargs([])
			.scriptName("")
			.command(COMMAND_MODULES)
			.exitProcess(false)
			.help()
			.version(false)
			.parse([...command.split(" "), "--help"], {}, (_err: unknown, _argv: unknown, text: string) =>
				resolve(text)
			);
	});
	const names: string[] = [];
	let inOptions = false;
	for (const line of output.split("\n")) {
		if (line === "Options:") inOptions = true;
		else if (line.trim() === "") inOptions = false;
		else if (inOptions) {
			// An option starts in the second column; a description that wraps onto the next line is indented much further.
			const head = /^ {2}((?:-\w,?\s+)?(?:--[\w[\]-]+,?\s*)+)/.exec(line)?.[1];
			for (const flag of head?.match(/--[\w-]+/g) ?? []) names.push(flag.slice(2));
		}
	}
	return names.filter((name) => !GLOBAL_OPTIONS.has(name));
}

/** The flags an entry makes a decision about: the ones it offers (in `options` or in any mode) and the ones it skips. */
function decided(entry: MenuEntry): Set<string> {
	const offered = [...(entry.options ?? []), ...(entry.modes ?? []).flatMap((mode) => mode.options ?? [])];
	const modeFlags = (entry.modes ?? []).flatMap((mode) => (mode.flag ? [mode.flag] : []));
	return new Set(
		[...offered.map((option) => option.flag), ...modeFlags]
			.map((flag) => flag.replace(/^--/, ""))
			.concat(entry.skipOptions ?? [])
	);
}

describe("the menu's decision about every command option (spec tech-interactive-menu-options, #1052)", () => {
	it("reads the options of a command from its help", async () => {
		expect(await helpOptions("migrate issues")).toEqual(expect.arrayContaining(["from", "to", "limit"]));
		expect(await helpOptions("migrate issues")).not.toContain("dry-run");
	});

	it.each(COMMAND_REGISTRY.map((entry) => [entry.name, entry] as const))(
		"%s offers or skips each of its options",
		async (name, entry) => {
			const known = decided(entry);
			const undecided = (await helpOptions(name)).filter((option) => !known.has(option));
			expect(
				undecided,
				`\`${name}\` has options the menu neither offers nor skips (add them to \`options\` or \`skipOptions\` in its entry)`
			).toEqual([]);
		}
	);

	it.each(COMMAND_REGISTRY.map((entry) => [entry.name, entry] as const))(
		"%s names only options the command has",
		async (name, entry) => {
			const real = new Set([...(await helpOptions(name)), ...GLOBAL_OPTIONS]);
			const stale = [...decided(entry)].filter((option) => !real.has(option));
			expect(stale, `\`${name}\` declares options the command no longer has`).toEqual([]);
		}
	);
});

describe("the entries the menu builds from the repo and the plugins", () => {
	/** What the child is spawned with is what yargs sees, so that is the command whose options have to be decided. */
	const command = (entry: MenuEntry) => (entry.spawnArgs ?? entry.name.split(" ")).join(" ");

	const probes = new Map<string, PluginProbes>([
		["github", { token: { summary: "Check a token", writes: false } } as unknown as PluginProbes],
	]);
	const built = [...buildRunMenuEntries(["verification.unitTests", "typecheck"]), ...buildProbeMenuEntries(probes)];

	it("has something to check", () => {
		expect(built.length).toBeGreaterThan(2);
	});

	it.each(built.map((entry) => [entry.name, entry] as const))(
		"%s offers or skips each of its options",
		async (_name, entry) => {
			const known = decided(entry);
			const undecided = (await helpOptions(command(entry))).filter((option) => !known.has(option));
			expect(undecided).toEqual([]);
		}
	);
});
