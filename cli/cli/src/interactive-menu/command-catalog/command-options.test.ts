import type { MenuEntry } from "@theholocron/kyber/menu";
import { describe, expect, it } from "vitest";
import yargs from "yargs";

import { COMMAND_MODULES } from "../../cli/command-modules/index.js";
import { COMMAND_CONTEXTS } from "../../commands/contexts/index.js";
import type { PluginProbes } from "../../plugin/index.js";
import { buildProbeMenuEntries } from "../probe-menu-entries/index.js";
import { buildRunMenuEntries } from "../run-menu-entries/index.js";
import { COMMAND_REGISTRY } from "./command-catalog.js";

/**
 * Only yargs' own: the binary's global options (`--dry-run`, `--token`, `--org`, ...) are added in `cli.ts` to the root, not
 * to this instance, so one that shows up in a command's help is that command's own (as `new repo --org` is) and needs
 * a decision like any other.
 */
const YARGS_OPTIONS = new Set(["help", "version"]);

/** The help text yargs prints for a command path, from an instance with every command the binary registers. */
async function helpText(path: string[]): Promise<string> {
	return new Promise<string>((resolve) => {
		yargs([])
			.scriptName("")
			.command(COMMAND_MODULES)
			.exitProcess(false)
			.help()
			.version(false)
			.parse([...path, "--help"], {}, (_err: unknown, _argv: unknown, text: string) => resolve(text));
	});
}

/** The `--long` names in the `Options:` block of a command's `--help`, as yargs prints them. */
async function helpOptions(command: string): Promise<string[]> {
	const names: string[] = [];
	let inOptions = false;
	for (const line of (await helpText(command.split(" "))).split("\n")) {
		if (line === "Options:") inOptions = true;
		else if (line.trim() === "") inOptions = false;
		else if (inOptions) {
			// An option starts in the second column; a description that wraps onto the next line is indented much further.
			const head = /^ {2}((?:-\w,?\s+)?(?:--[\w.[\]-]+,?\s*)+)/.exec(line)?.[1];
			for (const flag of head?.match(/--[\w.-]+/g) ?? []) names.push(flag.slice(2));
		}
	}
	return names.filter((name) => !YARGS_OPTIONS.has(name));
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

/** Both directions for one entry: every option decided, and every decision about an option the command still has. */
async function checkEntry(command: string, entry: MenuEntry): Promise<{ undecided: string[]; stale: string[] }> {
	const real = await helpOptions(command);
	const known = decided(entry);
	return {
		undecided: real.filter((option) => !known.has(option)),
		stale: [...known].filter((option) => !real.includes(option)),
	};
}

describe("the menu's decision about every command option (spec tech-interactive-menu-options, #1052)", () => {
	it("reads the options of a command from its help", async () => {
		expect(await helpOptions("migrate issues")).toEqual(expect.arrayContaining(["from", "to", "limit"]));
		expect(await helpOptions("migrate issues")).not.toContain("dry-run");
	});

	it.each(COMMAND_REGISTRY.map((entry) => [entry.name, entry] as const))(
		"%s offers or skips each of its options, and names only options it has",
		async (name, entry) => {
			expect(await checkEntry(name, entry)).toEqual({ undecided: [], stale: [] });
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
		"%s offers or skips each of its options, and names only options it has",
		async (_name, entry) => {
			expect(await checkEntry(command(entry), entry)).toEqual({ undecided: [], stale: [] });
		}
	);
});

/** The subcommand paths a command's help lists under `Commands:` (`new repo [type]` is `new repo`). */
async function subcommands(path: string[]): Promise<string[][]> {
	const found: string[][] = [];
	let inCommands = false;
	for (const line of (await helpText(path)).split("\n")) {
		if (line === "Commands:") inCommands = true;
		else if (line.trim() === "") inCommands = false;
		else if (inCommands) {
			const head = /^ {2}(\S.*?)(?: {2,}|$)/.exec(line)?.[1];
			if (head) found.push(head.split(/\s+/).filter((word) => !/^[[<]/.test(word)));
		}
	}
	return found;
}

describe("the commands the binary registers", () => {
	it("are all on the documented surface, so each has a context and a menu decision", async () => {
		const known = Object.keys(COMMAND_CONTEXTS);
		const onSurface = (path: string) => known.includes(path) || known.some((name) => name.startsWith(`${path} `));
		const unknown: string[] = [];
		const walk = async (path: string[]): Promise<void> => {
			for (const child of await subcommands(path)) {
				const name = child.join(" ");
				if (!onSurface(name)) unknown.push(name);
				else if (child.length > path.length && child.length < 3) await walk(child);
			}
		};
		await walk([]);
		expect(
			unknown,
			"a command yargs registers that COMMAND_CONTEXTS (and so the menu registry) does not know"
		).toEqual([]);
	});
});
