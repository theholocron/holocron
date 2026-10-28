import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CommandModule } from "yargs";

import type { GlobalArgs } from "../../cli-support/index.js";
import { buildRunMenuEntries, COMMAND_REGISTRY, launchMenu, listRunnableTasks } from "../../interactive-menu/index.js";
import { style } from "../../ui/index.js";

/**
 * Print the dim version line once per terminal session — keyed by the
 * parent shell's PID, since that's stable across repeated bare `holocron`
 * invocations in the same shell but changes in a new tab/window. A marker
 * file in the OS tmpdir tracks whether this shell has already seen it, so
 * re-running `holocron` doesn't repeat the line every time.
 */
export function printVersionHeaderOnce(version: string): void {
	const marker = join(tmpdir(), `.holocron-version-shown-${process.ppid}`);
	if (existsSync(marker)) return;
	console.log(style.dim(`v${version}`));
	writeFileSync(marker, "");
}

/** Bare `holocron` (hidden from --help): a menu of every command, with this repo's runnable tasks merged in. */
export const menuCommand = (version: string): CommandModule<GlobalArgs, GlobalArgs> => ({
	command: "$0",
	describe: false,
	builder: (y) => y,
	handler: async (argv) => {
		printVersionHeaderOnce(version);
		const runEntries = buildRunMenuEntries(await listRunnableTasks(argv));
		await launchMenu([...COMMAND_REGISTRY, ...runEntries], argv);
	},
});
